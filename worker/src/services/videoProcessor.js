'use strict'

const { spawn } = require('child_process')
const path = require('path')
const os = require('os')
const fs = require('fs-extra')
const { v4: uuidv4 } = require('uuid')
const ffmpegFluent = require('fluent-ffmpeg')

const { generateVoiceover } = require('./elevenLabs')
const { downloadClips } = require('./pexels')
const { uploadToCloudinary } = require('./cloudinaryUpload')
const { updateVideoRecord, updateProjectStatus } = require('./supabase')
const { extractKeywords } = require('../utils/keywords')
const { generateSRT } = require('../utils/srt')

// ── FFmpeg / FFprobe binary resolution ───────────────────────────────────────
// In Docker: FFMPEG_PATH and FFPROBE_PATH are set via ENV → use system binaries.
// Locally: fall back to the @ffmpeg-installer / @ffprobe-installer bundled binaries.

function resolveBin(envKey, installerPkg) {
  if (process.env[envKey]) return process.env[envKey]
  try {
    return require(installerPkg).path
  } catch {
    return envKey === 'FFMPEG_PATH' ? 'ffmpeg' : 'ffprobe'
  }
}

const FFMPEG_BIN  = resolveBin('FFMPEG_PATH',  '@ffmpeg-installer/ffmpeg')
const FFPROBE_BIN = resolveBin('FFPROBE_PATH', '@ffprobe-installer/ffprobe')

// Wire fluent-ffmpeg to the same binaries (used for ffprobe only)
ffmpegFluent.setFfmpegPath(FFMPEG_BIN)
ffmpegFluent.setFfprobePath(FFPROBE_BIN)

// ── Constants ─────────────────────────────────────────────────────────────────
const W = 1280
const H = 720
const FPS = 30
const FADE = 0.5   // seconds per xfade transition
const CLIP_COUNT = 5

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMediaDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpegFluent.ffprobe(filePath, (err, meta) => {
      if (err) reject(new Error(`ffprobe: ${err.message}`))
      else     resolve(meta.format.duration)
    })
  })
}

/**
 * Builds the -filter_complex argument string for N clips + subtitles.
 *
 * Layout per clip:
 *   scale to W×H (letterbox), force SAR=1, set FPS, trim to clipDuration
 *
 * Chain:
 *   [v0][v1] → xfade → [xf1]
 *   [xf1][v2] → xfade → [xf2]
 *   …
 *   [xf(n-2)][v(n-1)] → xfade → [vjoined]
 *   [vjoined] → subtitles → [vout]
 *
 * xfade offsets are cumulative: offset_i = i × (clipDuration − FADE)
 */
function buildFilterComplex(clipCount, clipDuration, srtPath) {
  const parts = []

  // Normalize each clip
  for (let i = 0; i < clipCount; i++) {
    parts.push(
      `[${i}:v]` +
      `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,` +
      `setsar=1,fps=${FPS},` +
      `trim=duration=${clipDuration.toFixed(4)},` +
      `setpts=PTS-STARTPTS` +
      `[v${i}]`
    )
  }

  // xfade chain
  if (clipCount === 1) {
    parts.push(`[v0]null[vjoined]`)
  } else {
    let prev = 'v0'
    for (let i = 1; i < clipCount; i++) {
      const offset = (i * (clipDuration - FADE)).toFixed(4)
      const out = (i === clipCount - 1) ? 'vjoined' : `xf${i}`
      parts.push(`[${prev}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset}[${out}]`)
      prev = out
    }
  }

  // Burn subtitles — escape backslashes and colons for ffmpeg filter syntax
  const safeSrt = srtPath.replace(/\\/g, '/').replace(/([: ])/g, '\\$1')
  parts.push(
    `[vjoined]subtitles=${safeSrt}:` +
    `force_style='FontName=Arial,FontSize=24,Bold=1,` +
    `PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,` +
    `Outline=2,Shadow=1,Alignment=2,MarginV=40'` +
    `[vout]`
  )

  return parts.join(';')
}

/**
 * Runs the final ffmpeg command using child_process.spawn (no shell, no quoting issues).
 * Logs progress lines that contain 'time='.
 */
