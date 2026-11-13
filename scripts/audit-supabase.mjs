import { loadEnv } from 'vite'

// Read-only anonymous schema probes. Never print credentials, URLs, or profile data.
const env = loadEnv('development', process.cwd(), 'VITE_')
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key || !key.startsWith('sb_publishable_')) {
  console.log('Audit skipped: expected configured URL and publishable key. Values are hidden.')
  process.exit(1)
}
const probes = [
  ['profiles public columns', '/rest/v1/profiles?select=id,username,display_name,bio,avatar_url,created_at,updated_at&limit=0'],
  ['user_roles anonymous visibility (must be denied)', '/rest/v1/user_roles?select=user_id,role&limit=0'],
]
for (const [label, path] of probes) {
  try {
    const response = await fetch(new URL(path, url), { headers: { apikey: key }, signal: AbortSignal.timeout(12_000) })
    const body = await response.json().catch(() => null)
    console.log(`${label}: HTTP ${response.status}; code ${!response.ok && body?.code ? body.code : 'none'}`)
  } catch { console.log(`${label}: network unavailable; no remote state verified`); process.exitCode = 1 }
}
console.log('These anonymous probes cannot prove migration history, policies, function definitions, or authenticated privileges. Run the read-only SQL audit in docs/supabase-audit.sql for authoritative inspection.')
