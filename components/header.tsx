'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, ChevronDown, LogOut, Settings, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface HeaderProps {
  userEmail?: string
  userName?: string
}

export function Header({ userEmail, userName }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = userName
    ? userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : userEmail?.charAt(0).toUpperCase() ?? 'U'

  return (
    <header className="h-16 bg-surface-card border-b border-surface-border flex items-center justify-between px-6 sticky top-0 z-20">
      <div />

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <button className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-surface-hover transition-colors relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-500 rounded-full" />
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-white leading-tight">
                {userName ?? 'User'}
              </p>
              <p className="text-xs text-gray-500 leading-tight truncate max-w-[140px]">
                {userEmail}
              </p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-52 bg-surface-card border border-surface-border rounded-xl shadow-xl z-20 overflow-hidden py-1">
                <div className="px-4 py-3 border-b border-surface-border">
                  <p className="text-sm font-medium text-white">{userName ?? 'User'}</p>
                  <p className="text-xs text-gray-500 truncate">{userEmail}</p>
                </div>
                <button
                  onClick={() => { setOpen(false); router.push('/settings') }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-surface-hover transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <button
                  onClick={() => { setOpen(false); router.push('/settings') }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-surface-hover transition-colors"
                >
                  <User className="w-4 h-4" />
                  Profile
                </button>
                <div className="border-t border-surface-border my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
