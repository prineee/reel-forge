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

export async function POST(request: Request) {
  // Deducts 5 credits atomically
  const check = await requireCredits('reel')
  if (!check.ok) return check.response

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { scenes, voice_id, title } = body as {
    scenes?: Scene[]
    voice_id?: string
    title?: string
  }

  if (!scenes?.length || !voice_id?.trim()) {
    return NextResponse.json({ error: 'scenes and voice_id are required' }, { status: 400 })
  }

  const elevenKey = process.env.ELEVENLABS_API_KEY
  if (!elevenKey) {
    return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
  }

  // Build full voiceover by joining scene voiceovers with natural pauses
  const fullVoiceover = scenes
    .map((s) => s.voiceover.trim())
    .filter(Boolean)
    .join(' ... ')

  // ── Step 1: ElevenLabs TTS ──────────────────────────────────────────────
  let audioBuffer: ArrayBuffer
  try {
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: fullVoiceover,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    )

    if (!elevenRes.ok) {
      const errData = await elevenRes.json().catch(() => ({}))
      const msg = (errData as { detail?: { message?: string } }).detail?.message
        ?? `ElevenLabs error ${elevenRes.status}`
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    audioBuffer = await elevenRes.arrayBuffer()
  } catch (err) {
    return NextResponse.json({ error: `ElevenLabs request failed: ${String(err)}` }, { status: 502 })
  }

  // ── Step 2: Upload MP3 to Cloudinary ──────────────────────────────────
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey    = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  let voiceUrl    = ''

  if (cloudName && apiKey && apiSecret) {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const folder    = 'reelforge/audio'
      const signature = crypto
        .createHash('sha1')
        .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
        .digest('hex')

      // Encode MP3 as base64 data URL so Cloudinary accepts it as a file param
      const audioBase64 = `data:audio/mpeg;base64,${Buffer.from(audioBuffer).toString('base64')}`

      const form = new FormData()
      form.append('file',      audioBase64)
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
      }
    } catch {
      // Non-fatal — continue without Cloudinary URL
    }
  }

  // ── Step 3: Persist project + video in Supabase ───────────────────────
  const admin     = createAdminClient()
  const reelTitle = (title?.trim() || 'Untitled Reel').slice(0, 255)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project, error: projectErr } = await (admin.from('projects') as any)
    .insert({ user_id: user.id, title: reelTitle, type: 'reel', status: 'completed' })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (projectErr || !project) {
    console.error('[reel/generate] project insert failed:', projectErr)
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
    console.error('[reel/generate] video insert failed:', videoErr)
    return NextResponse.json({ error: 'Failed to save video to database' }, { status: 500 })
  }

  return NextResponse.json({ voiceUrl, projectId: project.id, videoId: video.id })
}
