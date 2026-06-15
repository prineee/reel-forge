import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'ReelForge — AI Video Creator for Instagram Reels, TikTok & YouTube Shorts', template: '%s | ReelForge' },
  description: 'Create viral AI-powered video reels in minutes. Generate scripts, voiceovers, and videos with AI. Perfect for content creators, marketers, and agencies.',
  keywords: ['AI video creator', 'Instagram Reels maker', 'TikTok video generator', 'YouTube Shorts AI', 'AI content creator', 'viral video maker', 'AI reel generator'],
  openGraph: {
    title: 'ReelForge — Create Viral AI Videos in Minutes',
    description: 'Script to video in 60 seconds. AI-powered reels for Instagram, TikTok & YouTube.',
    url: 'https://reelforge.fabricaipro.com',
    siteName: 'ReelForge',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ReelForge — AI Video Creator',
    description: 'Create viral reels with AI in 60 seconds. No editing skills needed.',
  },
  robots: { index: true, follow: true },
  viewport: { width: 'device-width', initialScale: 1, maximumScale: 5 },
  themeColor: '#0a0a0f',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ReelForge' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
