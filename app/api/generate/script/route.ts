import { NextResponse } from 'next/server'
import { requireCredits } from '@/lib/credits'

export interface Scene {
  number: number
  title: string
  duration: string
  voiceover: string
  visualNote: string
}

export interface ScriptResult {
  title: string
  scenes: Scene[]
}

const PLATFORM_CONTEXT: Record<string, string> = {
  Reels:  'Instagram Reels — vertical 9:16, music-friendly, fast cuts, hooks in first 1 second',
  Shorts: 'YouTube Shorts — slightly more educational, end with subscribe CTA, 16–60 seconds',
  TikTok: 'TikTok — trend-aware, conversational, duet-friendly, strong pattern interrupt opener',
}

export async function POST(request: Request) {
  const check = await requireCredits('script')
  if (!check.ok) return check.response

  const body = await request.json()
  const { productName, targetAudience, platform } = body as {
    productName?: string
    targetAudience?: string
    platform?: string
  }

  if (!productName?.trim() || !targetAudience?.trim()) {
    return NextResponse.json({ error: 'productName and targetAudience are required' }, { status: 400 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured on the server' }, { status: 500 })
  }

  const platformName = platform ?? 'Reels'
  const platformGuide = PLATFORM_CONTEXT[platformName] ?? platformName

  const prompt = `You are an expert short-form video script writer specialising in viral 60-second ${platformName} content.

Platform: ${platformName} — ${platformGuide}
Product / Topic: ${productName}
Target Audience: ${targetAudience}

Write a complete 60-second script split into exactly 5 scenes (~12 seconds each).
Each scene has a fixed storytelling role:
- Scene 1 (0:00–0:12): HOOK — grab attention in the first 2 words, create instant curiosity
- Scene 2 (0:12–0:24): PROBLEM — agitate the specific pain the audience feels every day
- Scene 3 (0:24–0:36): SOLUTION — introduce the product/idea as the natural answer
- Scene 4 (0:36–0:48): PROOF — one compelling stat, testimonial snippet, or before/after
- Scene 5 (0:48–1:00): CTA — urgent, specific call-to-action optimised for ${platformName}

Rules:
- voiceover should sound natural when spoken aloud — no bullet points
- visualNote is a crisp director's note: what's on screen, camera angle, b-roll type
- title must be catchy and under 8 words
- Optimise pacing and language specifically for ${platformName}

Respond ONLY with valid JSON and nothing else:
{
  "title": "Short catchy reel title",
  "scenes": [
    {
      "number": 1,
      "title": "Scene title",
      "duration": "0:00–0:12",
      "voiceover": "Exact words spoken in this scene",
      "visualNote": "What appears on screen / b-roll description"
    }
  ]
}`

  let openAIRes: Response
  try {
    openAIRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a short-form video script writer. Always respond with valid JSON only — no markdown, no commentary.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.75,
        max_tokens: 1400,
        response_format: { type: 'json_object' },
      }),
    })
  } catch {
    return NextResponse.json({ error: 'Failed to reach OpenAI. Check your network.' }, { status: 502 })
  }

  if (!openAIRes.ok) {
    const errBody = await openAIRes.json().catch(() => ({}))
    const message = (errBody as { error?: { message?: string } }).error?.message ?? `OpenAI error ${openAIRes.status}`
    return NextResponse.json({ error: message }, { status: openAIRes.status })
  }

  const data = await openAIRes.json()
  const raw: string = data.choices?.[0]?.message?.content ?? ''

  const jsonStr = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')

  try {
    const result = JSON.parse(jsonStr) as ScriptResult
    if (!result.title || !Array.isArray(result.scenes) || result.scenes.length === 0) {
      throw new Error('Incomplete response')
    }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { error: 'AI returned malformed output. Please try again.' },
      { status: 500 }
    )
  }
}
