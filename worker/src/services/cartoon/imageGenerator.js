// FILE: worker/src/services/cartoon/imageGenerator.js
// Phase 2 — Flux image generation via Together.ai (primary) + Replicate (fallback)
// Cost: Together.ai $0.0008/image, Replicate $0.003/image

'use strict'

const axios = require('axios')
const fs    = require('fs')
const path  = require('path')

// ── Style prompt suffixes ─────────────────────────────────────────────────────
const STYLE_PROMPTS = {
  anime:      'anime style, Studio Ghibli inspired, clean lines, vibrant colors, expressive characters, 9:16 vertical composition, high quality',
  cartoon:    'western cartoon style, bold black outlines, flat vivid colors, exaggerated expressions, 9:16 vertical composition, high quality',
  comic_book: 'comic book style, bold ink outlines, halftone shading, dramatic lighting, Marvel DC style, 9:16 vertical composition',
  watercolor: 'watercolor illustration, soft edges, pastel colors, artistic brush strokes, 9:16 vertical composition',
  pixel_art:  '16-bit pixel art style, retro game aesthetic, chunky pixels, vibrant palette, 9:16 vertical',
  clay:       'claymation style, 3D clay figures, smooth surfaces, warm lighting, stop-motion aesthetic, 9:16 vertical',
  cinematic:  'photorealistic cinematic, dramatic lighting, film grain, epic composition, 9:16 vertical',
  sketch:     'pencil sketch illustration, hand-drawn, black and white with subtle shading, 9:16 vertical',
}

// ── Build full image prompt ───────────────────────────────────────────────────
function buildFullPrompt(scene, characters, visualStyle) {
  const styleSuffix = STYLE_PROMPTS[visualStyle] || STYLE_PROMPTS.anime

  // Inject character visual prompts for consistency
  const charFragments = (scene.characters_in_scene || [])
    .map(name => {
      const char = (characters || []).find(
        c => c.name && c.name.toLowerCase() === name.toLowerCase()
      )
      return char ? char.visual_prompt : null
    })
    .filter(Boolean)
    .join('. ')

  const parts = [
    scene.visual_description || scene.image_prompt || '',
    charFragments ? `Characters: ${charFragments}` : '',
    styleSuffix,
    'no text, no watermarks, no logos',
  ].filter(Boolean)

  return parts.join('. ')
}

// ── Together.ai Flux Schnell ──────────────────────────────────────────────────
// $0.0008 per image — cheapest option
async function generateWithTogether(prompt, apiKey) {
  const response = await axios.post(
    'https://api.together.xyz/v1/images/generations',
    {
      model:           'black-forest-labs/FLUX.1-schnell-Free',
      prompt,
      width:           720,
      height:          1280,
      steps:           4,
      n:               1,
      response_format: 'b64_json',
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      timeout: 60000,
    }
  )

  const b64 = response.data?.data?.[0]?.b64_json
  if (!b64) throw new Error('Together.ai returned no image data')

  console.log(`[imageGen/Together] Success, b64 length=${b64.length}`)
  return Buffer.from(b64, 'base64')
}

// ── Replicate Flux Schnell ────────────────────────────────────────────────────
// $0.003 per image — fallback
async function generateWithReplicate(prompt, apiKey) {
  // Start prediction
  const startRes = await axios.post(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    {
      input: {
        prompt,
        aspect_ratio:      '9:16',
        output_format:     'jpg',
        output_quality:    80,
        num_outputs:       1,
        num_inference_steps: 4,
      },
    },
    {
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type':  'application/json',
      },
      timeout: 30000,
    }
  )

  const predictionId = startRes.data?.id
  if (!predictionId) throw new Error('Replicate returned no prediction ID')

  console.log(`[imageGen/Replicate] Prediction started: ${predictionId}`)

  // Poll for completion
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(r => setTimeout(r, 2000))

    const pollRes = await axios.get(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      {
        headers: { 'Authorization': `Token ${apiKey}` },
        timeout: 15000,
      }
    )

    const status = pollRes.data?.status
    console.log(`[imageGen/Replicate] Poll ${attempt + 1}: status=${status}`)

    if (status === 'succeeded') {
      const imageUrl = pollRes.data?.output?.[0]
      if (!imageUrl) throw new Error('Replicate succeeded but no output URL')

      // Download the image
      const imgRes = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout:      30000,
      })
      console.log(`[imageGen/Replicate] Downloaded image: ${imgRes.data.byteLength} bytes`)
      return Buffer.from(imgRes.data)
    }

    if (status === 'failed' || status === 'canceled') {
      throw new Error(`Replicate prediction ${status}: ${pollRes.data?.error || 'unknown error'}`)
    }
  }

  throw new Error('Replicate prediction timed out after 60 seconds')
}

