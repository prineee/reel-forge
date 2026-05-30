'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Video, Sparkles, Loader2, ChevronRight, ChevronLeft,
  Mic, Eye, Check, AlertCircle,
  Volume2, Download, RefreshCw, BookMarked, Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface Scene {
  number: number
  title: string
  duration: string
  voiceover: string
  visualNote: string
}

interface ReelScript {
  title: string
  scenes: Scene[]
}

interface Voice {
  voice_id: string      // OpenAI voice name: alloy | echo | fable | onyx | nova | shimmer
  name: string
  description: string
  gender: string        // female | male | neutral
  language: string
  category: string
  preview_url: string
  accent: string
  age: string
}

interface GenerateResult {
  voiceUrl: string      // Cloudinary URL, data URL, or fallback — used for playback
  dataUrl: string       // base64 data URL — used for download
  projectId: string
  videoId: string
  usedFallbackAudio?: boolean
}

// ── Constants ────────────────────────────────────────────────────────────────

const NICHES = [
  'Tech & AI', 'Fitness & Health', 'Business', 'Finance',
  'Motivation', 'Lifestyle', 'Food & Cooking', 'Travel',
  'Gaming', 'Entertainment',
] as const

const PLATFORMS = ['Reels', 'Shorts', 'TikTok'] as const
type Platform = typeof PLATFORMS[number]

const PLATFORM_ICONS: Record<Platform, string> = { Reels: '📱', Shorts: '▶️', TikTok: '🎵' }

const SCENE_LABELS = ['HOOK', 'PROBLEM', 'SOLUTION', 'PROOF', 'CTA']
const SCENE_COLORS = [
  'from-red-500 to-orange-500',
  'from-orange-500 to-yellow-500',
  'from-brand-500 to-blue-500',
  'from-green-500 to-emerald-500',
  'from-purple-500 to-pink-500',
]

const STEPS = ['Topic & Niche', 'Review Script', 'Choose Voice', 'Generate']

// ── StepIndicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((label, i) => {
        const idx    = i + 1
        const done   = current > idx
        const active = current === idx
        const isLast = i === STEPS.length - 1
        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
                done   ? 'bg-brand-600 border-brand-600 text-white' :
                active ? 'bg-brand-600/20 border-brand-500 text-brand-300' :
                         'bg-transparent border-surface-border text-gray-600'
              )}>
                {done ? <Check className="w-3.5 h-3.5" /> : idx}
              </div>
              <span className={cn(
                'text-xs font-medium hidden sm:block',
                active ? 'text-white' : done ? 'text-brand-400' : 'text-gray-600'
              )}>
                {label}
              </span>
            </div>
            {!isLast && (
              <div className={cn(
                'mx-2 sm:mx-3 h-px w-6 sm:w-10 transition-colors',
                current > idx ? 'bg-brand-600' : 'bg-surface-border'
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── SceneCard (Step 2) ───────────────────────────────────────────────────────

function SceneCard({
  scene, index, onChange,
}: {
  scene: Scene
  index: number
  onChange: (voiceover: string) => void
}) {
  const label    = SCENE_LABELS[index] ?? `SCENE ${scene.number}`
  const gradient = SCENE_COLORS[index] ?? SCENE_COLORS[0]

  return (
    <Card>
      <div className="flex items-center gap-3 px-5 py-3 border-b border-surface-border">
        <div className={cn(
          'w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white text-xs font-extrabold shrink-0',
          gradient
        )}>
          {scene.number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn('text-xs font-bold bg-gradient-to-r bg-clip-text', gradient)}
              style={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            >
              {label}
            </span>
            <span className="text-sm font-semibold text-white truncate">{scene.title}</span>
          </div>
          <p className="text-xs text-gray-500">{scene.duration}</p>
        </div>
      </div>

      <div className="divide-y divide-surface-border">
        <div className="px-5 py-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-2">
            <Mic className="w-3.5 h-3.5" /> Voiceover
            <span className="text-gray-600">(editable)</span>
          </div>
          <textarea
            className="input min-h-[80px] resize-y text-sm leading-relaxed"
            value={scene.voiceover}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <div className="px-5 py-3 bg-surface/40 rounded-b-xl">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <Eye className="w-3.5 h-3.5" /> Visual Direction
          </div>
          <p className="text-xs text-gray-500 leading-relaxed italic">{scene.visualNote}</p>
        </div>
      </div>
    </Card>
  )
}

// ── VoiceCard (Step 3) ───────────────────────────────────────────────────────

// Avatar/badge colours by gender
function voiceColors(gender: string) {
  if (gender === 'female')  return { avatar: 'bg-purple-950 text-purple-300', badge: 'bg-purple-950 border-purple-800 text-purple-300' }
  if (gender === 'male')    return { avatar: 'bg-blue-950 text-blue-300',     badge: 'bg-blue-950 border-blue-800 text-blue-300'       }
  /* neutral */             return { avatar: 'bg-brand-950 text-brand-300',   badge: 'bg-brand-950 border-brand-800 text-brand-300'   }
}

function VoiceCard({
  voice, selected, onSelect,
}: {
  voice: Voice
  selected: boolean
  onSelect: () => void
}) {
  const colors = voiceColors(voice.gender)

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left p-4 rounded-xl border-2 transition-all',
        selected
          ? 'border-brand-500 bg-brand-600/10'
          : 'border-surface-border hover:border-brand-700/60 bg-surface-card'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center text-base font-bold shrink-0',
          colors.avatar
        )}>
          {voice.name.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + check */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-semibold text-sm text-white">{voice.name}</span>
            {selected && <Check className="w-4 h-4 text-brand-400 shrink-0" />}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1 mb-2">
            <Badge variant="default" className={cn('text-xs capitalize', colors.badge)}>
              {voice.gender}
            </Badge>
            {voice.accent && (
              <Badge variant="default" className="text-xs capitalize">
                {voice.accent}
              </Badge>
            )}
            <Badge variant="default" className="text-xs text-gray-500 bg-surface border-surface-border">
              OpenAI TTS
            </Badge>
          </div>

          {/* Description */}
          <p className="text-xs text-gray-500 leading-relaxed">{voice.description}</p>
        </div>
      </div>
    </button>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CreateReelPage() {
  // ── Step ──
  const [step, setStep] = useState(1)

  // ── Step 1: Setup ──
  const [topic, setTopic]               = useState('')
  const [niche, setNiche]               = useState<string>(NICHES[0])
  const [platform, setPlatform]         = useState<Platform>('Reels')
  const [step1Loading, setStep1Loading] = useState(false)
  const [step1Error, setStep1Error]     = useState('')

  // ── Step 2: Script ──
  const [scriptTitle, setScriptTitle] = useState('')
  const [scenes, setScenes]           = useState<Scene[]>([])

  // ── Step 3: Voices ──
  const [voices, setVoices]                   = useState<Voice[]>([])
  const [voicesLoading, setVoicesLoading]     = useState(false)
  const [voicesError, setVoicesError]         = useState('')
  const [selectedVoice, setSelectedVoice]     = useState('nova')   // OpenAI voice name
  const previewRef = useRef<HTMLAudioElement | null>(null)

  // ── Step 4: Generate ──
  const [generating, setGenerating]       = useState(false)
  const [progress, setProgress]           = useState(0)
  const [generateError, setGenerateError] = useState('')
  const [result, setResult]               = useState<GenerateResult | null>(null)

  // Cleanup preview audio on unmount
  useEffect(() => {
    return () => { previewRef.current?.pause() }
  }, [])

  // Asymptotic progress animation while waiting for TTS
  useEffect(() => {
    if (!generating) return
    const tick = setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + (90 - p) * 0.06))
    }, 400)
    return () => clearInterval(tick)
  }, [generating])

  // ── Step 1 → 2: Generate script ──────────────────────────────────────────
  async function handleGenerateScript() {
    if (!topic.trim()) return
    setStep1Loading(true)
    setStep1Error('')

    try {
      const res  = await fetch('/api/reel/script', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ topic, niche, platform }),
      })
      const json = await res.json()

      if (!res.ok) {
        setStep1Error(json.error ?? 'Failed to generate script. Please try again.')
        return
      }

      setScriptTitle((json as ReelScript).title)
      setScenes((json as ReelScript).scenes)
      setStep(2)
    } catch {
      setStep1Error('Network error. Please check your connection and try again.')
    } finally {
      setStep1Loading(false)
    }
  }

  // ── Step 2 → 3: Load voices ───────────────────────────────────────────────
  const loadVoices = useCallback(async () => {
    if (voices.length > 0) return   // already loaded
    setVoicesLoading(true)
    setVoicesError('')

    try {
      const res = await fetch('/api/reel/voices')

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setVoicesError(data.error ?? `Failed to load voices (HTTP ${res.status})`)
        return
      }

      const data = await res.json() as { voices: Voice[] }
      const list = data.voices ?? []

      if (list.length === 0) {
        setVoicesError('No voices returned from the server.')
        return
      }

      setVoices(list)
      // Keep 'nova' as default if it exists, otherwise pick first
      const hasNova = list.some((v) => v.voice_id === 'nova')
      if (!hasNova) setSelectedVoice(list[0].voice_id)
    } catch (err) {
      setVoicesError(
        `Network error loading voices: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      setVoicesLoading(false)
    }
  }, [voices.length])

  function goToVoices() {
    setStep(3)
    loadVoices()
  }

  // ── Step 3 → 4: Generate voiceover ───────────────────────────────────────
  // setStep(4) is called FIRST so the loading card appears immediately —
  // without this the UI looks frozen for the entire OpenAI TTS request duration.
  async function handleGenerate() {
    if (!selectedVoice || !scenes.length) return

    setGenerating(true)
    setProgress(0)
    setGenerateError('')
    setResult(null)
    setStep(4)  // ← show loading card before fetch

    try {
      const res  = await fetch('/api/reel/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ scenes, voice: selectedVoice, title: scriptTitle }),
      })

      const json = await res.json()

      if (!res.ok) {
        setGenerateError(json.error ?? 'Generation failed. Please try again.')
        return
      }

      setProgress(100)
      setResult(json as GenerateResult)
    } catch (err) {
      setGenerateError(
        err instanceof Error
          ? `Network error: ${err.message}`
          : 'Network error. Please check your connection and try again.'
      )
    } finally {
      setGenerating(false)
    }
  }

  function handleReset() {
    setStep(1)
    setTopic('')
    setScriptTitle('')
    setScenes([])
    setSelectedVoice('nova')
    setProgress(0)
    setResult(null)
    setGenerateError('')
    setStep1Error('')
  }

  function updateSceneVoiceover(index: number, voiceover: string) {
    setScenes((prev) => prev.map((s, i) => (i === index ? { ...s, voiceover } : s)))
  }

  const activeVoiceObj = voices.find((v) => v.voice_id === selectedVoice)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-1">Create Reel</h1>
        <p className="text-gray-400 text-sm">
          AI script → OpenAI voiceover → ready to film. Uses 5 credits.
        </p>
      </div>

      <StepIndicator current={step} />

      {/* ── Step 1: Topic & Niche ─────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Step 1 — Topic & Niche</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label className="label">What is your reel about?</label>
              <input
                className="input"
                placeholder="e.g. 3 habits that helped me lose 20 lbs without dieting"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerateScript()}
              />
            </div>

            <div>
              <label className="label">Niche</label>
              <div className="flex flex-wrap gap-1.5">
                {NICHES.map((n) => (
                  <button
                    key={n}
                    onClick={() => setNiche(n)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                      niche === n
                        ? 'bg-brand-600 border-brand-500 text-white'
                        : 'border-surface-border text-gray-400 hover:border-brand-700 hover:text-white'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Platform</label>
              <div className="flex gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors',
                      platform === p
                        ? 'bg-brand-600 border-brand-500 text-white'
                        : 'border-surface-border text-gray-400 hover:border-brand-700 hover:text-white'
                    )}
                  >
                    <span>{PLATFORM_ICONS[p]}</span> {p}
                  </button>
                ))}
              </div>
            </div>

            {step1Error && (
              <div className="flex items-start gap-2 bg-red-950/50 border border-red-800 text-red-400 text-sm rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{step1Error}</span>
              </div>
            )}

            <Button
              onClick={handleGenerateScript}
              disabled={step1Loading || !topic.trim()}
              className="w-full"
              size="md"
            >
              {step1Loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating script…</>
                : <><Sparkles className="w-4 h-4" /> Generate 5-Scene Script</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Review Script ─────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">
                Generated script for <span className="text-white">{platform}</span>
              </p>
              <h2 className="text-lg font-bold">{scriptTitle}</h2>
            </div>
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
            </button>
          </div>

          <p className="text-xs text-gray-500 bg-surface-card border border-surface-border rounded-lg px-3 py-2">
            ✏️ Edit any voiceover text below before generating audio.
            Visual direction notes are read-only guidance for filming.
          </p>

          {scenes.map((scene, i) => (
            <SceneCard
              key={scene.number}
              scene={scene}
              index={i}
              onChange={(v) => updateSceneVoiceover(i, v)}
            />
          ))}

          <div className="flex justify-between pt-1">
            <Button variant="secondary" onClick={() => setStep(1)}>
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={goToVoices}>
              Choose Voice <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Choose Voice ──────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold mb-0.5">Step 3 — Choose a Voice</h2>
            <p className="text-xs text-gray-500">
              Powered by OpenAI TTS · model <code className="text-gray-400">tts-1</code>.
              Select a voice that matches your content style.
            </p>
          </div>

          {/* Loading skeletons */}
          {voicesLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-28 bg-surface-card border border-surface-border rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {/* Error */}
          {!voicesLoading && voicesError && (
            <Card>
              <CardContent className="py-8 space-y-3">
                <div className="flex items-start gap-2 text-red-400">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">Could not load voices</p>
                    <p className="text-xs text-red-400/80 mt-0.5">{voicesError}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setVoices([]); loadVoices() }}
                  className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              </CardContent>
            </Card>
          )}

          {/* Voice grid — 2 cols on sm, 3 on lg */}
          {!voicesLoading && !voicesError && voices.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {voices.map((voice) => (
                <VoiceCard
                  key={voice.voice_id}
                  voice={voice}
                  selected={selectedVoice === voice.voice_id}
                  onSelect={() => setSelectedVoice(voice.voice_id)}
                />
              ))}
            </div>
          )}

          {/* Selected voice pill */}
          {activeVoiceObj && (
            <div className="flex items-center gap-2 text-sm text-gray-400 bg-surface-card border border-surface-border rounded-lg px-4 py-3">
              <Check className="w-4 h-4 text-brand-400 shrink-0" />
              <span>Selected:</span>
              <span className="text-white font-medium">{activeVoiceObj.name}</span>
              <span className="text-gray-600 capitalize">
                ({[activeVoiceObj.accent, activeVoiceObj.gender].filter(Boolean).join(' ')})
              </span>
              <span className="ml-auto text-xs text-gray-600">OpenAI tts-1</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setStep(2)}>
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>

            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-500">
                Uses <span className="text-white font-semibold">5 credits</span>
              </p>
              <Button
                onClick={handleGenerate}
                disabled={!selectedVoice || voicesLoading || generating}
              >
                {generating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating voiceover…</>
                  : <><Volume2 className="w-4 h-4" /> Generate Voiceover</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 4: Processing / Result ───────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-5">

          {/* Loading */}
          {generating && (
            <Card>
              <CardContent className="flex flex-col items-center py-16 gap-5">
                <div className="relative w-16 h-16">
                  <Loader2 className="w-16 h-16 text-brand-500 animate-spin" />
                  <Volume2 className="absolute inset-0 m-auto w-7 h-7 text-brand-300" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-base font-semibold">Generating voiceover…</p>
                  <p className="text-xs text-gray-500">
                    OpenAI tts-1 → Cloudinary upload → saving to projects
                  </p>
                </div>
                <div className="w-full max-w-sm">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Processing</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="h-2 bg-surface rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error */}
          {!generating && generateError && (
            <Card>
              <CardContent className="py-10 text-center space-y-4">
                <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
                <div>
                  <p className="font-semibold text-red-400 mb-2">Generation failed</p>
                  <p className="text-sm text-gray-400 max-w-md mx-auto bg-red-950/30 border border-red-900 rounded-lg px-4 py-3">
                    {generateError}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => { setStep(3); setGenerateError('') }}
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </Button>
                  <Button onClick={handleGenerate}>
                    <RefreshCw className="w-4 h-4" /> Retry
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Success */}
          {!generating && result && (
            <div className="space-y-5">
              {/* Banner */}
              <div className="flex items-center gap-3 bg-green-950/40 border border-green-800 rounded-xl px-5 py-4">
                <div className="w-10 h-10 rounded-full bg-green-950 border border-green-700 flex items-center justify-center shrink-0">
                  <Check className="w-5 h-5 text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-green-300">Voiceover generated!</p>
                  <p className="text-xs text-green-500/70">Saved to Projects · 5 credits used</p>
                </div>
                <Badge variant="success">Complete</Badge>
              </div>

              {/* Rate-limit fallback notice */}
              {result.usedFallbackAudio && (
                <div className="flex items-start gap-2 bg-yellow-950/30 border border-yellow-800 rounded-xl px-4 py-3 text-sm text-yellow-300">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    OpenAI TTS was rate-limited — a sample audio was used so your project was still
                    saved. Wait a moment and retry to get the real voiceover.
                  </span>
                </div>
              )}

              {/* Audio player */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Volume2 className="w-4 h-4 text-brand-400" />
                    Voiceover Preview
                    {activeVoiceObj && (
                      <span className="text-gray-500 font-normal">
                        — {activeVoiceObj.name}
                        <span className="text-gray-600 ml-1 text-xs">(OpenAI tts-1)</span>
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {result.voiceUrl ? (
                    <div className="space-y-3">
                      <audio
                        src={result.voiceUrl}
                        controls
                        className="w-full rounded-lg"
                        style={{ colorScheme: 'dark' }}
                      />
                      {/* Prefer dataUrl for download so filename works; fall back to voiceUrl */}
                      <a
                        href={result.dataUrl || result.voiceUrl}
                        download="voiceover.mp3"
                        className="inline-flex items-center gap-2 text-xs text-brand-400 hover:text-brand-300 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> Download MP3
                      </a>
                    </div>
                  ) : (
                    <p className="text-sm text-yellow-400 bg-yellow-950/30 border border-yellow-800 rounded-lg px-3 py-2">
                      Audio was generated but could not be hosted. Configure Cloudinary credentials
                      to enable permanent audio storage.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Script summary */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BookMarked className="w-4 h-4 text-gray-400" />
                      Script — {scriptTitle}
                    </CardTitle>
                    <Badge variant="info">{platform}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {scenes.map((scene, i) => (
                    <div key={scene.number} className="flex gap-3">
                      <div className={cn(
                        'w-6 h-6 rounded-md bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5',
                        SCENE_COLORS[i] ?? SCENE_COLORS[0]
                      )}>
                        {scene.number}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-400 mb-0.5">
                          {SCENE_LABELS[i]} · {scene.duration}
                        </p>
                        <p className="text-sm text-gray-200 leading-relaxed">{scene.voiceover}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={handleReset}>
                  <RefreshCw className="w-4 h-4" /> Create Another
                </Button>
                <Button onClick={() => (window.location.href = '/projects')}>
                  <Video className="w-4 h-4" /> View Projects
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
