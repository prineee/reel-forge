import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCredits } from '@/lib/credits'
import Replicate from 'replicate'
import Groq from 'groq-sdk'
import crypto from 'crypto'

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

  // Step 1: Generate a detailed Stability AI prompt via Groq
  let imagePrompt: string
  try {
    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) throw new Error('Groq API key not configured')

    const groq = new Groq({ apiKey: groqApiKey })
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'user',
          content: `You are an expert Stable Diffusion prompt engineer specializing in YouTube thumbnails.
Write a detailed image generation prompt for a thumbnail with:
- Title concept: "${title}"
- Content niche: ${niche}
- Visual style: ${style} — ${STYLE_PROMPTS[style] ?? ''}

Requirements:
• NO text, words, letters, or numbers visible anywhere in the image
• Photorealistic, highly detailed 4K scene
• Landscape 16:9 ratio (1280×720)
• Bold, eye-catching composition that draws attention
• Style-appropriate color grading

Reply with ONLY the prompt string. No explanation, no quotes.`,
        },
      ],
      max_tokens: 300,
      temperature: 0.75,
    })
    imagePrompt =
      completion.choices[0]?.message?.content?.trim() ??
      `${niche} themed scene, ${STYLE_PROMPTS[style]}, 4K photorealistic, vivid colors`
  } catch {
    imagePrompt = `${niche} YouTube thumbnail background, ${STYLE_PROMPTS[style] ?? ''}, 4K photorealistic, no text`
  }

  // Step 2: Generate image via Replicate stability-ai/sdxl
  const replicateAuth = process.env.REPLICATE_API_KEY ?? process.env.REPLICATE_API_TOKEN
  if (!replicateAuth) {
    return NextResponse.json({ error: 'Replicate API token not configured' }, { status: 500 })
  }

  const replicate = new Replicate({ auth: replicateAuth })
  let replicateImageUrl: string
  try {
    const output = (await replicate.run('stability-ai/sdxl', {
      input: {
        prompt: imagePrompt,
        negative_prompt:
          'text, words, letters, watermark, signature, blurry, low quality, deformed, ugly, noise, oversaturated',
        width: 1280,
        height: 720,
        num_outputs: 1,
        num_inference_steps: 30,
        guidance_scale: 7.5,
        scheduler: 'K_EULER_ANCESTRAL',
        refine: 'expert_ensemble_refiner',
        high_noise_frac: 0.8,
      },
    })) as string[]

    if (!output?.[0]) throw new Error('No output URL returned')
    replicateImageUrl = output[0]
  } catch (err) {
    return NextResponse.json({ error: 'Image generation failed', detail: String(err) }, { status: 502 })
  }

  // Step 3: Upload to Cloudinary
  let finalImageUrl = replicateImageUrl
  const cloudName   = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey      = process.env.CLOUDINARY_API_KEY
  const apiSecret   = process.env.CLOUDINARY_API_SECRET
  if (cloudName && apiKey && apiSecret) {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const folder    = 'reelforge/thumbnails'
      const signature = crypto
        .createHash('sha1')
        .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
        .digest('hex')

      const form = new FormData()
      form.append('file',      replicateImageUrl)
      form.append('api_key',   apiKey)
      form.append('timestamp', timestamp)
      form.append('signature', signature)
      form.append('folder',    folder)

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: form,
      })
      if (uploadRes.ok) {
        const uploadData = (await uploadRes.json()) as { secure_url?: string }
        if (uploadData.secure_url) finalImageUrl = uploadData.secure_url
      }
    } catch {
      // Fall back to Replicate URL
    }
  }

  // Step 4: Save record to Supabase thumbnails table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('thumbnails') as any).insert({
    user_id:   user.id,
    prompt:    imagePrompt,
    image_url: finalImageUrl,
    style:     STYLE_MAP[style] ?? 'cinematic',
  })

  return NextResponse.json({ imageUrl: finalImageUrl, prompt: imagePrompt })
}
