import { describe, expect, it } from 'vitest'
import { authErrorMessage, safeDestination } from '../src/features/auth/authErrors'
import { isPublicKey, validSupabaseConfig } from '../src/lib/env'
import { normalizeUsername, profileErrorMessage, validUsername } from '../src/features/profiles/profileService'
import { supabase, supabaseConfigured } from '../src/lib/supabase'

describe('safe public configuration and validation', () => {
  it('runs tests without loading the real project credentials', () => {
    expect(supabaseConfigured).toBe(false)
    expect(supabase).toBeNull()
  })
  it('accepts only public key types and HTTPS or local development origins', () => {
    const jwt = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`
    expect(isPublicKey('sb_publishable_test')).toBe(true)
    expect(isPublicKey(jwt('anon'))).toBe(true)
    expect(isPublicKey(jwt('service_role'))).toBe(false)
    expect(isPublicKey('sb_secret_test')).toBe(false)
    expect(isPublicKey('sb_publishable_')).toBe(false)
    expect(validSupabaseConfig('https://example.supabase.co', 'sb_publishable_test')).toBe(true)
    expect(validSupabaseConfig('http://localhost:54321', 'sb_publishable_test')).toBe(true)
    expect(validSupabaseConfig('http://example.com', 'sb_publishable_test')).toBe(false)
    expect(validSupabaseConfig('https://user:password@example.com', 'sb_publishable_test')).toBe(false)
    expect(validSupabaseConfig('not a url', 'sb_publishable_test')).toBe(false)
  })
  it('never navigates to an external or unrecognized post-login target', () => {
    for (const unsafe of ['https://evil.example', '//evil.example', '/login', '/administrator', 42, null]) expect(safeDestination(unsafe)).toBe('/app')
    expect(safeDestination('/app/profile')).toBe('/app/profile')
    expect(safeDestination('/admin')).toBe('/admin')
  })
  it('normalizes usernames and mirrors the database format', () => {
    expect(normalizeUsername(' Grace_123 ')).toBe('grace_123')
    expect(validUsername('grace_123')).toBe(true)
    for (const invalid of ['ab', '1alice', 'ALICE', 'alice.dot', 'a'.repeat(31)]) expect(validUsername(invalid)).toBe(false)
  })
  it('maps a database uniqueness race and hides unexpected internal error details', () => {
    expect(profileErrorMessage({ code: '23505' })).toContain('just been taken')
    expect(authErrorMessage({ message: 'private database password' })).not.toContain('private database password')
  })
})
