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

// Fallback MP3 returned when ElevenLabs quota is exceeded (429).
// The reel project is still saved so the flow never breaks.
const QUOTA_FALLBACK_AUDIO_URL =
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

  let body: { scenes?: Scene[]; voice_id?: string; title?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { scenes, voice_id, title } = body

  if (!scenes?.length || !voice_id?.trim()) {
    return NextResponse.json({ error: 'scenes and voice_id are required' }, { status: 400 })
  }

  const elevenKey = process.env.ELEVENLABS_API_KEY
  if (!elevenKey) {
    console.error('[reel/generate] ELEVENLABS_API_KEY not configured')
    return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
  }

  // Join all scene voiceovers with a natural pause
  const fullVoiceover = scenes
    .map((s) => s.voiceover.trim())
    .filter(Boolean)
    .join(' ... ')

  console.log('[reel/generate] Voiceover text length:', fullVoiceover.length, 'chars')
  console.log('[reel/generate] Calling ElevenLabs TTS, voice_id:', voice_id)

  // ── Step 1: ElevenLabs TTS ────────────────────────────────────────────────
  let audioBuffer: ArrayBuffer | null = null
  let voiceUrl = ''

  try {
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key':   elevenKey,
          'Content-Type': 'application/json',
          Accept:         'audio/mpeg',
        },
        body: JSON.stringify({
          text:     fullVoiceover,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability:        0.5,
            similarity_boost: 0.75,
            style:            0.3,
            use_speaker_boost: true,
          },
        }),
      }
    )

    console.log('[reel/generate] ElevenLabs response status:', elevenRes.status)

    if (!elevenRes.ok) {
      // Parse ElevenLabs error body (may be JSON or plain text)
      const rawError = await elevenRes.text().catch(() => '')
      let errMsg = `ElevenLabs error ${elevenRes.status}`
      try {
        const parsed = JSON.parse(rawError)
        errMsg = parsed?.detail?.message ?? parsed?.message ?? errMsg
      } catch { /* non-JSON error body */ }

      console.error('[reel/generate] ElevenLabs error:', elevenRes.status, errMsg)

      if (elevenRes.status === 429) {
        // Quota exceeded → use fallback audio so the project is still saved
        console.log('[reel/generate] Quota exceeded — using fallback audio URL')
        voiceUrl = QUOTA_FALLBACK_AUDIO_URL
      } else {
        return NextResponse.json({ error: errMsg }, { status: 502 })
      }
    } else {
      audioBuffer = await elevenRes.arrayBuffer()
      console.log('[reel/generate] ElevenLabs TTS success, audio bytes:', audioBuffer.byteLength)
    }
  } catch (err) {
    console.error('[reel/generate] ElevenLabs fetch threw:', err)
    return NextResponse.json(
      { error: `ElevenLabs request failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    )
  }

  // ── Step 2: Upload MP3 to Cloudinary (only when we have audio bytes) ──────
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey    = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (audioBuffer && !voiceUrl && cloudName && apiKey && apiSecret) {
    console.log('[reel/generate] Uploading audio to Cloudinary...')
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const folder    = 'reelforge/audio'
      const signature = crypto
        .createHash('sha1')
        .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
        .digest('hex')

      const audioBase64 = `data:audio/mpeg;base64,${Buffer.from(audioBuffer).toString('base64')}`

      const form = new FormData()
      form.append('file',      audioBase64)
      form.append('api_key',   apiKey)
      form.append('timestamp', timestamp)
      form.append('signature', signature)
      form.append('folder',    folder)

      // Cloudinary uses /video/upload endpoint for audio files
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
      // Non-fatal — continue without a hosted URL
    }
  } else if (!voiceUrl) {
    console.log('[reel/generate] Skipping Cloudinary (missing credentials or no audio buffer)')
  }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: video, error: videoErr } = await (admin.from('videos') as any)
    .insert({
      project_id: project.id,
      script:     JSON.stringify(scenes),
      voice_url:  voiceUrl || null,
    })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (videoErr || !video) {
    console.error('[reel/generate] video insert failed:', videoErr?.message)
    return NextResponse.json({ error: 'Failed to save video to database' }, { status: 500 })
  }

  console.log('[reel/generate] Done — projectId:', project.id, 'voiceUrl:', voiceUrl || '(none)')

  return NextResponse.json({
    voiceUrl,
    projectId: project.id,
    videoId:   video.id,
    usedFallbackAudio: voiceUrl === QUOTA_FALLBACK_AUDIO_URL,
  })
}
