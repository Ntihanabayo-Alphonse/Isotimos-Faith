export function isPublicKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true
  try {
    const payload = JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role === 'anon'
  } catch { return false }
}

export function validSupabaseConfig(url: string | undefined, key: string | undefined): boolean {
  if (!url || !key || !isPublicKey(key)) return false
  try {
    const parsed = new URL(url)
    return !parsed.username && !parsed.password && (
      parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
    )
  } catch { return false }
}
