import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { CalendarDays, Cross, Pencil, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useProfile } from '../profiles/ProfileProvider'
import { Avatar } from '../../components/ui/Avatar'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { AppLayout } from '../../components/layout/AppLayout'
import { FollowButton } from './FollowButton'
import { getMember, peopleErrorMessage } from './peopleService'
import type { Member } from './peopleService'

export function PublicMemberLayout() {
  const { session } = useAuth()
  const { profile } = useProfile()
  if (session?.user.email_confirmed_at && profile?.username) return <AppLayout />
  return <><header className="topbar"><div className="topbar-inner public-profile-topbar"><Link to="/app" className="brand"><span className="brand-mark"><Cross size={24} /></span><span>isotimos<span className="brand-faith">faith</span></span></Link><Link className="btn btn-primary" to="/login">Sign in</Link></div></header><main className="public-member-content"><Outlet /></main></>
}

export function MyProfile() {
  const { profile } = useProfile()
  return <MemberProfile ownUsername={profile?.username ?? undefined} />
}

export function MemberProfile({ ownUsername }: { ownUsername?: string }) {
  const params = useParams()
  const username = ownUsername ?? params.username ?? ''
  const { session } = useAuth()
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [failedCover, setFailedCover] = useState<string | null>(null)
  const token = session?.access_token
  const identity = `${username}:${token ?? ''}`
  const latestIdentity = useRef(identity)
  useEffect(() => {
    latestIdentity.current = identity
    let active = true
    setMember(null); setLoading(true); setError('')
    if (!/^[a-z][a-z0-9_]{2,29}$/.test(username)) { setLoading(false); return }
    void getMember(username).then(result => { if (active) { setMember(result); setLoading(false) } }, error => {
      if (active) { setError(peopleErrorMessage(error)); setLoading(false) }
    })
    return () => { active = false }
  }, [username, token, identity, attempt])
  const refresh = useCallback(async () => {
    const result = await getMember(username)
    if (latestIdentity.current === identity) setMember(result)
  }, [username, identity])
  if (loading) return <div className="directory-status" role="status">Loading member profile…</div>
  if (error) return <div className="directory-status"><p className="form-error" role="alert">{error}</p><Button onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>
  if (!member) return <Card className="people-empty"><Users size={34} /><h1>Member not found</h1><p>This username may have changed, or the member has not completed their profile.</p><Link className="btn btn-primary" to={session ? '/app/people' : '/login'}>{session ? 'Discover people' : 'Sign in'}</Link></Card>
  const own = session?.user.id === member.id
  const date = new Date(member.created_at)
  return <div className="member-profile-page"><div className="page-heading"><div><span className="eyebrow">{own ? 'YOUR MEMBER PROFILE' : 'OUR COMMUNITY'}</span><h1>{own ? 'Your story. Your faith.' : 'Walking together in faith.'}</h1><p>A shared faith. A unique journey.</p></div><Link className="btn btn-secondary" to={session ? '/app/people' : '/login'}>{session ? 'Discover people' : 'Join the conversation'}</Link></div>
    <Card className="member-profile-card"><div className="member-profile-cover">{member.cover_url && member.cover_url !== failedCover && <img src={member.cover_url} alt={`${member.display_name}'s cover`} referrerPolicy="no-referrer" onError={() => setFailedCover(member.cover_url)} />}</div><div className="member-profile-body"><div className="member-profile-identity"><Avatar name={member.display_name} src={member.avatar_url} /><div className="member-profile-buttons">{own ? <Link className="btn btn-primary" to="/app/profile/edit"><Pencil size={16} />Edit profile</Link> : <FollowButton key={member.id} member={member} onChanged={refresh} />}</div></div><h2>{member.display_name}</h2><span className="member-username">@{member.username}</span><p className="member-full-bio">{member.bio || 'This member has not shared a bio yet.'}</p><span className="member-joined"><CalendarDays size={15} />{Number.isNaN(date.getTime()) ? 'Joined date unavailable' : `Joined ${date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`}</span><div className="member-profile-counts"><div><strong>{Number(member.follower_count).toLocaleString()}</strong><span>Followers</span></div><div><strong>{Number(member.following_count).toLocaleString()}</strong><span>Following</span></div></div>{own && <Link className="public-profile-link" to={`/members/${member.username}`}>Public profile: /members/{member.username}</Link>}</div></Card>
  </div>
}
