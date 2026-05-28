'use strict'

const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')

const SEARCH_URL = 'https://api.pexels.com/videos/search'

/**
 * Searches Pexels for a keyword and downloads the best landscape HD clip.
 * Selects randomly from the top 3 results for variety.
 */
async function downloadOneClip(keyword, outputPath) {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) throw new Error('PEXELS_API_KEY is not set')

  const { data } = await axios.get(SEARCH_URL, {
    headers: { Authorization: apiKey },
    params: { query: keyword, per_page: 5, orientation: 'landscape', size: 'medium' },
    timeout: 30_000,
  })

  const videos = data.videos
  if (!videos?.length) throw new Error(`No Pexels videos for "${keyword}"`)

  // Pick randomly from the top 3 for variety
  const video = videos[Math.floor(Math.random() * Math.min(3, videos.length))]

  // Prefer 1280×720 or wider MP4
  const files = (video.video_files || []).filter(f => f.file_type === 'video/mp4')
  const file =
    files.find(f => f.width >= 1280) ||
    files.sort((a, b) => b.width - a.width)[0]

  if (!file?.link) throw new Error(`No downloadable MP4 for "${keyword}"`)

  console.log(`[Pexels] "${keyword}" → ${file.width}×${file.height} | ${file.link.slice(0, 70)}…`)

  const dlRes = await axios.get(file.link, { responseType: 'stream', timeout: 120_000 })
  await pipeline(dlRes.data, fs.createWriteStream(outputPath))

  console.log(`[Pexels] Saved ${path.basename(outputPath)}`)
  return outputPath
}

/**
 * Downloads one clip per keyword, skipping failed keywords.
 * Throws if zero clips were obtained.
 */
async function downloadClips(keywords, targetDir) {
  const clips = []

  for (const keyword of keywords) {
    const dest = path.join(targetDir, `clip_${keyword}_${Date.now()}.mp4`)
    try {
      await downloadOneClip(keyword, dest)
      clips.push(dest)
    } catch (err) {
      console.warn(`[Pexels] Skipping "${keyword}": ${err.message}`)
    }
  }

  if (clips.length === 0) {
    throw new Error(`Failed to download any Pexels clips (tried: ${keywords.join(', ')})`)
  }

  console.log(`[Pexels] Downloaded ${clips.length}/${keywords.length} clips`)
  return clips
}

module.exports = { downloadClips }
