import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Video, Image, MessageSquare, FolderOpen, Zap, TrendingUp, Plus, ArrowRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: profile }, { data: projects }, { data: recentVideos }] = await Promise.all([
    (supabase.from('users') as any).select('*').eq('id', user.id).single() as
      Promise<{ data: { name: string | null; plan: string; credits: number } | null }>,
    (supabase.from('projects') as any).select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5) as
      Promise<{ data: Array<{ id: string; title: string; type: string; status: string; created_at: string }> | null }>,
    (supabase.from('videos') as any)
      .select('*, projects!inner(user_id, title)')
      .eq('projects.user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3) as Promise<{ data: unknown[] | null }>,
  ])

  const stats = [
    { label: 'Total Projects', value: projects?.length ?? 0, icon: FolderOpen, color: 'text-brand-400', bg: 'bg-brand-950 border-brand-800' },
    { label: 'Credits Left', value: profile?.credits ?? 0, icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-950 border-yellow-800' },
    { label: 'Videos Created', value: recentVideos?.length ?? 0, icon: Video, color: 'text-purple-400', bg: 'bg-purple-950 border-purple-800' },
    { label: 'Current Plan', value: profile?.plan ?? 'Free', icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-950 border-green-800' },
  ]

  const quickActions = [
    { href: '/create-reel', label: 'Create Reel', icon: Video, desc: 'AI-generated video reel' },
    { href: '/thumbnail',   label: 'New Thumbnail', icon: Image, desc: 'Generate thumbnail' },
    { href: '/captions',    label: 'Add Captions', icon: MessageSquare, desc: 'Auto-generate captions' },
    { href: '/projects',    label: 'My Projects', icon: FolderOpen, desc: 'View all projects' },
  ]

  const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
    completed: 'success',
    processing: 'info',
    draft: 'default',
    failed: 'danger',
  }

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold mb-1">
          Good day, {profile?.name?.split(' ')[0] ?? 'Creator'} 👋
        </h1>
        <p className="text-gray-400 text-sm">Here&apos;s what&apos;s happening with your content.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4">
              <div className={`w-11 h-11 rounded-lg border flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold capitalize">{s.value}</p>
                <p className="text-xs text-gray-400">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-base font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((a) => (
            <Link key={a.href} href={a.href}>
              <Card hover className="h-full">
                <CardContent className="flex flex-col items-center text-center gap-3 py-6">
                  <div className="w-11 h-11 rounded-xl bg-brand-950 border border-brand-800 flex items-center justify-center">
                    <a.icon className="w-5 h-5 text-brand-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{a.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Recent Projects</h2>
          <Link href="/projects" className="flex items-center gap-1 text-sm text-brand-400 hover:text-brand-300">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {projects && projects.length > 0 ? (
          <Card>
            <div className="divide-y divide-surface-border">
              {projects.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-6 py-4 hover:bg-surface-hover transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center border border-surface-border">
                      <Video className="w-4 h-4 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{p.title}</p>
                      <p className="text-xs text-gray-500">{formatDate(p.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="default">{p.type}</Badge>
                    <Badge variant={statusVariant[p.status] ?? 'default'}>{p.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <div className="w-14 h-14 rounded-full bg-surface border border-surface-border flex items-center justify-center mb-4">
                <Plus className="w-6 h-6 text-gray-500" />
              </div>
              <p className="font-medium mb-1">No projects yet</p>
              <p className="text-sm text-gray-500 mb-4">Create your first AI reel to get started.</p>
              <Link
                href="/create-reel"
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> Create Reel
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
