import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const CREDIT_COSTS = {
  thumbnail: 1,  // AI image generation
  caption: 1,    // AI caption
  script: 1,     // AI script
  voiceover: 2,  // ElevenLabs TTS
  reel: 5,       // Full reel pipeline
} as const

export type CreditAction = keyof typeof CREDIT_COSTS

export type CreditCheckResult =
  | { ok: true;  userId: string }
  | { ok: false; response: NextResponse }

/**
 * Verifies the caller is authenticated and has enough credits, then atomically
 * deducts them. Returns { ok: true, userId } or { ok: false, response } where
 * response is a 401 (unauth) or 402 (insufficient credits) NextResponse.
 *
 * Usage in an API route:
 *   const check = await requireCredits('thumbnail')
 *   if (!check.ok) return check.response
 */
export async function requireCredits(action: CreditAction): Promise<CreditCheckResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const cost = CREDIT_COSTS[action]

  // Read current balance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase.from('users') as any)
    .select('credits')
    .eq('id', user.id)
    .single() as { data: { credits: number } | null }

  const current = profile?.credits ?? 0

  if (current < cost) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Insufficient credits', credits: current, required: cost },
        { status: 402 }
      ),
    }
  }

  // Atomic deduction with guard — UPDATE only runs if credits >= cost at DB level
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated } = await (supabase.from('users') as any)
    .update({ credits: current - cost })
    .eq('id', user.id)
    .gte('credits', cost)
    .select('credits')
    .single() as { data: { credits: number } | null }

  if (!updated) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Insufficient credits', credits: 0, required: cost },
        { status: 402 }
      ),
    }
  }

  return { ok: true, userId: user.id }
}
