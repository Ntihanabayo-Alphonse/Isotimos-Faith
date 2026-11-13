import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { Check, CircleUserRound } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useProfile } from './ProfileProvider'
import { normalizeUsername, profileErrorMessage, saveMyProfile, usernameAvailable, validUsername } from './profileService'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Avatar } from '../../components/ui/Avatar'
import { ImageUploader } from './ImageUploader'

export function ProfilePage({ onboarding = false }: { onboarding?: boolean }) {
  const { profile } = useProfile()
  if (!profile) return null
  if (onboarding && profile.username) return <Navigate to="/app/profile" replace />
  return <ProfileEditor key={profile.id} onboarding={onboarding} />
}

function ProfileEditor({ onboarding }: { onboarding: boolean }) {
  const { session } = useAuth()
  const { profile, updateProfile } = useProfile()
  const navigate = useNavigate()
  const [username, setUsername] = useState(profile?.username ?? '')
  const [displayName, setDisplayName] = useState(profile?.display_name || String(session?.user.user_metadata.display_name || '').slice(0, 100))
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')
  const [coverUrl, setCoverUrl] = useState(profile?.cover_url ?? '')
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [availability, setAvailability] = useState<{ username: string; value: 'checking' | 'available' | 'taken' | 'error' } | null>(null)
  const normalized = normalizeUsername(username)
  const ownId = profile?.id

  useEffect(() => {
    let active = true
    if (!validUsername(normalized) || !ownId) return
    const timer = setTimeout(() => {
      setAvailability({ username: normalized, value: 'checking' })
      void usernameAvailable(normalized, ownId).then(available => {
        if (active) setAvailability({ username: normalized, value: available ? 'available' : 'taken' })
      }, () => { if (active) setAvailability({ username: normalized, value: 'error' }) })
    }, 400)
    return () => { active = false; clearTimeout(timer) }
  }, [normalized, ownId])
  const availabilityValue = availability?.username === normalized ? availability.value : null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || busy || uploading) return
    setError(''); setNotice('')
    if (!validUsername(normalized)) { setError('Use 3–30 lowercase letters, numbers, or underscores, starting with a letter.'); return }
    if (!displayName.trim()) { setError('Please enter a display name.'); return }
    setBusy(true)
    try {
      const saved = await saveMyProfile(profile.id, { username: normalized, display_name: displayName, bio, avatar_url: avatarUrl, cover_url: coverUrl })
      updateProfile(saved)
      setUsername(saved.username ?? ''); setDisplayName(saved.display_name); setBio(saved.bio); setAvatarUrl(saved.avatar_url ?? '')
      setCoverUrl(saved.cover_url ?? '')
      if (onboarding) navigate('/app', { replace: true })
      else setNotice('Your profile has been saved.')
    } catch (error) { setError(profileErrorMessage(error)) }
    finally { setBusy(false) }
  }

  return <div className="profile-page"><div className="page-heading"><div><span className="eyebrow">{onboarding ? 'WELCOME TO THE COMMUNITY' : 'YOUR MEMBER PROFILE'}</span><h1>{onboarding ? 'Let’s get to know you.' : 'Your story. Your faith.'}</h1><p>{onboarding ? 'Choose your community username to complete your profile.' : 'Share a little about the person behind your posts.'}</p></div></div>
    <div className="profile-layout"><Card className="profile-editor"><div className="profile-editor-heading"><CircleUserRound size={21} /><h2>{onboarding ? 'Complete your profile' : 'Edit profile'}</h2></div>
      <p className="profile-privacy">Your username, display name, bio, and avatar are public once you complete onboarding. Your email stays private.</p>
      <form onSubmit={submit} aria-busy={busy}>
        <label>Username<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={30} pattern="[a-z][a-z0-9_]{2,29}" value={username} onChange={event => { setUsername(event.target.value.toLowerCase()); setNotice('') }} aria-describedby="username-help username-status" disabled={busy} /><small id="username-help">3–30 lowercase letters, numbers, or underscores. Start with a letter.</small></label>
        <p id="username-status" className={`username-status ${availabilityValue === 'taken' ? 'form-error' : ''}`} role="status">{!validUsername(normalized) ? 'Choose a username to check availability.' : availabilityValue === 'available' ? 'This username is available. It is reserved only when you save.' : availabilityValue === 'taken' ? 'This username is already taken.' : availabilityValue === 'error' ? 'Availability could not be checked. We’ll verify it when you save.' : 'Checking username availability…'}</p>
        <label>Display name<input name="displayName" autoComplete="name" required maxLength={100} value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={busy} /></label>
        <label>Bio<textarea name="bio" rows={4} maxLength={500} placeholder="A little about you and your faith journey…" value={bio} onChange={event => setBio(event.target.value)} disabled={busy} /><small>{bio.length}/500 characters</small></label>
        <ImageUploader userId={profile!.id} kind="avatar" value={avatarUrl} disabled={busy || uploading} onChange={setAvatarUrl} onBusy={setUploading} />
        <ImageUploader userId={profile!.id} kind="cover" value={coverUrl} disabled={busy || uploading} onChange={setCoverUrl} onBusy={setUploading} />
        {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
        <Button type="submit" disabled={busy || uploading || availabilityValue === 'taken'}><Check size={17} />{uploading ? 'Uploading image…' : busy ? 'Saving…' : onboarding ? 'Complete profile & continue' : 'Save profile'}</Button>
        {!onboarding && <Link className="profile-cancel" to="/app/profile">Back to my profile</Link>}
      </form>
    </Card><Card className="profile-summary"><Avatar name={profile?.display_name || 'Community member'} src={profile?.avatar_url} /><h2>{profile?.display_name || 'Your display name'}</h2><span>{profile?.username ? `@${profile.username}` : 'Username awaiting onboarding'}</span><p>{profile?.bio || 'Your faith journey has a place here.'}</p><small>This shows your saved profile.</small></Card></div>
  </div>
}
