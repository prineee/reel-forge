'use strict'

const { createClient } = require('@supabase/supabase-js')

/**
 * Creates a Supabase client using the service-role key (bypasses RLS).
 * Strips any trailing path from NEXT_PUBLIC_SUPABASE_URL if SUPABASE_URL is absent —
 * the env may contain the JWKS endpoint URL instead of the project base URL.
 */
function getClient() {
  const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!rawUrl) throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set')
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  // Extract base URL: everything up to (but not including) /auth, /rest, /realtime, /storage
  const baseUrl = rawUrl.replace(/\/(auth|rest|realtime|storage)(\/.*)?$/, '')

  return createClient(baseUrl, serviceKey, { auth: { persistSession: false } })
}

/**
 * Upserts the video record for a project — updates if a row already exists,
 * inserts a new one otherwise.
 */
async function updateVideoRecord(projectId, videoUrl, voiceUrl, duration) {
  const db = getClient()

  const { data: existing } = await db
    .from('videos')
    .select('id')
    .eq('project_id', projectId)
    .maybeSingle()

  let error
  if (existing) {
    ;({ error } = await db
      .from('videos')
      .update({ video_url: videoUrl, voice_url: voiceUrl, duration })
      .eq('project_id', projectId))
  } else {
    ;({ error } = await db
      .from('videos')
      .insert({ project_id: projectId, video_url: videoUrl, voice_url: voiceUrl, duration }))
  }

  if (error) throw new Error(`Supabase videos update: ${error.message}`)
  console.log('[Supabase] videos record saved')
}

/**
 * Sets projects.status for a given project_id.
 * Valid values: 'draft' | 'processing' | 'completed' | 'failed'
 */
async function updateProjectStatus(projectId, status) {
  const db = getClient()
  const { error } = await db.from('projects').update({ status }).eq('id', projectId)
  if (error) throw new Error(`Supabase projects update: ${error.message}`)
  console.log(`[Supabase] project ${projectId} → ${status}`)
}

module.exports = { updateVideoRecord, updateProjectStatus }
