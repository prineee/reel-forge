import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'AI ReelForge', template: '%s | AI ReelForge' },
  description: 'Create stunning AI-powered video reels, thumbnails, and captions in minutes.',
  keywords: ['AI video', 'reels', 'thumbnail generator', 'captions', 'SaaS'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
