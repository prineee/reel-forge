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
  const maxTokens  = Math.min(32000, config.scenes * 300 + 3000)

  const userPrompt = `Create a ${durMins}-minute ${genre} cartoon story based on this idea: "${prompt.trim()}"

Visual style: ${visual_style} — ${styleGuide}
Total scenes required: ${config.scenes}

Generate the following:

1. A compelling title (3-6 words)
2. A short storyline (2-3 sentences describing the full arc)
3. Exactly 2-4 named characters
4. Exactly ${config.scenes} scenes that tell the complete story

CHARACTER format:
- name: character's name
- role: "main" | "supporting" | "villain" | "narrator"
- description: physical appearance (1-2 sentences)
- visualPrompt: detailed fragment to include in every image prompt for visual consistency (20-30 words)
- personality: single sentence

SCENE format (each scene):
- number: sequential 1 to ${config.scenes}
- title: short scene title (3-5 words)
- narration: voiceover spoken aloud (~${config.wordsPerScene} words)
- visualDescription: what appears on screen (1 sentence)
- visualKeywords: exactly 3 specific visual search terms as array
- imagePrompt: complete AI image generation prompt (25-40 words, include "${styleGuide}")
- charactersInScene: array of character names present
- motionEffect: one of "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "ken_burns" | "static"
- duration_seconds: integer 4-8

Respond ONLY with valid JSON in this exact shape:
{
  "title": "Story Title",
  "storyline": "Two sentence summary of the complete story arc.",
  "characters": [
    {
      "name": "Hero Name",
      "role": "main",
      "description": "Physical description.",
      "visualPrompt": "young hero, brown hair, blue jacket, determined expression, ${visual_style} style",
      "personality": "Brave and curious."
    }
  ],
  "scenes": [
    {
      "number": 1,
      "title": "Scene Title",
      "narration": "Voiceover text here.",
      "visualDescription": "What appears on screen.",
      "visualKeywords": ["keyword1", "keyword2", "keyword3"],
      "imagePrompt": "Full image generation prompt here, ${styleGuide}",
      "charactersInScene": ["Hero Name"],
      "motionEffect": "ken_burns",
      "duration_seconds": 6
    }
  ]
}`

  try {
    const completion = await groq.chat.completions.create({
      model:    'llama-3.3-70b-versatile',
      messages: [
        {
          role:    'system',
          content: 'You are a professional cartoon story writer and visual director. Always respond with valid JSON only. Never include markdown fences.',
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
