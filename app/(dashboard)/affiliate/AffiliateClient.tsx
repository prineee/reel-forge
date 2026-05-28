'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check, Twitter, Linkedin, MessageCircle, Mail } from 'lucide-react'

interface Props {
  referralLink: string | null
  hasAffiliate: boolean
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shrink-0"
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

export default function AffiliateClient({ referralLink, hasAffiliate }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleJoin() {
    setError(null)
    const res = await fetch('/api/affiliate/join', { method: 'POST' })
    if (res.ok) {
      startTransition(() => router.refresh())
    } else {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error ?? 'Failed to join affiliate program')
    }
  }

  if (!hasAffiliate) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-400 text-sm mb-4">
          You haven&apos;t joined the affiliate program yet.
        </p>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <button
          onClick={handleJoin}
          disabled={isPending}
          className="bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        >
          {isPending ? 'Joining…' : 'Join Affiliate Program'}
        </button>
      </div>
    )
  }

  const encodedLink = encodeURIComponent(referralLink ?? '')
  const shareText   = encodeURIComponent('Create viral reels with AI — use my referral link:')
  const shareItems = [
    {
      label: 'Twitter/X',
      href:  `https://twitter.com/intent/tweet?text=${shareText}&url=${encodedLink}`,
      icon:  Twitter,
    },
    {
      label: 'LinkedIn',
      href:  `https://www.linkedin.com/sharing/share-offsite/?url=${encodedLink}`,
      icon:  Linkedin,
    },
    {
      label: 'WhatsApp',
      href:  `https://wa.me/?text=${shareText}%20${encodedLink}`,
      icon:  MessageCircle,
    },
    {
      label: 'Email',
      href:  `mailto:?subject=Check+out+AI+ReelForge&body=${shareText}%20${encodedLink}`,
      icon:  Mail,
    },
  ]

  return (
    <>
      <div className="flex gap-2">
        <input
          readOnly
          value={referralLink ?? ''}
          className="input flex-1 font-mono text-sm"
        />
        <CopyButton text={referralLink ?? ''} />
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {shareItems.map(({ label, href, icon: Icon }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-surface-border hover:border-brand-700 text-gray-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </a>
        ))}
      </div>
    </>
  )
}
