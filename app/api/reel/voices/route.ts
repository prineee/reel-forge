import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface Voice {
  voice_id: string
  name: string
  category: string
  preview_url: string
  gender: string
  accent: string
  description: string
  age: string
}

// Curated fallback when ElevenLabs API is unavailable
const FALLBACK_VOICES: Voice[] = [
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',  category: 'premade', preview_url: '', gender: 'female', accent: 'american',   description: 'calm',         age: 'young'       },
  { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi',    category: 'premade', preview_url: '', gender: 'female', accent: 'american',   description: 'strong',       age: 'young'       },
  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',   category: 'premade', preview_url: '', gender: 'female', accent: 'american',   description: 'soft',         age: 'young'       },
  { voice_id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli',    category: 'premade', preview_url: '', gender: 'female', accent: 'american',   description: 'emotional',    age: 'young'       },
  { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni',  category: 'premade', preview_url: '', gender: 'male',   accent: 'american',   description: 'well-rounded', age: 'young'       },
  { voice_id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh',    category: 'premade', preview_url: '', gender: 'male',   accent: 'american',   description: 'deep',         age: 'young'       },
  { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold',  category: 'premade', preview_url: '', gender: 'male',   accent: 'american',   description: 'crisp',        age: 'middle aged' },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',    category: 'premade', preview_url: '', gender: 'male',   accent: 'american',   description: 'deep',         age: 'middle aged' },
  { voice_id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam',     category: 'premade', preview_url: '', gender: 'male',   accent: 'american',   description: 'raspy',        age: 'young'       },
  { voice_id: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi',    category: 'premade', preview_url: '', gender: 'female', accent: 'american',   description: 'childlike',    age: 'young'       },
  { voice_id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',  category: 'premade', preview_url: '', gender: 'male',   accent: 'british',    description: 'authoritative', age: 'middle aged' },
  { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', category: 'premade', preview_url: '', gender: 'female', accent: 'british', description: 'seductive',    age: 'middle aged' },
]

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ voices: FALLBACK_VOICES })
  }

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return NextResponse.json({ voices: FALLBACK_VOICES })
    }

    const data = await res.json() as { voices: Array<{
      voice_id: string
      name: string
      category: string
      preview_url: string
      labels?: Record<string, string>
    }> }

    const voices: Voice[] = data.voices
      .filter((v) => v.category === 'premade' && v.preview_url)
      .slice(0, 12)
      .map((v) => ({
        voice_id:    v.voice_id,
        name:        v.name,
        category:    v.category,
        preview_url: v.preview_url ?? '',
        gender:      v.labels?.gender      ?? 'unknown',
        accent:      v.labels?.accent      ?? '',
        description: v.labels?.description ?? '',
        age:         v.labels?.age         ?? '',
      }))

    return NextResponse.json({ voices: voices.length ? voices : FALLBACK_VOICES })
  } catch {
    return NextResponse.json({ voices: FALLBACK_VOICES })
  }
}
