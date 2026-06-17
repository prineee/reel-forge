// FILE: worker/src/routes/cartoonDialogueRoutes.js
// AI Dialogue Movie pipeline: dialogue audio → scene clips → FFmpeg → Cloudinary

'use strict'

const express        = require('express')
const router         = express.Router()
const path           = require('path')
const os             = require('os')
const fs             = require('fs-extra')
const fsSync         = require('fs')
const { v4: uuidv4 } = require('uuid')
const { createClient } = require('@supabase/supabase-js')
const WebSocket        = require('ws')

const { convertImageToVideoClip, generateColorClip } = require('../services/cartoon/motionEffect')
const { assignShot }            = require('../services/cartoon/cameraDirector')
const { castVoices }            = require('../services/cartoon/voiceCasting')
const { generateDialogueAudio } = require('../services/cartoon/dialogueAudio')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: { transport: WebSocket },
    auth: { persistSession: false, autoRefreshToken: false },
  }
)

function resolveBin(envKey, systemPath, bareName) {
  if (process.env[envKey]) return process.env[envKey]
  if (fsSync.existsSync(systemPath)) return systemPath
  return bareName
}

const FFMPEG_BIN = resolveBin('FFMPEG_PATH', '/usr/bin/ffmpeg', 'ffmpeg')