function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    console.log(`[FFmpeg] ${FFMPEG_BIN} ${args.slice(0, 6).join(' ')} …`)

    const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    const stderrLines = []

    proc.stderr.on('data', chunk => {
      const text = chunk.toString()
      for (const line of text.split('\n')) {
        const l = line.trim()
        if (!l) continue
        stderrLines.push(l)
        if (l.includes('time=')) process.stdout.write(`\r[FFmpeg] ${l}`)
      }
    })

    proc.on('close', code => {
      process.stdout.write('\n')
      if (code === 0) {
        resolve()
      } else {
        const tail = stderrLines.slice(-20).join('\n')
        reject(new Error(`FFmpeg exited ${code}:\n${tail}`))
      }
    })

    proc.on('error', err => reject(new Error(`Failed to spawn ffmpeg: ${err.message}`)))
  })
}

/**
 * Stitches clips, overlays audio, burns subtitles, exports MP4.
 * Returns outputPath on success.
 */
async function stitchVideo(clips, voicePath, srtPath, outputPath) {
  const audioDuration = await getMediaDuration(voicePath)
  console.log(`[FFmpeg] Audio duration: ${audioDuration.toFixed(2)}s | clips: ${clips.length}`)

  // Each clip must cover its share + half-fade overlap on each side
  const clipDuration = (audioDuration + FADE * (clips.length - 1)) / clips.length
  console.log(`[FFmpeg] Target clip duration: ${clipDuration.toFixed(2)}s`)

  const filterComplex = buildFilterComplex(clips.length, clipDuration, srtPath)
  const audioIdx = clips.length // audio is the last input

  const args = [
    '-y',
    // Video inputs
    ...clips.flatMap(c => ['-i', c]),
    // Audio input
    '-i', voicePath,
    // Complex filter
    '-filter_complex', filterComplex,
    // Map outputs
    '-map', '[vout]',
    '-map', `${audioIdx}:a`,
    // Encoding
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-b:v', '2500k',
    '-b:a', '192k',
    '-preset', 'fast',
    '-crf', '22',
    '-movflags', '+faststart',
    '-shortest',
    '-avoid_negative_ts', 'make_zero',
    outputPath,
  ]

  await runFFmpeg(args)
  console.log(`[FFmpeg] Output: ${outputPath}`)
  return outputPath
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

/**
 * Full pipeline: voice → clips → SRT → stitch → upload → Supabase update.
 * Called from the route handler; errors bubble up and are caught there.
 */
async function processReel({ script, voice_id, project_id }) {
  const jobId = uuidv4().slice(0, 8)
  const jobDir = path.join(os.tmpdir(), `reelforge_${jobId}`)
  await fs.ensureDir(jobDir)

  console.log(`\n[Job ${jobId}] ▶ project=${project_id}`)
  console.log(`[Job ${jobId}] Script: "${script.slice(0, 80)}…"`)

  try {
    // 1 ── Voiceover ──────────────────────────────────────────────────────────
    console.log(`[Job ${jobId}] 1/4 Generating voiceover…`)
    const voicePath = path.join(jobDir, 'voice.mp3')
    await generateVoiceover(script, voice_id, voicePath)
    const audioDuration = await getMediaDuration(voicePath)
    console.log(`[Job ${jobId}] Audio: ${audioDuration.toFixed(1)}s`)

    // 2 ── Stock clips ────────────────────────────────────────────────────────
    console.log(`[Job ${jobId}] 2/4 Downloading stock clips…`)
    const keywords = extractKeywords(script, CLIP_COUNT)
    console.log(`[Job ${jobId}] Keywords: ${keywords.join(', ')}`)
    const clips = await downloadClips(keywords, jobDir)

    // 3 ── Subtitles + video processing ──────────────────────────────────────
    console.log(`[Job ${jobId}] 3/4 Processing video…`)
    const srtPath = path.join(jobDir, 'subs.srt')
    await fs.writeFile(srtPath, generateSRT(script, audioDuration))

    const outputPath = path.join(jobDir, 'final.mp4')
    await stitchVideo(clips, voicePath, srtPath, outputPath)

    // 4 ── Upload + Supabase ──────────────────────────────────────────────────
    console.log(`[Job ${jobId}] 4/4 Uploading to Cloudinary…`)
    const { videoUrl, voiceUrl } = await uploadToCloudinary(outputPath, voicePath, project_id)

    await updateVideoRecord(project_id, videoUrl, voiceUrl, Math.round(audioDuration))
    await updateProjectStatus(project_id, 'completed')

    console.log(`[Job ${jobId}] ✓ Done → ${videoUrl}`)
    return { videoUrl, voiceUrl }
  } catch (err) {
    console.error(`[Job ${jobId}] ✗ ${err.message}`)
    throw err
  } finally {
    await fs.remove(jobDir).catch(() => {})
    console.log(`[Job ${jobId}] Cleaned up ${jobDir}`)
  }
}

module.exports = { processReel }
