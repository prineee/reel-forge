import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'
import { PLAN_BY_KEY, PLAN_CREDITS, type PlanKey } from '@/lib/plans'

// Razorpay sends raw JSON; read as text to verify HMAC before parsing
export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-razorpay-signature') ?? ''

  // Verify webhook signature (set RAZORPAY_WEBHOOK_SECRET in Razorpay dashboard)
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (webhookSecret) {
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex')

    if (expected !== signature) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
    }
  }

  let event: {
    event: string
    payload: { payment: { entity: { id: string; order_id: string; amount: number; notes: Record<string, string> } } }
  }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (event.event !== 'payment.captured') {
    return NextResponse.json({ received: true }) // Acknowledge non-handled events
  }

  const payment = event.payload.payment.entity
  const planKey = payment.notes?.plan as PlanKey
  const userId  = payment.notes?.user_id
  const planData = PLAN_BY_KEY[planKey]

  if (!planData || !userId) {
    console.warn('[razorpay/webhook] Missing plan or user_id in payment notes')
    return NextResponse.json({ received: true })
  }

  const admin = createAdminClient()
  const credits = PLAN_CREDITS[planData.dbPlan]

  await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from('users') as any)
      .update({ plan: planData.dbPlan, credits })
      .eq('id', userId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from('payments') as any).insert({
      user_id: userId,
      amount: Math.round(payment.amount / 100), // paise → rupees
      gateway: 'razorpay',
      status: 'completed',
      subscription_id: payment.id,
    }),
  ])

  // Credit 30% affiliate commission if this user was referred
  try {
    const amountUSD = planData.priceUSD
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.rpc as any)('credit_affiliate_commission', {
      p_user_id:        userId,
      p_payment_amount: amountUSD,
    })
  } catch {
    // Non-fatal
  }

  console.log(`[razorpay/webhook] payment.captured → user ${userId} upgraded to ${planData.dbPlan}`)
  return NextResponse.json({ received: true })
}
