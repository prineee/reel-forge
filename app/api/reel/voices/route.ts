import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface Voice {
  voice_id: string      // OpenAI voice name sent directly to the TTS API
  name: string
  description: string
  gender: string        // female | male | neutral
  language: string
  category: string
  preview_url: string   // empty — OpenAI does not expose preview URLs
  accent: string
  age: string
}

// Static list — OpenAI TTS voices never change, no API call required
const OPENAI_VOICES: Voice[] = [
  {
    voice_id:    'nova',
    name:        'Nova',
    description: 'Warm & natural · great for general narration',
    gender:      'female',
    language:    'English',
    category:    'openai',
    preview_url: '',
    accent:      'american',
    age:         '',
  },
  {
    voice_id:    'alloy',
    name:        'Alloy',
    description: 'Neutral & balanced · versatile, works for anything',
    gender:      'neutral',
    language:    'English',
    category:    'openai',
    preview_url: '',
    accent:      'american',
    age:         '',
  },
  {
    voice_id:    'echo',
    name:        'Echo',
    description: 'Clear & direct · crisp delivery for narration',
    gender:      'male',
    language:    'English',
    category:    'openai',
    preview_url: '',
    accent:      'american',
    age:         '',
  },
  {
    voice_id:    'fable',
    name:        'Fable',
    description: 'Expressive & engaging · British accent storytelling',
    gender:      'male',
    language:    'English',
    category:    'openai',
    preview_url: '',
    accent:      'british',
    age:         '',
  },
  {
    voice_id:    'onyx',
    name:        'Onyx',
    description: 'Deep & authoritative · commanding and confident',
    gender:      'male',
    language:    'English',
    category:    'openai',
    preview_url: '',
    accent:      'american',
    age:         '',
  },
  {
    voice_id:    'shimmer',
    name:        'Shimmer',
    description: 'Bright & expressive · energetic and engaging',
    gender:      'female',
    language:    'English',
    category:    'openai',
    preview_url: '',
    accent:      'american',
    age:         '',
  },
]

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.log('[voices] Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[voices] Returning', OPENAI_VOICES.length, 'OpenAI TTS voices')
  return NextResponse.json({ voices: OPENAI_VOICES })
}
