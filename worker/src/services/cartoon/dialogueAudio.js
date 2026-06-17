// FILE: worker/src/services/cartoon/dialogueAudio.js
// Generates a single audio file from an array of {speaker, text} dialogue lines.
// Each line is voiced with the speaker's assigned TTS voice, then all lines are
// concatenated in order using FFmpeg's filter_complex concat.

'use strict'

const path                    = require('path')
const fs                      = require('fs')
const { spawn }               = require('child_process')
const { generateVoiceover }   = require('../tts')

function resolveBin(envKey, systemPath, bareName) {
  if (process.env[envKey]) return process.env[envKey]
  if (fs.existsSync(systemPath)) return systemPath
  return bareName
}

const FFMPEG_BIN    = resolveBin('FFMPEG_PATH', '/usr/bin/ffmpeg', 'ffmpeg')
const DEFAULT_VOICE = 'tara'

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr  = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg exit ${code}: ${stderr.slice(-300)}`))
    })
    proc.on('error', err => reject(new Error(`FFmpeg spawn: ${err.message}`)))
  })
}

/**
 * @param {Array<{speaker: string, text: string}>} dialogueLines
 * @param {Record<string, string>} voiceMap   { "Speaker": "voiceId" }
 * @param {string} outputPath                 Destination MP3 file
 * @param {string} tempDir                    Directory for per-line temp files
 */
async function generateDialogueAudio(dialogueLines, voiceMap, outputPath, tempDir) {
  if (!dialogueLines || dialogueLines.length === 0) {
    throw new Error('No dialogue lines provided')
  }

  const linePaths = []

  for (let i = 0; i < dialogueLines.length; i++) {
    const line  = dialogueLines[i]
    const text  = (line.text || '').trim()
    if (!text) continue

    const voice    = voiceMap[line.speaker] || DEFAULT_VOICE
    const linePath = path.join(tempDir, `dlg_line_${i}.mp3`)

    console.log(`[dialogueAudio] ${i + 1}/${dialogueLines.length} "${line.speaker}" (${voice}): "${text.slice(0, 50)}"`)

    await generateVoiceover(text, voice, linePath)

    if (fs.existsSync(linePath) && fs.statSync(linePath).size > 100) {
      linePaths.push(linePath)
    } else {
      console.warn(`[dialogueAudio] Line ${i + 1} produced no audio — skipping`)
    }

    // Respect TTS rate limits
    if (i < dialogueLines.length - 1) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  if (linePaths.length === 0) {
    throw new Error('All dialogue lines failed to generate audio')
  }

  // Single line — copy directly
  if (linePaths.length === 1) {
    fs.copyFileSync(linePaths[0], outputPath)
    console.log(`[dialogueAudio] Single line → ${outputPath}`)
    return outputPath
  }

  // N-way concat via filter_complex — no re-mux artifacts
  const inputs       = linePaths.flatMap(p => ['-i', p])
  const filterInputs = linePaths.map((_, i) => `[${i}:a]`).join('')
  const filterStr    = `${filterInputs}concat=n=${linePaths.length}:v=0:a=1[out]`

  await runFFmpeg([
    '-y',
    ...inputs,
    '-filter_complex', filterStr,
    '-map',  '[out]',
    '-c:a',  'libmp3lame',
    '-b:a',  '128k',
    '-ar',   '44100',
    outputPath,
  ])

  const size = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0
  if (size === 0) throw new Error(`Dialogue concat produced empty file: ${outputPath}`)

  console.log(`[dialogueAudio] ${linePaths.length} lines → ${outputPath} (${size} bytes)`)
  return outputPath
}

module.exports = { generateDialogueAudio }
