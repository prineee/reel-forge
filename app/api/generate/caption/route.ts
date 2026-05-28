import { NextResponse } from 'next/server'
import { requireCredits } from '@/lib/credits'

export async function POST(request: Request) {
  const check = await requireCredits('caption')
  if (!check.ok) return check.response

  const body = await request.json()
  const { topic, niche, tone } = body as { topic?: string; niche?: string; tone?: string }

  if (!topic?.trim() || !niche?.trim() || !tone?.trim()) {
    return NextResponse.json({ error: 'topic, niche, and tone are required' }, { status: 400 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured on the server' }, { status: 500 })
  }

  const prompt = `You are a viral social media caption writer.

Topic: ${topic}
Niche: ${niche}
Tone: ${tone}

Generate the following:
1. hookLine — 1-2 punchy sentences that stop scrolling instantly
2. caption — 150-200 words, natural language, emojis, ends with a call-to-action
3. hashtags — exactly 5 highly relevant hashtags including the # symbol

Respond ONLY with valid JSON and nothing else:
{"hookLine":"...","caption":"...","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"]}`

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
        temperature: 0.8,
        max_tokens: 800,
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

  // Strip markdown code fences GPT sometimes adds
  const jsonStr = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')

  try {
    const result = JSON.parse(jsonStr) as { hookLine: string; caption: string; hashtags: string[] }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { error: 'AI returned malformed output. Please try again.' },
      { status: 500 }
    )
  }
}
