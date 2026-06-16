import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Groq from 'groq-sdk'
import {
  DURATION_CONFIG,
  STYLE_PROMPTS,
  MOTION_SEQUENCE,
  type GenerateStoryRequest,
  type GeneratedCharacter,
  type GeneratedScene,
} from '@/lib/cartoon/types'

// Credit cost per duration tier — matches frontend DURATIONS constant
const CREDIT_COSTS: Record<number, number> = {
  1:  32,
  3:  65,
  5:  90,
  10: 150,
}

export async function POST(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Parse & validate input ──────────────────────────────────────────────────
  let body: GenerateStoryRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const {
    prompt,
    genre          = 'adventure',
    visual_style   = 'anime',
    duration_minutes = 1,
    voice_id       = 'tara',
  } = body

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  const durMins = ([1, 3, 5, 10] as number[]).includes(duration_minutes) ? duration_minutes : 1
  const config  = DURATION_CONFIG[durMins]
  const cost    = CREDIT_COSTS[durMins]

  // ── Credit check ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase.from('users') as any)
    .select('credits')
    .eq('id', user.id)
    .single() as { data: { credits: number } | null }

  const current = profile?.credits ?? 0
  if (current < cost) {
    return NextResponse.json(
      { error: 'Insufficient credits', credits: current, required: cost },
      { status: 402 }
    )
  }

  // Deduct credits via admin client (bypasses RLS)
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: deductError } = await (admin.from('users') as any)
    .update({ credits: current - cost })
    .eq('id', user.id)

  if (deductError) {
    console.error('[cartoon/generate-story] Credit deduction failed:', deductError.message)
    return NextResponse.json({ error: 'Failed to deduct credits' }, { status: 500 })
  }

  // ── Groq — generate story, characters, scenes ───────────────────────────────
  const groqApiKey = process.env.GROQ_API_KEY
  if (!groqApiKey) {
    return NextResponse.json({ error: 'Groq API key not configured' }, { status: 500 })
  }

  const groq       = new Groq({ apiKey: groqApiKey })
  const styleGuide = STYLE_PROMPTS[visual_style] ?? STYLE_PROMPTS['anime']
  // Per-tier output budget: input (~250 tokens) + max_tokens must stay under 12 000 TPM
  const MAX_TOKENS: Record<number, number> = { 1: 3500, 3: 7500, 5: 9500, 10: 11500 }
  const maxTokens  = MAX_TOKENS[durMins] ?? 3500

  const userPrompt = `${durMins}-min ${genre} cartoon. Idea: "${prompt.trim()}"
Style: ${visual_style} — ${styleGuide}
Scenes: exactly ${config.scenes}, ~${config.wordsPerScene} words narration each.

Return JSON with these exact keys:
{"title":string,"storyline":string,"characters":[{"name":string,"role":"main"|"supporting"|"villain"|"narrator","description":string,"visualPrompt":string,"personality":string}],"scenes":[{"number":int,"title":string,"narration":string,"visualDescription":string,"visualKeywords":[3 strings],"imagePrompt":string,"charactersInScene":[strings],"motionEffect":"zoom_in"|"zoom_out"|"pan_left"|"pan_right"|"ken_burns"|"static","duration_seconds":int}]}

Rules: 2-4 characters. Exactly ${config.scenes} scenes numbered 1-${config.scenes}. Each imagePrompt must include "${styleGuide}". Build a complete arc: setup → conflict → climax → resolution.`

  try {
    const completion = await groq.chat.completions.create({
      model:    'llama-3.3-70b-versatile',
      messages: [
        {
          role:    'system',
          content: 'Cartoon story writer. JSON only, no markdown.',
        },
        { role: 'user', content: userPrompt },
      ],
      temperature:     0.8,
      max_tokens:      maxTokens,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    const generated = JSON.parse(
      raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    ) as {
      title:      string
      storyline:  string
      characters: GeneratedCharacter[]
      scenes:     GeneratedScene[]
    }

    if (!generated.title || !generated.scenes?.length) {
      throw new Error('Groq returned incomplete story data')
    }

    // ── Insert cartoon_stories ────────────────────────────────────────────────
    const totalSeconds = generated.scenes.reduce(
      (sum: number, s: GeneratedScene) => sum + (s.duration_seconds ?? 6), 0
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: story, error: storyError } = await (supabase.from('cartoon_stories') as any)
      .insert({
        user_id:          user.id,
        title:            generated.title,
        prompt:           prompt.trim(),
        storyline:        generated.storyline,
        genre,
        visual_style,
        voice_id,
        status:           'draft',
        scene_count:      generated.scenes.length,
        credits_used:     cost,
        duration_seconds: totalSeconds,
      })
      .select('id')
      .single()

    if (storyError) {
      console.error('[cartoon/generate-story] Insert story failed:', storyError.message)
      return NextResponse.json({ error: storyError.message }, { status: 500 })
    }

    const storyId: string = story.id

    // ── Insert cartoon_characters ─────────────────────────────────────────────
    if (generated.characters?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('cartoon_characters') as any).insert(
        generated.characters.map((c: GeneratedCharacter) => ({
          user_id:       user.id,
          story_id:      storyId,
          name:          c.name,
          role:          c.role,
          description:   c.description,
          visual_prompt: c.visualPrompt,
          personality:   c.personality,
        }))
      )
    }

    // ── Insert cartoon_scenes ─────────────────────────────────────────────────
    if (generated.scenes?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('cartoon_scenes') as any).insert(
        generated.scenes.map((s: GeneratedScene, i: number) => ({
          story_id:            storyId,
          scene_number:        s.number ?? i + 1,
          title:               s.title,
          narration:           s.narration,
          image_prompt:        s.imagePrompt,
          visual_description:  s.visualDescription,
          visual_keywords:     Array.isArray(s.visualKeywords) ? s.visualKeywords : [],
          characters_in_scene: Array.isArray(s.charactersInScene) ? s.charactersInScene : [],
          visual_style,
          motion_effect:       MOTION_SEQUENCE[i % MOTION_SEQUENCE.length],
          duration_seconds:    s.duration_seconds ?? 6,
          image_status:        'pending',
        }))
      )
    }

    console.log(`[cartoon/generate-story] Created story ${storyId} — ${generated.scenes.length} scenes — ${cost} credits`)

    return NextResponse.json({
      success:          true,
      story_id:         storyId,
      title:            generated.title,
      storyline:        generated.storyline,
      genre,
      visual_style,
      scene_count:      generated.scenes.length,
      duration_minutes: durMins,
      characters:       generated.characters,
      scenes:           generated.scenes,
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Story generation failed'
    console.error('[cartoon/generate-story] Failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
