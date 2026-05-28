'use strict'

const express = require('express')
const router = express.Router()

const { processReel } = require('../services/videoProcessor')
const { updateProjectStatus } = require('../services/supabase')

/**
 * POST /generate-reel
 * Body: { script: string, voice_id: string, project_id: string }
 *
 * Immediately responds 202 Accepted and kicks off background processing.
 * Progress is tracked in Supabase (projects.status → processing / completed / failed).
 */
router.post('/generate-reel', async (req, res) => {
  const { script, voice_id, project_id } = req.body

  if (!script?.trim())     return res.status(400).json({ error: 'script is required' })
  if (!voice_id?.trim())   return res.status(400).json({ error: 'voice_id is required' })
  if (!project_id?.trim()) return res.status(400).json({ error: 'project_id is required' })

  // Acknowledge immediately — video processing takes 1-3 minutes
  res.status(202).json({
    status: 'processing',
    project_id,
    message: 'Reel generation started. Poll project status or subscribe to Supabase realtime for updates.',
  })

  // Mark project as processing
  updateProjectStatus(project_id, 'processing').catch(err =>
    console.error('[route] Failed to set status=processing:', err.message)
  )

  // Kick off the pipeline in the background
  processReel({ script, voice_id, project_id }).catch(async err => {
    console.error(`[route] Pipeline failed for ${project_id}:`, err.message)
    try {
      await updateProjectStatus(project_id, 'failed')
    } catch (e2) {
      console.error('[route] Also failed to set status=failed:', e2.message)
    }
  })
})

module.exports = router
