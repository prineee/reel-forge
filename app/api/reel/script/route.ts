import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Groq from 'groq-sdk'

export interface Scene {
  number: number
  title: string
  duration: string
  voiceover: string
  visualNote: string
}

export interface ReelScript {
  title: string
  scenes: Scene[]
}

const PLATFORM_GUIDE: Record<string, string> = {
  Reels:  'Instagram Reels — vertical 9:16, fast-paced, emotional hook in first 2 words',
  Shorts: 'YouTube Shorts — informative, retain viewer for 60s, subscribe CTA at end',
  TikTok: 'TikTok — conversational, trend-aware, highly shareable, strong pattern interrupt',
}

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { topic, niche, platform } = body as {
    topic?: string
    niche?: string
    platform?: string
  }

  if (!topic?.trim()) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 })
  }

  const groqApiKey = process.env.GROQ_API_KEY
  if (!groqApiKey) {
    return NextResponse.json({ error: 'Groq API key not configured' }, { status: 500 })
  }

  const p     = platform ?? 'Reels'
  const guide = PLATFORM_GUIDE[p] ?? p

  const prompt = `You are a viral short-form video script writer specialising in ${p} content.

Topic: ${topic}
Niche: ${niche ?? 'General'}
Platform: ${p} — ${guide}

Write a complete 60-second voiceover script split into exactly 5 scenes (~12 seconds each).
Storytelling structure:
- Scene 1 (0:00–0:12): HOOK — first 3 words must STOP the scroll; instant curiosity or bold claim
- Scene 2 (0:12–0:24): PROBLEM — agitate the pain point the audience feels daily
- Scene 3 (0:24–0:36): SOLUTION — introduce the answer naturally and compellingly
- Scene 4 (0:36–0:48): PROOF — one compelling stat, transformation, or vivid benefit
- Scene 5 (0:48–1:00): CTA — urgent, specific call-to-action for ${p}

Rules:
- voiceover must sound natural when spoken aloud — conversational, ~40–55 words per scene
- visualNote is a concise director's note: camera angle, b-roll type, text overlay idea
- title: catchy, under 8 words

Respond ONLY with valid JSON:
{
  "title": "Short catchy title",
  "scenes": [
    { "number": 1, "title": "Scene title", "duration": "0:00–0:12", "voiceover": "...", "visualNote": "..." }
  ]
}`

  const groq = new Groq({ apiKey: groqApiKey })

  let raw: string
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a viral short-form video script writer. Always respond with valid JSON only — no markdown, no commentary.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.75,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
    })
    raw = completion.choices[0]?.message?.content ?? ''
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Groq API error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const jsonStr = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')

  try {
    const result = JSON.parse(jsonStr) as ReelScript
    if (!result.title || !Array.isArray(result.scenes) || result.scenes.length === 0) {
      throw new Error('Incomplete')
    }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'AI returned malformed output. Please try again.' }, { status: 500 })
  }
}
