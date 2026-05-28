import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, CreditCard, Zap, Image, Mic, Video, FileText } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'
import BillingClient from './BillingClient'
import type { DbPlan } from '@/lib/plans'

export const metadata = { title: 'Billing' }

const FREE_FEATURES = [
  '10 lifetime credits',
  '720p exports',
  'Watermarked output',
  'Community support',
]

const CREDIT_GUIDE = [
  { icon: Image,    label: 'AI Thumbnail',  cost: 1 },
  { icon: FileText, label: 'Script / Caption', cost: 1 },
  { icon: Mic,      label: 'Voiceover',     cost: 2 },
  { icon: Video,    label: 'Full Reel',     cost: 5 },
]

export default async function BillingPage() {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: payments }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('users') as any)
      .select('plan, credits, name')
      .eq('id', user.id)
      .single() as Promise<{ data: { plan: DbPlan; credits: number; name: string | null } | null }>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('payments') as any)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10) as Promise<{ data: Array<{ id: string; amount: number; gateway: string; status: string; created_at: string }> | null }>,
  ])

  const currentPlan = (profile?.plan ?? 'free') as DbPlan
  const credits     = profile?.credits ?? 0
  const isFreePlan  = currentPlan === 'free'

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Billing</h1>
        <p className="text-gray-400 text-sm">Manage your plan and payment history.</p>
      </div>

      {/* ── Current Plan Summary ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="w-12 h-12 rounded-xl bg-brand-950 border border-brand-800 flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6 text-brand-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-bold text-lg capitalize">{currentPlan} Plan</span>
                <Badge variant="info">Active</Badge>
              </div>
              <p className="text-sm text-gray-400">
                <span className="text-white font-semibold">{credits}</span> credits remaining
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Credit cost guide */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Credit Costs</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 pt-0">
            {CREDIT_GUIDE.map(({ icon: Icon, label, cost }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-gray-400">
                <Icon className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                <span>{label}</span>
                <span className="ml-auto text-white font-medium">{cost}cr</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Upgrade Plans ── */}
      <div>
        <h2 className="text-base font-semibold mb-2">
          {isFreePlan ? 'Choose a Plan' : 'Change Plan'}
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Indian users pay in ₹ via Razorpay · International users pay in $ via Stripe
        </p>
        <BillingClient currentPlan={currentPlan} userEmail={user.email ?? ''} />
      </div>

      {/* ── Free Plan Info ── */}
      {isFreePlan && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm font-medium mb-3 text-gray-300">Free Plan includes:</p>
            <ul className="grid grid-cols-2 gap-y-1.5 gap-x-4">
              {FREE_FEATURES.map(f => (
                <li key={f} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Check className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── Payment History ── */}
      <div>
        <h2 className="text-base font-semibold mb-4">Payment History</h2>
        <Card>
          {payments && payments.length > 0 ? (
            <div className="divide-y divide-surface-border">
              <div className="grid grid-cols-4 px-6 py-3 text-xs text-gray-500 font-medium uppercase tracking-wide">
                <span>Date</span>
                <span>Amount</span>
                <span>Gateway</span>
                <span>Status</span>
              </div>
              {payments.map(p => (
                <div key={p.id} className="grid grid-cols-4 px-6 py-4 text-sm items-center">
                  <span className="text-gray-400">{formatDate(p.created_at)}</span>
                  <span className="font-medium">{formatCurrency(p.amount)}</span>
                  <span className="capitalize text-gray-400">{p.gateway}</span>
                  <Badge
                    variant={
                      p.status === 'completed' ? 'success'
                      : p.status === 'failed'    ? 'danger'
                      : 'default'
                    }
                  >
                    {p.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <CardContent className="flex flex-col items-center py-10 text-center">
              <CreditCard className="w-8 h-8 text-gray-600 mb-3" />
              <p className="text-sm text-gray-500">No payments yet</p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}
