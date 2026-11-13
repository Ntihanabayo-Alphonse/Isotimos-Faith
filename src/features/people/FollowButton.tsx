import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Check, UserPlus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useProfile } from '../profiles/ProfileProvider'
import { Button } from '../../components/ui/Button'
import { peopleErrorMessage, setFollowing } from './peopleService'
import type { Member } from './peopleService'

export function FollowButton({ member, onChanged }: { member: Member; onChanged: () => Promise<void> }) {
  const { session } = useAuth()
  const { profile } = useProfile()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (session?.user.id === member.id) return null
  if (!session) return <Link className="btn btn-primary" to="/login" state={{ from: location.pathname }}>Sign in to follow</Link>
  if (!session.user.email_confirmed_at || !profile?.username) return <Link className="btn btn-primary" to="/app">Complete your profile to follow</Link>
  return <div className="follow-control"><Button variant={member.is_following ? 'secondary' : 'primary'} disabled={busy} onClick={async () => {
    setBusy(true); setError('')
    let saved = false
    try { await setFollowing(session.user.id, member.id, !member.is_following); saved = true; await onChanged() }
    catch (error) { setError(saved ? 'Your connection was updated, but counts could not refresh. Reload to see the latest state.' : peopleErrorMessage(error)) }
    finally { setBusy(false) }
  }}>{member.is_following ? <Check size={16} /> : <UserPlus size={16} />}{busy ? 'Updating…' : member.is_following ? 'Unfollow' : 'Follow'}</Button>{error && <p role="alert" className="form-error">{error}</p>}</div>
}
