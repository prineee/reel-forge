import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase.from('users') as any)
    .select('name, plan, credits')
    .eq('id', user.id)
    .single() as { data: { name: string | null; plan: string; credits: number } | null }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar credits={profile?.credits ?? 0} plan={profile?.plan ?? 'free'} />
      <div className="flex-1 flex flex-col ml-64 min-h-screen overflow-auto">
        <Header
          userEmail={user.email}
          userName={profile?.name ?? user.user_metadata?.full_name ?? undefined}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
