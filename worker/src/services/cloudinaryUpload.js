'use strict'

const cloudinary = require('cloudinary').v2

/**
 * Parses CLOUDINARY_URL and configures the SDK.
 * Format: cloudinary://api_key:api_secret@cloud_name
 */
function initCloudinary() {
  const url = process.env.CLOUDINARY_URL
  if (!url) throw new Error('CLOUDINARY_URL is not set')

  const m = url.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/)
  if (!m) {
    throw new Error(
      'Invalid CLOUDINARY_URL. Expected: cloudinary://api_key:api_secret@cloud_name'
    )
  }
  cloudinary.config({ api_key: m[1], api_secret: m[2], cloud_name: m[3] })
}

function uploadFile(localPath, options) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(localPath, options, (err, result) => {
      if (err) reject(new Error(`Cloudinary upload failed: ${err.message}`))
      else     resolve(result)
    })
  })
}

/**
 * Uploads the final MP4 and voiceover MP3 to Cloudinary.
 * Returns { videoUrl, voiceUrl } (both secure_url strings).
 */
async function uploadToCloudinary(videoPath, voicePath, projectId) {
  initCloudinary()

  console.log('[Cloudinary] Uploading video…')
  const videoResult = await uploadFile(videoPath, {
    resource_type: 'video',
    folder: 'reelforge/reels',
    public_id: `reel_${projectId}`,
    overwrite: true,
    eager: [{ quality: 'auto', fetch_format: 'mp4' }],
  })

  console.log('[Cloudinary] Uploading voiceover…')
  const voiceResult = await uploadFile(voicePath, {
    resource_type: 'video',   // Cloudinary treats audio as resource_type 'video'
    folder: 'reelforge/audio',
    public_id: `voice_${projectId}`,
    overwrite: true,
  })

  console.log(`[Cloudinary] video=${videoResult.secure_url.slice(-40)}`)
  console.log(`[Cloudinary] voice=${voiceResult.secure_url.slice(-40)}`)

  return {
    videoUrl: videoResult.secure_url,
    voiceUrl: voiceResult.secure_url,
  }
}

module.exports = { uploadToCloudinary }
