// FILE: worker/src/services/cartoon/motionEffect.js
// Phase 2 — FFmpeg motion effects: converts static cartoon images to video clips

'use strict'

const { spawn } = require('child_process')
const path      = require('path')
const fs        = require('fs')

function resolveBin(envKey, systemPath, bareName) {
  if (process.env[envKey]) return process.env[envKey]
  if (fs.existsSync(systemPath)) return systemPath
  return bareName
}

const FFMPEG_BIN = resolveBin('FFMPEG_PATH', '/usr/bin/ffmpeg', 'ffmpeg')

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

// ── Motion effect builders ────────────────────────────────────────────────────
function getZoompanFilter(motionEffect, durationSecs) {
  const frames = Math.round(durationSecs * 30)
  const d      = frames

  switch (motionEffect) {
    case 'zoom_in':
      return `zoompan=z='min(zoom+0.0008,1.3)':d=${d}:s=720x1280:fps=30`

    case 'zoom_out':
      return `zoompan=z='if(lte(on,1),1.3,max(1.001,zoom-0.0008))':d=${d}:s=720x1280:fps=30`

    case 'pan_left':
      return `zoompan=z=1.2:x='if(lte(on,1),iw/4,x-1.5)':y='ih/2-(ih/zoom/2)':d=${d}:s=720x1280:fps=30`

    case 'pan_right':
      return `zoompan=z=1.2:x='if(lte(on,1),0,x+1.5)':y='ih/2-(ih/zoom/2)':d=${d}:s=720x1280:fps=30`

    case 'ken_burns':
      return `zoompan=z='min(zoom+0.0012,1.5)':x='iw/2-(iw/zoom/2)+sin(on/30)*20':d=${d}:s=720x1280:fps=30`

    case 'static':
    default:
      // No zoompan — just scale/crop to fill
      return null
  }
}

// ── Convert image to video clip with motion effect ────────────────────────────
async function convertImageToVideoClip(imagePath, outputPath, durationSecs, motionEffect) {
  const dur    = Math.max(Number(durationSecs) || 5, 2)
  const effect = motionEffect || 'ken_burns'

  console.log(`[motion] ${path.basename(imagePath)} → ${path.basename(outputPath)} | effect=${effect} dur=${dur}s`)

  const zoompanFilter = getZoompanFilter(effect, dur)

  // Build vf filter chain
  const filterParts = [
    'scale=720:1280:force_original_aspect_ratio=increase',
    'crop=720:1280',
  ]

  if (zoompanFilter) {
    // For zoompan, we need different scale approach
    const vfWithZoom = [
      'scale=8000:-1',               // upscale for zoom headroom
      zoompanFilter,
      'scale=720:1280',
      'format=yuv420p',
      'setsar=1:1',
    ].join(',')

    await runFFmpeg([
      '-y',
      '-loop',  '1',
      '-i',     imagePath,
      '-t',     String(dur),
      '-vf',    vfWithZoom,
      '-c:v',   'libx264',
      '-preset','ultrafast',
      '-crf',   '28',
      '-pix_fmt','yuv420p',
      '-r',     '30',
      '-video_track_timescale', '90000',
      '-an',
      '-movflags', '+faststart',
      outputPath,
    ])
  } else {
    // Static — simple scale/crop
    await runFFmpeg([
      '-y',
      '-loop',  '1',
      '-i',     imagePath,
      '-t',     String(dur),
      '-vf',    'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuv420p,setsar=1:1',
      '-c:v',   'libx264',
      '-preset','ultrafast',
      '-crf',   '28',
      '-pix_fmt','yuv420p',
      '-r',     '30',
      '-video_track_timescale', '90000',
      '-an',
      '-movflags', '+faststart',
      outputPath,
    ])
  }

  const size = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0
  if (size === 0) throw new Error(`Motion effect produced empty file: ${outputPath}`)

  console.log(`[motion] Done: ${path.basename(outputPath)} (${size} bytes)`)
  return outputPath
}

// ── Generate solid color placeholder video ────────────────────────────────────
async function generateColorClip(outputPath, durationSecs, color) {
  const dur = Math.max(Number(durationSecs) || 5, 2)
  const col = (color || '#1a1a2e').replace('#', '0x')

  await runFFmpeg([
    '-y',
    '-f',    'lavfi',
    '-i',    `color=c=${col}:s=720x1280:r=30`,
    '-t',    String(dur),
    '-c:v',  'libx264',
    '-preset','ultrafast',
    '-crf',  '28',
    '-pix_fmt','yuv420p',
    '-r',    '30',
    '-an',
    '-movflags', '+faststart',
    outputPath,
  ])

  console.log(`[motion] Color clip: ${path.basename(outputPath)} (${dur}s color=${color})`)
  return outputPath
}

module.exports = { convertImageToVideoClip, generateColorClip }