// ── Pollinations.ai ───────────────────────────────────────────────────────────
// FREE — no API key needed, last resort fallback
async function generateWithPollinations(prompt) {
  const encoded = encodeURIComponent(prompt.slice(0, 500))
  const url     = `https://image.pollinations.ai/prompt/${encoded}?width=720&height=1280&nologo=true&enhance=true`

  console.log(`[imageGen/Pollinations] Fetching: ${url.slice(0, 100)}...`)

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout:      60000,
  })

  const buf = Buffer.from(response.data)
  if (buf.length < 5000) throw new Error(`Pollinations returned too-small image: ${buf.length} bytes`)

  console.log(`[imageGen/Pollinations] Success: ${buf.length} bytes`)
  return buf
}

// ── Upload image buffer to Cloudinary ─────────────────────────────────────────
async function uploadImageToCloudinary(imageBuffer, sceneId, storyId) {
  const cloudinary = require('cloudinary').v2

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder:        `reelforge/cartoon/stories/${storyId}`,
        public_id:     `scene_${sceneId}`,
        overwrite:     true,
        transformation: [
          { width: 720, height: 1280, crop: 'fill' },
        ],
      },
      (err, result) => {
        if (err) reject(new Error(`Cloudinary upload failed: ${err.message}`))
        else     resolve(result.secure_url)
      }
    )
    uploadStream.end(imageBuffer)
  })
}

// ── Main: generate image for one scene ───────────────────────────────────────
async function generateSceneImage(scene, characters, visualStyle) {
  const togetherKey  = process.env.TOGETHER_API_KEY
  const replicateKey = process.env.REPLICATE_API_KEY

  const prompt = buildFullPrompt(scene, characters, visualStyle)
  console.log(`[imageGen] Scene ${scene.scene_number}: prompt="${prompt.slice(0, 100)}..."`)

  let imageBuffer = null

  // Attempt 1: Together.ai (cheapest — $0.0008/image)
  if (togetherKey && !imageBuffer) {
    try {
      console.log(`[imageGen] Trying Together.ai...`)
      imageBuffer = await generateWithTogether(prompt, togetherKey)
    } catch (err) {
      console.warn(`[imageGen] Together.ai failed: ${err.message}`)
    }
  }

  // Attempt 2: Replicate Flux Schnell ($0.003/image)
  if (replicateKey && !imageBuffer) {
    try {
      console.log(`[imageGen] Trying Replicate...`)
      imageBuffer = await generateWithReplicate(prompt, replicateKey)
    } catch (err) {
      console.warn(`[imageGen] Replicate failed: ${err.message}`)
    }
  }

  // Attempt 3: Pollinations.ai (FREE, no key needed)
  if (!imageBuffer) {
    try {
      console.log(`[imageGen] Trying Pollinations.ai (free fallback)...`)
      imageBuffer = await generateWithPollinations(prompt)
    } catch (err) {
      console.warn(`[imageGen] Pollinations failed: ${err.message}`)
    }
  }

  if (!imageBuffer) {
    throw new Error(`All image generation providers failed for scene ${scene.scene_number}`)
  }

  // Upload to Cloudinary
  const imageUrl = await uploadImageToCloudinary(
    imageBuffer,
    scene.id,
    scene.story_id
  )

  console.log(`[imageGen] Scene ${scene.scene_number} complete: ${imageUrl}`)
  return imageUrl
}

module.exports = { generateSceneImage, buildFullPrompt }