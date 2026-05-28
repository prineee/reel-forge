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

export async function POST(request: Request) {
  const check = await requireCredits('script')
  if (!check.ok) return check.response

  const body = await request.json()
  const { productName, targetAudience } = body as {
    productName?: string
    targetAudience?: string
  }

  if (!productName?.trim() || !targetAudience?.trim()) {
    return NextResponse.json({ error: 'productName and targetAudience are required' }, { status: 400 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured on the server' }, { status: 500 })
  }

  const prompt = `You are an expert short-form video script writer specializing in viral 60-second reels.

Product: ${productName}
Target Audience: ${targetAudience}

Write a complete 60-second reel script split into exactly 5 scenes (~12 seconds each).
Each scene has a distinct storytelling purpose:
- Scene 1 (0:00–0:12): HOOK — grab attention in the first 3 seconds, create instant curiosity
- Scene 2 (0:12–0:24): PROBLEM — agitate the pain point the target audience feels
- Scene 3 (0:24–0:36): SOLUTION — introduce the product as the natural answer
- Scene 4 (0:36–0:48): PROOF — one compelling benefit, stat, or testimonial snippet
- Scene 5 (0:48–1:00): CTA — urgent, specific call-to-action

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
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.75,
        max_tokens: 1200,
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
    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { error: 'AI returned malformed output. Please try again.' },
      { status: 500 }
    )
  }
}
