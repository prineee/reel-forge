'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Image as ImageIcon,
  Sparkles,
  Loader2,
  Download,
  Plus,
  Type,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const NICHES = ['Gaming', 'Finance', 'AI', 'Motivation', 'Podcast'] as const
const STYLES = ['MrBeast', 'Clean', 'Dark', 'Minimal'] as const
const FONTS = [
  { label: 'Impact', value: 'Impact', hint: 'Bold' },
  { label: 'Georgia', value: 'Georgia', hint: 'Elegant' },
  { label: 'Mono', value: '"Courier New", monospace', hint: 'Tech' },
] as const

type Niche = (typeof NICHES)[number]
type Style = (typeof STYLES)[number]
type FontValue = (typeof FONTS)[number]['value']

const CANVAS_W = 640
const CANVAS_H = 360

export default function ThumbnailPage() {
  const [title, setTitle] = useState('')
  const [niche, setNiche] = useState<Niche>('Gaming')
  const [style, setStyle] = useState<Style>('MrBeast')
  const [loading, setLoading] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<string | null>(null)

  const [activeFont, setActiveFont] = useState<FontValue>('Impact')
  const [textColor, setTextColor] = useState('#ffffff')

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fabricRef = useRef<any>(null)   // fabric.Canvas instance
  const libRef = useRef<any>(null)      // fabric namespace

  // Capture title at generation time so the canvas text matches what was submitted
  const capturedTitle = useRef('')

  async function handleGenerate() {
    if (!title.trim()) return
    setLoading(true)
    setError(null)
    capturedTitle.current = title

    try {
      const res = await fetch('/api/generate/thumbnail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, niche, style }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setImageUrl(data.imageUrl)
      setPrompt(data.prompt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // Initialize or re-initialize Fabric canvas whenever imageUrl changes
  useEffect(() => {
    if (!imageUrl || !canvasRef.current) return

    let fc: any

    ;(async () => {
      const { fabric } = (await import('fabric')) as any
      libRef.current = fabric

      // Dispose previous canvas if it exists
      fabricRef.current?.dispose()

      fc = new fabric.Canvas(canvasRef.current, {
        width: CANVAS_W,
        height: CANVAS_H,
        selection: true,
        preserveObjectStacking: true,
      })
      fabricRef.current = fc

      // Load generated image as background via proxy (avoids CORS taint)
      const proxied = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`
      fabric.Image.fromURL(
        proxied,
        (img: any) => {
          img.set({ selectable: false, evented: false })
          img.scaleToWidth(CANVAS_W)
          fc.setBackgroundImage(img, fc.renderAll.bind(fc))
        },
      )

      // Default text overlay
      const text = new fabric.IText(capturedTitle.current.toUpperCase() || 'YOUR TITLE HERE', {
        left: 40,
        top: CANVAS_H - 90,
        fontSize: 48,
        fill: '#FFFFFF',
        fontFamily: 'Impact',
        stroke: '#000000',
        strokeWidth: 1.5,
        paintFirst: 'stroke',
        shadow: 'rgba(0,0,0,0.6) 3px 3px 8px',
        lineHeight: 1.1,
      })
      fc.add(text)
      fc.setActiveObject(text)
      fc.renderAll()
    })()

    return () => {
      fc?.dispose()
      fabricRef.current = null
    }
  }, [imageUrl])

  // Apply font to the currently active text object
  function applyFont(fontValue: FontValue) {
    setActiveFont(fontValue)
    const obj = fabricRef.current?.getActiveObject()
    if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
      obj.set('fontFamily', fontValue)
      fabricRef.current.renderAll()
    }
  }

  // Apply color to the active object
  function applyColor(color: string) {
    setTextColor(color)
    const obj = fabricRef.current?.getActiveObject()
    if (obj) {
      obj.set('fill', color)
      fabricRef.current.renderAll()
    }
  }

  // Add a new text layer
  function addTextLayer() {
    if (!fabricRef.current || !libRef.current) return
    const { IText } = libRef.current
    const text = new IText('NEW TEXT', {
      left: 40,
      top: 40,
      fontSize: 36,
      fill: textColor,
      fontFamily: activeFont,
      stroke: '#000000',
      strokeWidth: 1,
      paintFirst: 'stroke',
    })
    fabricRef.current.add(text)
    fabricRef.current.setActiveObject(text)
    fabricRef.current.renderAll()
  }

  // Export as PNG at 2× (1280×720)
  function handleDownload() {
    if (!fabricRef.current) return
    const dataUrl: string = fabricRef.current.toDataURL({
      format: 'png',
      multiplier: 2,
      quality: 1,
    })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `thumbnail-${Date.now()}.png`
    a.click()
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Thumbnail Generator</h1>
        <p className="text-gray-400 text-sm">
          AI-generated images with a live canvas editor — drag text, resize, and export at 1280×720.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
        {/* ─── Left: Form ─── */}
        <Card>
          <CardHeader>
            <CardTitle>Configure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Title */}
            <div>
              <label className="label">Video Title</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. I Spent 100 Days Building an AI…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Niche */}
            <div>
              <label className="label">Niche</label>
              <select
                className="input"
                value={niche}
                onChange={(e) => setNiche(e.target.value as Niche)}
              >
                {NICHES.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Style */}
            <div>
              <label className="label">Style</label>
              <div className="grid grid-cols-2 gap-2">
                {STYLES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStyle(s)}
                    className={`py-2 px-3 rounded-md text-sm font-medium border transition-colors ${
                      style === s
                        ? 'bg-brand-600 border-brand-500 text-white'
                        : 'border-surface-border text-gray-400 hover:border-brand-700 hover:text-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-950/40 border border-red-800 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <Button
              onClick={handleGenerate}
              disabled={loading || !title.trim()}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {loading ? 'Generating…' : 'Generate Thumbnail (2 credits)'}
            </Button>

            {prompt && (
              <details className="group">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 select-none">
                  View AI prompt ▸
                </summary>
                <p className="mt-2 text-xs text-gray-500 leading-relaxed">{prompt}</p>
              </details>
            )}
          </CardContent>
        </Card>

        {/* ─── Right: Canvas Editor ─── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle>Canvas Editor</CardTitle>

              {imageUrl && (
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Font buttons */}
                  <div className="flex gap-1">
                    {FONTS.map((f) => (
                      <button
                        key={f.value}
                        title={`${f.label} — ${f.hint}`}
                        onClick={() => applyFont(f.value as FontValue)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          activeFont === f.value
                            ? 'bg-brand-600 border-brand-500 text-white'
                            : 'border-surface-border text-gray-400 hover:border-brand-700 hover:text-white'
                        }`}
                        style={{ fontFamily: f.value }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Color picker */}
                  <label
                    className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-400 border border-surface-border rounded px-2 py-1 hover:border-brand-700 transition-colors"
                    title="Text color"
                  >
                    <Type className="w-3.5 h-3.5" />
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => applyColor(e.target.value)}
                      className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>

                  {/* Add text */}
                  <button
                    onClick={addTextLayer}
                    title="Add new text layer"
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 border border-surface-border hover:border-brand-700 hover:text-white transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Text
                  </button>

                  {/* Download */}
                  <Button size="sm" onClick={handleDownload}>
                    <Download className="w-3.5 h-3.5" />
                    PNG 1280×720
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {/* Canvas wrapper — always in DOM once imageUrl is set */}
            {imageUrl ? (
              <div className="relative">
                {/* Re-generation overlay */}
                {loading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/75 rounded-lg gap-3">
                    <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
                    <p className="text-sm text-gray-300">Generating new image…</p>
                  </div>
                )}
                {/* The Fabric canvas element */}
                <canvas
                  ref={canvasRef}
                  className="rounded-lg max-w-full"
                  style={{ display: 'block' }}
                />
                <p className="mt-2 text-xs text-gray-500">
                  Click text to select · Drag to reposition · Use handles to resize · Double-click to edit
                </p>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="relative">
                  <Loader2 className="w-10 h-10 text-brand-400 animate-spin" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm text-gray-300 font-medium">Generating your thumbnail…</p>
                  <p className="text-xs text-gray-500">OpenAI → Stability SDXL → Canvas (~30s)</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <ImageIcon className="w-12 h-12 text-gray-600" />
                <p className="text-sm text-gray-500">Configure options and generate to open the canvas editor</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
