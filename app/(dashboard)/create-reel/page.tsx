'use client'

import { useState } from 'react'
import { Video, Sparkles, Loader2, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const voices = ['Alloy', 'Echo', 'Fable', 'Onyx', 'Nova', 'Shimmer']
const durations = ['15s', '30s', '60s', '90s']
const styles = ['Cinematic', 'Minimalist', 'Dynamic', 'Corporate', 'Vlog']

export default function CreateReelPage() {
  const [topic, setTopic] = useState('')
  const [script, setScript] = useState('')
  const [voice, setVoice] = useState('Nova')
  const [duration, setDuration] = useState('30s')
  const [style, setStyle] = useState('Cinematic')
  const [step, setStep] = useState<'input' | 'script' | 'generating' | 'done'>('input')
  const [loading, setLoading] = useState(false)

  function handleGenerateScript() {
    if (!topic.trim()) return
    setLoading(true)
    setTimeout(() => {
      setScript(
        `🎬 [HOOK]\nDid you know that ${topic} is transforming the world as we know it?\n\n` +
        `[MAIN CONTENT]\nHere's everything you need to know about ${topic} in 30 seconds.\n\n` +
        `[CTA]\nFollow for more insights like this every day! Drop a comment below. 👇`
      )
      setStep('script')
      setLoading(false)
    }, 1500)
  }

  function handleGenerateReel() {
    setStep('generating')
    setTimeout(() => setStep('done'), 3000)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Create Reel</h1>
        <p className="text-gray-400 text-sm">Turn any topic into a scroll-stopping video reel with AI.</p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {['Topic & Script', 'Voice & Style', 'Generate'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border
              ${i === 0 && (step === 'input' || step === 'script') ? 'bg-brand-600 border-brand-500 text-white' :
                i === 1 && step === 'script' ? 'bg-brand-600 border-brand-500 text-white' :
                i === 2 && (step === 'generating' || step === 'done') ? 'bg-brand-600 border-brand-500 text-white' :
                'border-surface-border text-gray-600'}`}
            >{i + 1}</div>
            <span className="hidden sm:block">{s}</span>
            {i < 2 && <div className="w-8 h-px bg-surface-border" />}
          </div>
        ))}
      </div>

      {step === 'done' ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-950 border border-green-800 flex items-center justify-center mb-4">
              <Video className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Your reel is ready!</h2>
            <p className="text-gray-400 text-sm mb-6">Your AI-generated reel has been saved to your projects.</p>
            <div className="flex gap-3">
              <Button variant="primary">Download Reel</Button>
              <Button variant="secondary" onClick={() => setStep('input')}>Create Another</Button>
            </div>
          </CardContent>
        </Card>
      ) : step === 'generating' ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Loader2 className="w-10 h-10 text-brand-400 animate-spin mb-4" />
            <h2 className="text-lg font-semibold mb-2">Generating your reel…</h2>
            <p className="text-gray-400 text-sm">AI is rendering your video. This usually takes under 2 minutes.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Topic */}
          <Card>
            <CardHeader><CardTitle>1. Topic & Script</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="label">What is your reel about?</label>
                <input
                  className="input"
                  placeholder="e.g. 5 morning habits that changed my life"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>

              {step === 'script' ? (
                <div>
                  <label className="label">AI-Generated Script</label>
                  <textarea
                    className="input min-h-[160px] resize-y"
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                  />
                  <p className="text-xs text-gray-500 mt-1">Edit the script as needed before generating.</p>
                </div>
              ) : (
                <Button onClick={handleGenerateScript} disabled={loading || !topic.trim()}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate Script with AI
                </Button>
              )}
            </CardContent>
          </Card>

          {step === 'script' && (
            <Card>
              <CardHeader><CardTitle>2. Voice & Style</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">AI Voice</label>
                  <div className="relative">
                    <select
                      className="input appearance-none pr-8"
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                    >
                      {voices.map((v) => <option key={v}>{v}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="label">Duration</label>
                  <div className="relative">
                    <select
                      className="input appearance-none pr-8"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                    >
                      {durations.map((d) => <option key={d}>{d}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="label">Visual Style</label>
                  <div className="relative">
                    <select
                      className="input appearance-none pr-8"
                      value={style}
                      onChange={(e) => setStyle(e.target.value)}
                    >
                      {styles.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'script' && (
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setStep('input')}>Back</Button>
              <Button onClick={handleGenerateReel}>
                <Video className="w-4 h-4" /> Generate Reel (1 credit)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
