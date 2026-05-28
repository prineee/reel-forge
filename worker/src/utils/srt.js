'use strict'

function pad(n, len) {
  return String(Math.floor(n)).padStart(len, '0')
}

function toSRTTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`
}

/**
 * Splits the script into timed SRT subtitle entries proportional to word count.
 * Each sentence gets a duration proportional to how many words it contains.
 */
function generateSRT(script, totalDurationSeconds) {
  // Split on sentence-ending punctuation followed by whitespace
  const sentences = script
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)

  if (sentences.length === 0) return ''

  const totalWords = script.split(/\s+/).filter(Boolean).length
  const wordsPerSecond = Math.max(totalWords / totalDurationSeconds, 0.5)

  const entries = []
  let cursor = 0

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    const wordCount = sentence.split(/\s+/).filter(Boolean).length
    const duration = Math.max(0.8, wordCount / wordsPerSecond)

    const start = cursor
    const end = Math.min(cursor + duration, totalDurationSeconds - 0.05)
    if (start >= totalDurationSeconds) break

    entries.push(`${i + 1}\n${toSRTTime(start)} --> ${toSRTTime(end)}\n${sentence}`)
    cursor = end + 0.05 // tiny gap between cues
  }

  return entries.join('\n\n') + '\n'
}

module.exports = { generateSRT }
