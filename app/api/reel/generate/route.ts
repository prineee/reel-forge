import { NextResponse } from 'next/server'
import { requireCredits } from '@/lib/credits'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

interface Scene {
  number: number
  title: string
  duration: string
  voiceover: string
  visualNote: string
}

const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const
type OpenAIVoice = typeof VALID_VOICES[number]

// Returned when OpenAI TTS is rate-limited (429) — project is still saved
const RATE_LIMIT_FALLBACK_URL =
  'https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3'

export async function POST(request: Request) {
  console.log('[reel/generate] Request received')

  // Deducts 5 credits atomically — returns 402 if insufficient
  const check = await requireCredits('reel')
  if (!check.ok) {
    console.log('[reel/generate] Credit check failed')
    return check.response
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.log('[reel/generate] Unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { scenes?: Scene[]; voice?: string; title?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { scenes, voice: rawVoice, title } = body

  if (!scenes?.length) {
    return NextResponse.json({ error: 'scenes are required' }, { status: 400 })
  }

  // Default to nova; reject unknown voice names gracefully
  const voice: OpenAIVoice = VALID_VOICES.includes(rawVoice as OpenAIVoice)
    ? (rawVoice as OpenAIVoice)
    : 'nova'

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    console.error('[reel/generate] OPENAI_API_KEY not configured')
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  // Join all scene voiceovers separated by a natural pause
  const fullVoiceover = scenes
    .map((s) => s.voiceover.trim())
    .filter(Boolean)
    .join(' ... ')

  console.log('[reel/generate] Voiceover text:', fullVoiceover.length, 'chars, voice:', voice)

  // ── Step 1: OpenAI TTS ────────────────────────────────────────────────────
  let audioBuffer: ArrayBuffer | null = null
  let dataUrl = ''                    // base64 data URL — always populated on success
  let voiceUrl = ''                   // best URL for playback (Cloudinary > data URL)

  try {
    console.log('[reel/generate] Calling OpenAI TTS...')

    const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:           'tts-1',
        input:           fullVoiceover,
        voice,
        response_format: 'mp3',
      }),
    })

    console.log('[reel/generate] OpenAI TTS response status:', ttsRes.status)

    if (!ttsRes.ok) {
      // Parse error — OpenAI returns JSON for all errors
      const rawError = await ttsRes.text().catch(() => '')
      let errMsg = `OpenAI TTS error ${ttsRes.status}`
      try {
        const parsed = JSON.parse(rawError)
        errMsg = parsed?.error?.message ?? errMsg
      } catch { /* non-JSON body */ }

      console.error('[reel/generate] OpenAI TTS error:', ttsRes.status, errMsg)

      if (ttsRes.status === 429) {
        // Rate limited — use fallback so the project is still saved
        console.log('[reel/generate] Rate limited — using fallback audio URL')
        voiceUrl = RATE_LIMIT_FALLBACK_URL
      } else {
        return NextResponse.json({ error: errMsg }, { status: 502 })
      }
    } else {
      audioBuffer = await ttsRes.arrayBuffer()
      console.log('[reel/generate] OpenAI TTS success, audio bytes:', audioBuffer.byteLength)

      // Convert to base64 data URL for immediate browser playback
      const base64 = Buffer.from(audioBuffer).toString('base64')
      dataUrl = `data:audio/mpeg;base64,${base64}`
    }
  } catch (err) {
    console.error('[reel/generate] OpenAI TTS fetch threw:', err)
    return NextResponse.json(
      { error: `OpenAI TTS request failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    )
  }

  // ── Step 2: Upload to Cloudinary for permanent hosting (optional) ─────────
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey    = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (audioBuffer && cloudName && apiKey && apiSecret) {
    console.log('[reel/generate] Uploading audio to Cloudinary...')
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const folder    = 'reelforge/audio'
      const signature = crypto
        .createHash('sha1')
        .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
        .digest('hex')

      const form = new FormData()
      form.append('file',      dataUrl)   // reuse the base64 we already built
      form.append('api_key',   apiKey)
      form.append('timestamp', timestamp)
      form.append('signature', signature)
      form.append('folder',    folder)

      // Cloudinary uses /video/upload for audio files
      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
        { method: 'POST', body: form }
      )

      if (uploadRes.ok) {
        const uploadData = await uploadRes.json() as { secure_url?: string }
        voiceUrl = uploadData.secure_url ?? ''
        console.log('[reel/generate] Cloudinary upload success:', voiceUrl)
      } else {
        console.error('[reel/generate] Cloudinary upload failed:', uploadRes.status)
      }
    } catch (err) {
      console.error('[reel/generate] Cloudinary upload threw:', err)
      // Non-fatal — fall through to use data URL
    }
  } else if (!voiceUrl) {
    console.log('[reel/generate] No Cloudinary credentials — will use data URL for playback')
  }

  // If Cloudinary wasn't configured or failed, fall back to the data URL
  if (!voiceUrl) voiceUrl = dataUrl

  // ── Step 3: Persist project + video in Supabase ───────────────────────────
  console.log('[reel/generate] Saving project to database...')

  const admin     = createAdminClient()
  const reelTitle = (title?.trim() || 'Untitled Reel').slice(0, 255)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project, error: projectErr } = await (admin.from('projects') as any)
    .insert({ user_id: user.id, title: reelTitle, type: 'reel', status: 'completed' })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (projectErr || !project) {
    console.error('[reel/generate] project insert failed:', projectErr?.message)
    return NextResponse.json({ error: 'Failed to save project to database' }, { status: 500 })
  }

  // Store Cloudinary URL in DB if available; never store the full data URL (too large)
  const dbVoiceUrl = voiceUrl.startsWith('data:') ? null : voiceUrl

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: video, error: videoErr } = await (admin.from('videos') as any)
    .insert({
      project_id: project.id,
      script:     JSON.stringify(scenes),
      voice_url:  dbVoiceUrl,
    })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (videoErr || !video) {
    console.error('[reel/generate] video insert failed:', videoErr?.message)
    return NextResponse.json({ error: 'Failed to save video to database' }, { status: 500 })
  }

  const usedFallback = voiceUrl === RATE_LIMIT_FALLBACK_URL
  console.log(
    '[reel/generate] Done — projectId:', project.id,
    '| voiceUrl:', usedFallback ? 'FALLBACK' : voiceUrl.slice(0, 60),
  )

  return NextResponse.json({
    voiceUrl,                         // Cloudinary URL, data URL, or fallback
    dataUrl,                          // base64 data URL (empty string on rate-limit fallback)
    projectId:        project.id,
    videoId:          video.id,
    usedFallbackAudio: usedFallback,
  })
}
