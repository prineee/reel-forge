import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Video, Plus, FolderOpen, Search } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'Projects' }

export default async function ProjectsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: projects } = await (supabase.from('projects') as any)
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false }) as
      { data: Array<{ id: string; title: string; type: string; status: string; created_at: string }> | null }

  const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
    completed: 'success', processing: 'info', draft: 'default', failed: 'danger',
  }

  const typeColors: Record<string, string> = {
    reel: 'text-purple-400', short: 'text-blue-400', story: 'text-pink-400', ad: 'text-orange-400',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">Projects</h1>
          <p className="text-gray-400 text-sm">{projects?.length ?? 0} total projects</p>
        </div>
        <Link
          href="/create-reel"
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> New Project
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          className="input pl-9 max-w-sm"
          placeholder="Search projects…"
          readOnly
        />
      </div>

      {projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Card key={p.id} hover>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-lg bg-surface border border-surface-border flex items-center justify-center">
                    <Video className={`w-5 h-5 ${typeColors[p.type] ?? 'text-gray-400'}`} />
                  </div>
                  <Badge variant={statusVariant[p.status] ?? 'default'}>{p.status}</Badge>
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-0.5 line-clamp-1">{p.title}</h3>
                  <p className="text-xs text-gray-500">{formatDate(p.created_at)}</p>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-surface-border">
                  <span className="text-xs text-gray-500 capitalize">{p.type}</span>
                  <button className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                    View →
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-surface border border-surface-border flex items-center justify-center mb-4">
              <FolderOpen className="w-7 h-7 text-gray-500" />
            </div>
            <h2 className="font-semibold text-lg mb-2">No projects yet</h2>
            <p className="text-gray-400 text-sm mb-6 max-w-sm">
              Start creating AI-powered reels, thumbnails, and more. Each creation becomes a project.
            </p>
            <Link
              href="/create-reel"
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Your First Reel
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
