import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface Voice {
  voice_id: string
  name: string
  language: string
  category: string
  preview_url: string
  gender: string
  accent: string
  description: string
  age: string
}

// Exactly 3 hardcoded fallbacks as specified — used when ElevenLabs is unavailable
const FALLBACK_VOICES: Voice[] = [
  {
    voice_id:    '21m00Tcm4TlvDq8ikWAM',
    name:        'Rachel - American Female',
    language:    'English',
    category:    'premade',
    preview_url: '',
    gender:      'female',
    accent:      'american',
    description: 'calm',
    age:         'young',
  },
  {
    voice_id:    'AZnzlk1XvdvUeBnXmlld',
    name:        'Domi - American Female',
    language:    'English',
    category:    'premade',
    preview_url: '',
    gender:      'female',
    accent:      'american',
    description: 'strong',
    age:         'young',
  },
  {
    voice_id:    'ErXwobaYiN019PkySvjV',
    name:        'Antoni - American Male',
    language:    'English',
    category:    'premade',
    preview_url: '',
    gender:      'male',
    accent:      'american',
    description: 'well-rounded',
    age:         'young',
  },
]

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.log('[voices] Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    console.log('[voices] ELEVENLABS_API_KEY not set — returning fallback voices')
    return NextResponse.json({ voices: FALLBACK_VOICES })
  }

  console.log('[voices] Fetching voices from ElevenLabs...')

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      console.error('[voices] ElevenLabs API error:', res.status, res.statusText)
      return NextResponse.json({ voices: FALLBACK_VOICES })
    }

    const data = await res.json() as {
      voices: Array<{
        voice_id: string
        name: string
        category: string
        preview_url: string
        labels?: Record<string, string>
      }>
    }

    console.log('[voices] ElevenLabs returned', data.voices?.length ?? 0, 'voices')

    const voices: Voice[] = (data.voices ?? [])
      .filter((v) => v.category === 'premade' && v.preview_url)
      .slice(0, 12)
      .map((v) => ({
        voice_id:    v.voice_id,
        name:        v.name,
        language:    v.labels?.language    ?? 'English',
        category:    v.category,
        preview_url: v.preview_url ?? '',
        gender:      v.labels?.gender      ?? 'unknown',
        accent:      v.labels?.accent      ?? '',
        description: v.labels?.description ?? '',
        age:         v.labels?.age         ?? '',
      }))

    const result = voices.length ? voices : FALLBACK_VOICES
    console.log('[voices] Returning', result.length, 'voices (fallback:', voices.length === 0, ')')

    return NextResponse.json({ voices: result })
  } catch (err) {
    console.error('[voices] Fetch threw:', err)
    return NextResponse.json({ voices: FALLBACK_VOICES })
  }
}
