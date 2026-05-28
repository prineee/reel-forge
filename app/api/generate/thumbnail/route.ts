import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCredits } from '@/lib/credits'
import Replicate from 'replicate'
import Groq from 'groq-sdk'
import crypto from 'crypto'

// Raise the Next.js serverless timeout ceiling to 60 s
export const maxDuration = 60

const STYLE_PROMPTS: Record<string, string> = {
  MrBeast:
    'dramatic cinematic lighting, bold vibrant colors, extreme high contrast, energetic and intense, professional YouTube thumbnail style',
  Clean:
    'clean modern design, soft natural lighting, minimalist background, professional studio quality, crisp details',
  Dark: 'dark moody atmosphere, deep dramatic shadows, subtle neon accent glow, cinematic noir aesthetic',
  Minimal:
    'ultra minimalist composition, flat design elements, simple geometric shapes, muted sophisticated palette',
}

const STYLE_MAP: Record<string, 'realistic' | 'cartoon' | 'minimalist' | 'cinematic' | 'anime'> = {
  MrBeast: 'cinematic',
  Clean:   'minimalist',
  Dark:    'realistic',
  Minimal: 'minimalist',
}

/** Rejects after `ms` milliseconds with a clear timeout message. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ])
}

export async function POST(request: Request) {
  const check = await requireCredits('thumbnail')
  if (!check.ok) return check.response

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { title, niche, style } = body as { title?: string; niche?: string; style?: string }
  if (!title?.trim() || !niche || !style) {
    return NextResponse.json({ error: 'title, niche, and style are required' }, { status: 400 })
  }

  // ── Step 1: Build an image prompt with Groq ─────────────────────────────
  let imagePrompt: string
  try {
    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) throw new Error('GROQ_API_KEY not set')

    const groq = new Groq({ apiKey: groqApiKey })
    const completion = await withTimeout(
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'user',
            content: `You are an expert image-generation prompt engineer specializing in YouTube thumbnails.
Write a detailed prompt for a thumbnail with:
- Title concept: "${title}"
- Content niche: ${niche}
- Visual style: ${style} — ${STYLE_PROMPTS[style] ?? ''}

Requirements:
• NO text, words, letters, or numbers anywhere in the image
• Photorealistic, highly detailed 4K scene
• Landscape 16:9 composition (1280×720)
• Bold, eye-catching, draws attention instantly
• Style-appropriate colour grading

Reply with ONLY the prompt string. No explanation, no quotes.`,
          },
        ],
        max_tokens: 300,
        temperature: 0.75,
      }),
      10_000,
      'Groq prompt generation'
    )
    imagePrompt =
      completion.choices[0]?.message?.content?.trim() ??
      `${niche} themed scene, ${STYLE_PROMPTS[style]}, 4K photorealistic, vivid colors`
  } catch (groqErr) {
    console.error('[thumbnail] Groq prompt generation failed:', groqErr)
    imagePrompt = `${niche} YouTube thumbnail, ${STYLE_PROMPTS[style] ?? ''}, 4K photorealistic, no text, no watermark`
  }

  // ── Step 2: Generate image (Replicate → Pollinations fallback) ───────────
  let generatedImageUrl: string | null = null
  let imageSource: 'replicate' | 'pollinations' = 'replicate'

  // 2a. Try Replicate — flux-schnell (fast, reliable, free-tier friendly)
  const replicateAuth = process.env.REPLICATE_API_KEY ?? process.env.REPLICATE_API_TOKEN
  if (replicateAuth) {
    try {
      const replicate = new Replicate({ auth: replicateAuth })

      console.log('[thumbnail] Calling Replicate flux-schnell with prompt:', imagePrompt.slice(0, 120))

      const outputRaw = await withTimeout(
        replicate.run('black-forest-labs/flux-schnell', {
          input: {
            prompt: imagePrompt,
            aspect_ratio: '16:9',
            num_outputs: 1,
            num_inference_steps: 4,   // flux-schnell max is 4
            output_format: 'jpg',
            output_quality: 92,
            go_fast: true,
            disable_safety_checker: true,
          },
        }),
        55_000,
        'Replicate flux-schnell'
      )

      // The Replicate SDK may return plain strings or FileOutput objects
      // (FileOutput implements toString() → URL string)
      const outputArr = outputRaw as Array<string | { url(): string; toString(): string }>
      const first = outputArr?.[0]

      if (!first) throw new Error('Replicate returned empty output array')

      generatedImageUrl =
        typeof first === 'string'
          ? first
          : (typeof first.url === 'function' ? first.url() : null) ?? String(first)

      if (!generatedImageUrl || generatedImageUrl === 'null' || generatedImageUrl === 'undefined') {
        throw new Error(`Replicate output resolved to invalid URL: ${String(first)}`)
      }

      console.log('[thumbnail] Replicate succeeded:', generatedImageUrl)
    } catch (replicateErr) {
      // Log the full error so it's visible in Vercel / Railway logs
      console.error('[thumbnail] Replicate failed — falling back to Pollinations:', replicateErr)
      generatedImageUrl = null
    }
  } else {
    console.warn('[thumbnail] REPLICATE_API_KEY not set — skipping Replicate, using Pollinations')
  }

  // 2b. Pollinations.ai fallback (no API key required, free, synchronous URL)
  if (!generatedImageUrl) {
    imageSource = 'pollinations'
    const seed   = Math.floor(Math.random() * 1_000_000)
    const encoded = encodeURIComponent(imagePrompt)
    generatedImageUrl =
      `https://image.pollinations.ai/prompt/${encoded}` +
      `?width=1280&height=720&nologo=true&enhance=true&seed=${seed}`
    console.log('[thumbnail] Using Pollinations fallback URL:', generatedImageUrl)
  }

  // ── Step 3: Persist to Cloudinary (optional, non-fatal) ─────────────────
  let finalImageUrl = generatedImageUrl
  const cloudName  = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey     = process.env.CLOUDINARY_API_KEY
  const apiSecret  = process.env.CLOUDINARY_API_SECRET

  if (cloudName && apiKey && apiSecret && imageSource === 'replicate') {
    // Only upload Replicate URLs (direct CDN links); Pollinations URLs are lazy so uploading
    // server-side would time out here — the client proxy handles them fine.
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const folder    = 'reelforge/thumbnails'
      const signature = crypto
        .createHash('sha1')
        .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
        .digest('hex')

      const form = new FormData()
      form.append('file',      generatedImageUrl)
      form.append('api_key',   apiKey)
      form.append('timestamp', timestamp)
      form.append('signature', signature)
      form.append('folder',    folder)

      const uploadRes = await withTimeout(
        fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
          method: 'POST',
          body: form,
        }),
        15_000,
        'Cloudinary upload'
      )
      if (uploadRes.ok) {
        const uploadData = (await uploadRes.json()) as { secure_url?: string }
        if (uploadData.secure_url) {
          finalImageUrl = uploadData.secure_url
          console.log('[thumbnail] Cloudinary upload succeeded:', finalImageUrl)
        }
      } else {
        const errText = await uploadRes.text().catch(() => '')
        console.error('[thumbnail] Cloudinary upload failed:', uploadRes.status, errText.slice(0, 200))
      }
    } catch (cloudinaryErr) {
      console.error('[thumbnail] Cloudinary upload threw:', cloudinaryErr)
      // Non-fatal — fall back to the Replicate CDN URL
    }
  }

  // ── Step 4: Save to Supabase ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbError } = await (supabase.from('thumbnails') as any).insert({
    user_id:   user.id,
    prompt:    imagePrompt,
    image_url: finalImageUrl,
    style:     STYLE_MAP[style] ?? 'cinematic',
  })
  if (dbError) {
    console.error('[thumbnail] Supabase insert failed:', dbError)
    // Non-fatal — still return the image to the user
  }

  return NextResponse.json({
    imageUrl: finalImageUrl,
    prompt:   imagePrompt,
    source:   imageSource,   // lets the client show "Powered by Flux" vs "Powered by Pollinations"
  })
}
