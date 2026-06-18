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
const { assignShot }         = require('../services/cartoon/cameraDirector')
const { castVoices }         = require('../services/cartoon/voiceCasting')
const { generateSceneAudio } = require('../services/cartoon/dialogueAudio')
const { probeClip }          = require('../services/ffmpegUtils')

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

// ── Mux one scene's audio into its own video clip ─────────────────────────────
// The motion video is copied (already encoded by motionEffect). When the scene
// has dialogue, the audio is padded with silence (apad) and hard-cut to clipDur
// so the file is exactly clipDur long with a ~0.5s breathing tail. When the
// scene has no dialogue, a silent stereo track is generated instead. Either way
// every scene file is self-contained — audio can never drift across scenes.
function muxSceneAudio(videoPath, audioPath, outPath, clipDur) {
  const { spawn } = require('child_process')
  const args = audioPath
    ? [
        '-y',
        '-i', videoPath,
        '-i', audioPath,
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy',
        '-af', 'apad',
        '-t', clipDur.toFixed(4),
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
        '-movflags', '+faststart',
        outPath,
      ]
    : [
        '-y',
        '-i', videoPath,
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
        '-shortest',
        '-movflags', '+faststart',
        outPath,
      ]
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`scene mux FFmpeg exit ${code}: ${stderr.slice(-300)}`))
    })
    proc.on('error', reject)
  })
}

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

    // ── Step 2: Per-scene synchronized assembly ────────────────────────────
    // Each scene gets its OWN dialogue audio; its clip duration is derived from
    // that audio (ffprobe-measured); the audio is muxed into the scene clip.
    // There is no movie-wide dialogue track, so audio cannot drift across scene
    // boundaries — scene N's audio is locked to scene N's video by construction.
    send({ type: 'progress', pct: 10, message: `Building ${scenes.length} synchronized scenes...` })

    const audioDir = path.join(jobDir, 'audio')
    const clipDir  = path.join(jobDir, 'clips')
    const sceneDir = path.join(jobDir, 'scenes')
    await fs.ensureDir(audioDir)
    await fs.ensureDir(clipDir)
    await fs.ensureDir(sceneDir)

    const axios      = require('axios')
    const scenePaths = []
    let   anyAudio   = false

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      const num   = String(i + 1).padStart(3, '0')
      const pct   = 10 + Math.round((i / scenes.length) * 60)

      send({ type: 'progress', pct, message: `Scene ${i + 1}/${scenes.length}: recording dialogue...` })

      // 2a. Per-scene dialogue audio (per-line TTS + concat logic unchanged)
      const lines      = Array.isArray(scene.dialogue_json) ? scene.dialogue_json : []
      const sceneTmp   = path.join(audioDir, `scene_${num}`)
      await fs.ensureDir(sceneTmp)
      const sceneAudio = path.join(audioDir, `scene_${num}.mp3`)
      const audioMade  = await generateSceneAudio(lines, finalVoiceMap, sceneAudio, sceneTmp, `scene_${num}`)

      // 2b. Measure scene audio with ffprobe → derive clip duration
      let audioDur = 0
      if (audioMade) {
        try {
          const info = await probeClip(sceneAudio)
          audioDur   = info.duration || 0
        } catch (err) {
          console.warn(`[dlg-video] scene_${num}: ffprobe failed (${err.message}) — treating as silent`)
        }
      }
      if (audioDur > 0) anyAudio = true

      const clipDur = Math.max(audioDur + 0.5, 2)
      console.log(`[dlg-video] scene_${num}: audio=${audioDur.toFixed(3)}s → clip=${clipDur.toFixed(3)}s`)

      // 2c. Render the image clip — camera director + motion effects unchanged
      const videoOnly = path.join(clipDir, `clip_${num}.mp4`)
      try {
        if (scene.image_url) {
          const imgPath = path.join(jobDir, `img_${num}.jpg`)
          const imgRes  = await axios.get(scene.image_url, { responseType: 'arraybuffer', timeout: 30000 })
          fsSync.writeFileSync(imgPath, Buffer.from(imgRes.data))

          const shot = assignShot(i, scenes.length)
          console.log(`[dlg-video] scene_${num}: ${shot.label} → ${shot.motionEffect}`)
          await convertImageToVideoClip(imgPath, videoOnly, clipDur, shot.motionEffect)
        } else {
          await generateColorClip(videoOnly, clipDur, '#1a1a2e')
        }
      } catch (err) {
        console.error(`[dlg-video] scene_${num} clip failed: ${err.message} — using color`)
        await generateColorClip(videoOnly, clipDur)
      }

      // 2d. Mux THIS scene's audio into THIS scene's video → scene_NNN.mp4
      send({ type: 'progress', pct, message: `Scene ${i + 1}/${scenes.length}: syncing audio...` })
      const scenePath = path.join(sceneDir, `scene_${num}.mp4`)
      try {
        await muxSceneAudio(videoOnly, audioMade ? sceneAudio : null, scenePath, clipDur)
        const size = fsSync.existsSync(scenePath) ? fsSync.statSync(scenePath).size : 0
        if (size > 0) scenePaths.push({ path: scenePath, duration: clipDur })
      } catch (err) {
        console.error(`[dlg-video] scene_${num} mux failed: ${err.message}`)
      }
    }

    if (scenePaths.length === 0) throw new Error('No scene videos generated')
    if (!anyAudio) {
      throw new Error('No dialogue found. Run Write Dialogue before generating the dialogue movie.')
    }

    // ── Step 3: Concatenate the completed (audio-bearing) scene videos ─────
    // Each scene_NNN.mp4 already carries its own synced audio, so the concat
    // just stitches finished segments. No global dialogue track, no -t clamp.
    send({ type: 'progress', pct: 72, message: 'Stitching synchronized scenes...' })

    const concatPath  = path.join(jobDir, 'concat.txt')
    const concatLines = scenePaths.map(c => `file '${c.path}'`)
    fsSync.writeFileSync(concatPath, concatLines.join('\n') + '\n', 'utf8')

    const totalSecs = scenePaths.reduce((s, c) => s + c.duration, 0)

    // ── Step 4: Final encode — concat scene clips (each carries its own audio)
    send({ type: 'progress', pct: 75, message: 'Rendering movie with character dialogue...' })

    const outputPath = path.join(jobDir, 'cartoon_dialogue_final.mp4')
    const { spawn }  = require('child_process')

    await new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-f',       'concat', '-safe', '0', '-i', concatPath,
        '-c:v',     'libx264', '-preset', 'veryfast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-r', '30', '-vsync', 'cfr',
        '-c:a',     'aac', '-b:a', '128k', '-ar', '44100',
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
        movie_mode:       'dialogue',
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