// ── POST /api/cartoon/generate-dialogue-video (SSE) ──────────────────────────
router.post('/api/cartoon/generate-dialogue-video', async (req, res) => {
  const { story_id, scenes, voice_map, characters } = req.body

  if (!story_id || !scenes || !scenes.length) {
    return res.status(400).json({ error: 'story_id and scenes are required' })
  }

  res.setHeader('Content-Type',      'text/event-stream')
  res.setHeader('Cache-Control',     'no-cache')
  res.setHeader('Connection',        'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  function send(data) {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`) } catch {}
  }

  const jobId  = uuidv4().slice(0, 8)
  const jobDir = path.join(os.tmpdir(), `cartoon_dlg_${jobId}`)
  await fs.ensureDir(jobDir)

  send({ type: 'start', story_id, total_scenes: scenes.length })

  try {
    await supabase.from('cartoon_stories')
      .update({ status: 'generating_video' })
      .eq('id', story_id)

    // ── Step 1: Resolve voice map ──────────────────────────────────────────
    send({ type: 'progress', pct: 5, message: 'Preparing character voices...' })

    const finalVoiceMap = (voice_map && Object.keys(voice_map).length > 0)
      ? voice_map
      : castVoices(characters || [])

    // ── Step 2: Collect all dialogue lines across scenes ───────────────────
    const allLines = []
    for (const scene of scenes) {
      if (Array.isArray(scene.dialogue_json)) {
        allLines.push(...scene.dialogue_json)
      }
    }

    if (allLines.length === 0) {
      throw new Error('No dialogue found. Run Write Dialogue before generating the dialogue movie.')
    }

    // ── Step 3: Generate combined dialogue audio ───────────────────────────
    send({ type: 'progress', pct: 10, message: `Recording ${allLines.length} dialogue lines...` })

    const dialoguePath = path.join(jobDir, 'dialogue.mp3')
    await generateDialogueAudio(allLines, finalVoiceMap, dialoguePath, jobDir)

    send({ type: 'progress', pct: 28, message: 'Dialogue audio ready' })

    // ── Step 4: Convert scene images to video clips ────────────────────────
    send({ type: 'progress', pct: 30, message: `Processing ${scenes.length} scene clips...` })

    const clipDir   = path.join(jobDir, 'clips')
    await fs.ensureDir(clipDir)
    const clipPaths = []

    for (let i = 0; i < scenes.length; i++) {
      const scene    = scenes[i]
      const clipPath = path.join(clipDir, `clip_${String(i).padStart(3, '0')}.mp4`)
      const pct      = 30 + Math.round((i / scenes.length) * 40)

      send({ type: 'progress', pct, message: `Processing scene ${i + 1}/${scenes.length}...` })

      try {
        if (scene.image_url) {
          const axios   = require('axios')
          const imgPath = path.join(jobDir, `img_${i}.jpg`)
          const imgRes  = await axios.get(scene.image_url, { responseType: 'arraybuffer', timeout: 30000 })
          fsSync.writeFileSync(imgPath, Buffer.from(imgRes.data))

          const shot = assignShot(i, scenes.length)
          console.log(`[dlg-video] Scene ${i + 1}: ${shot.label} → ${shot.motionEffect}`)
          await convertImageToVideoClip(imgPath, clipPath, scene.duration_seconds || 5, shot.motionEffect)
        } else {
          await generateColorClip(clipPath, scene.duration_seconds || 5, '#1a1a2e')
        }

        const size = fsSync.existsSync(clipPath) ? fsSync.statSync(clipPath).size : 0
        if (size > 0) {
          clipPaths.push({ path: clipPath, duration: scene.duration_seconds || 5 })
        }
      } catch (err) {
        console.error(`[dlg-video] Clip ${i + 1} failed: ${err.message} — using color`)
        await generateColorClip(clipPath, scene.duration_seconds || 5)
        clipPaths.push({ path: clipPath, duration: scene.duration_seconds || 5 })
      }
    }

    if (clipPaths.length === 0) throw new Error('No video clips generated')

    // ── Step 5: Build concat.txt ───────────────────────────────────────────
    send({ type: 'progress', pct: 72, message: 'Building timeline...' })

    const concatPath = path.join(jobDir, 'concat.txt')
    const concatLines = []
    for (const clip of clipPaths) {
      concatLines.push(`file '${clip.path}'`)
      concatLines.push(`duration ${clip.duration.toFixed(4)}`)
    }
    concatLines.push(`file '${clipPaths[clipPaths.length - 1].path}'`)
    fsSync.writeFileSync(concatPath, concatLines.join('\n') + '\n', 'utf8')

    const totalSecs = clipPaths.reduce((s, c) => s + c.duration, 0)

    // ── Step 6: FFmpeg render — video clips + dialogue audio ───────────────
    send({ type: 'progress', pct: 75, message: 'Rendering movie with character dialogue...' })

    const outputPath = path.join(jobDir, 'cartoon_dialogue_final.mp4')
    const { spawn }  = require('child_process')

    await new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-f',       'concat', '-safe', '0', '-i', concatPath,
        '-i',       dialoguePath,
        '-map',     '0:v:0', '-map', '1:a:0',
        '-c:v',     'libx264', '-preset', 'veryfast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-r', '30', '-vsync', 'cfr',
        '-c:a',     'aac', '-b:a', '128k', '-ar', '44100',
        '-t',       String(Math.ceil(totalSecs)),
        '-b:v',     '600k', '-maxrate', '900k', '-bufsize', '1800k',
        '-movflags', '+faststart',
        outputPath,
      ]
      const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr   = ''
      proc.stderr.on('data', d => { stderr += d.toString() })
      proc.on('close', code => {
        if (code === 0) resolve()
        else reject(new Error(`FFmpeg exit ${code}: ${stderr.slice(-300)}`))
      })
      proc.on('error', reject)
    })

    const outSize = fsSync.existsSync(outputPath) ? fsSync.statSync(outputPath).size : 0
    if (outSize === 0) throw new Error('FFmpeg produced empty output')

    // ── Step 7: Upload to Cloudinary ───────────────────────────────────────
    send({ type: 'progress', pct: 88, message: 'Uploading movie...' })

    const cloudinary = require('cloudinary').v2
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    })

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_large(
        outputPath,
        {
          resource_type: 'video',
          folder:        'reelforge/cartoon/videos',
          public_id:     `story_${story_id}_dialogue`,
          overwrite:     true,
          chunk_size:    6 * 1024 * 1024,
          timeout:       300000,
        },
        (err, result) => {
          if (err) reject(new Error(`Cloudinary: ${err.message}`))
          else     resolve(result)
        }
      )
    })

    const videoUrl = uploadResult.secure_url

    // ── Step 8: Update DB ──────────────────────────────────────────────────
    await supabase.from('cartoon_stories')
      .update({
        status:           'completed',
        video_url:        videoUrl,
        movie_mode:       'ai_dialogue',
        duration_seconds: Math.ceil(totalSecs),
        thumbnail_url:    scenes[0]?.image_url || null,
      })
      .eq('id', story_id)

    send({ type: 'done', video_url: videoUrl, story_id, duration: Math.ceil(totalSecs) })
    console.log(`[dlg-video] Complete: ${videoUrl}`)

  } catch (err) {
    console.error(`[dlg-video] FAILED: ${err.message}`)
    await supabase.from('cartoon_stories').update({ status: 'failed' }).eq('id', story_id)
    send({ type: 'error', error: err.message })
  } finally {
    await fs.remove(jobDir).catch(() => {})
    res.end()
  }
})

module.exports = router
