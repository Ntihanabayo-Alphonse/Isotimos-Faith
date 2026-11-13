import { createClient } from '@supabase/supabase-js'
import { validSupabaseConfig } from './env'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

// Read only the presence of callback errors before SDK initialization clears the URL.
// Never echo provider error descriptions, tokens, or the callback URL into the UI/logs.
const callbackParams = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.hash.slice(1)) : new URLSearchParams()
export const authRedirectError = callbackParams.has('error') ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('error'))

export const supabaseConfigured = validSupabaseConfig(url, key)

export const supabase = supabaseConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
