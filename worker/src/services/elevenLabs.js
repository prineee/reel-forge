'use strict'

const axios = require('axios')
const fs = require('fs')

const BASE_URL = 'https://api.elevenlabs.io/v1'

/**
 * Calls ElevenLabs TTS and writes the MP3 to outputPath.
 * Returns outputPath on success.
 */
async function generateVoiceover(text, voiceId, outputPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set')

  console.log(`[ElevenLabs] Generating voiceover | voice=${voiceId} | chars=${text.length}`)

  const response = await axios.post(
    `${BASE_URL}/text-to-speech/${voiceId}`,
    {
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    },
    {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      responseType: 'arraybuffer',
      timeout: 90_000,
    }
  )

  fs.writeFileSync(outputPath, Buffer.from(response.data))
  console.log(`[ElevenLabs] Saved to ${outputPath}`)
  return outputPath
}

module.exports = { generateVoiceover }
