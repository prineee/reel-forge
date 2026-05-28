'use client'

import { useState } from 'react'
import { Video, Trash2, FolderOpen, Plus } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'

interface Project {
  id: string
  title: string
  type: string
  status: string
  created_at: string
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
  completed: 'success',
  processing: 'info',
  draft: 'default',
  failed: 'danger',
}

const TYPE_COLORS: Record<string, string> = {
  reel:  'text-purple-400',
  short: 'text-blue-400',
  story: 'text-pink-400',
  ad:    'text-orange-400',
}

export default function ProjectsClient({ initialProjects }: { initialProjects: Project[] }) {
  const supabase = createClient()
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return
    setDeleting(id)
    // Optimistic update
    setProjects((prev) => prev.filter((p) => p.id !== id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('projects') as any).delete().eq('id', id)
    if (error) {
      // Roll back on failure
      setProjects((prev) => {
        const restored = initialProjects.find((p) => p.id === id)
        return restored ? [...prev, restored].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ) : prev
      })
      alert('Failed to delete project. Please try again.')
    }
    setDeleting(null)
  }

  if (projects.length === 0) {
    return (
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
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {projects.map((p) => (
        <Card key={p.id} hover>
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-lg bg-surface border border-surface-border flex items-center justify-center">
                <Video className={`w-5 h-5 ${TYPE_COLORS[p.type] ?? 'text-gray-400'}`} />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[p.status] ?? 'default'}>{p.status}</Badge>
                <button
                  onClick={() => handleDelete(p.id, p.title)}
                  disabled={deleting === p.id}
                  title="Delete project"
                  className="w-7 h-7 flex items-center justify-center rounded text-gray-600 hover:text-red-400 hover:bg-red-950/40 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-0.5 line-clamp-1">{p.title}</h3>
              <p className="text-xs text-gray-500">{formatDate(p.created_at)}</p>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-surface-border">
              <Badge variant="default" className="text-xs capitalize">{p.type}</Badge>
              <span className="text-xs text-gray-600">{formatDate(p.created_at)}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
