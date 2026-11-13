import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Search, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Avatar } from '../../components/ui/Avatar'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FollowButton } from './FollowButton'
import { discoverPeople, PAGE_SIZE, peopleErrorMessage } from './peopleService'
import type { Member, PeopleFilter } from './peopleService'

const filters: { value: PeopleFilter; label: string }[] = [
  { value: 'suggested', label: 'Suggested' }, { value: 'popular', label: 'Popular' },
  { value: 'new', label: 'New Members' }, { value: 'following', label: 'Following' },
]

export function DiscoverPeople() {
  const { session } = useAuth()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PeopleFilter>('suggested')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [moreLoading, setMoreLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  const token = session?.access_token
  const renderedGeneration = generation.current
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 300); return () => clearTimeout(timer) }, [query])
  useEffect(() => {
    const request = ++generation.current
    setLoading(true); setMoreLoading(false); setError(''); setMembers([])
    void discoverPeople(search, filter).then(rows => {
      if (generation.current === request) { setMembers(rows); setHasMore(rows.length === PAGE_SIZE); setLoading(false) }
    }, error => { if (generation.current === request) { setError(peopleErrorMessage(error)); setLoading(false) } })
    return () => { generation.current++ }
  }, [search, filter, token, attempt])

  async function loadMore() {
    const request = renderedGeneration
    setMoreLoading(true); setError('')
    try {
      const rows = await discoverPeople(search, filter, members.length)
      if (generation.current === request) {
        setMembers(previous => [...previous, ...rows.filter(row => !previous.some(member => member.id === row.id))])
        setHasMore(rows.length === PAGE_SIZE)
      }
    } catch (error) { if (generation.current === request) setError(peopleErrorMessage(error)) }
    finally { if (generation.current === request) setMoreLoading(false) }
  }

  async function refreshConnections() {
    const request = renderedGeneration
    if (generation.current !== request) return
    // Refresh all currently displayed pages so Following/Suggested and counts agree.
    const pages = await Promise.all(Array.from({ length: Math.max(1, Math.ceil(members.length / PAGE_SIZE)) }, (_, index) => discoverPeople(search, filter, index * PAGE_SIZE)))
    if (generation.current === request) {
      const rows = pages.flat()
      setMembers(rows.filter((row, index) => rows.findIndex(item => item.id === row.id) === index))
      setHasMore(pages.at(-1)?.length === PAGE_SIZE)
    }
  }

  return <div className="discover-page"><div className="page-heading"><div><span className="eyebrow">FIND YOUR FELLOWSHIP</span><h1>Discover people<span className="heading-dot">.</span></h1><p>Meet fellow believers. Build meaningful connections.</p></div><span className="directory-emblem"><Users size={24} /></span></div>
    <section className="discover-intro"><div><span className="eyebrow">MANY STORIES. ONE FAITH.</span><h2>Your community is waiting.</h2><p>Find a familiar voice, a new perspective, or someone to walk alongside.</p></div><Users size={76} strokeWidth={.8} aria-hidden="true" /></section>
    <label className="people-search"><Search size={20} /><span className="sr-only">Search members</span><input type="search" value={query} maxLength={80} placeholder="Search by name or @username" onChange={event => setQuery(event.target.value.replace(/^@/, ''))} /></label>
    <div className="people-filters" role="group" aria-label="Discover people filters">{filters.map(item => <button key={item.value} aria-pressed={filter === item.value} className={filter === item.value ? 'selected' : ''} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div>
    <div className="directory-result-heading"><h2>{filters.find(item => item.value === filter)?.label}</h2><span>{loading ? 'Loading community…' : `${members.length}${hasMore ? '+' : ''} members`}</span></div>
    {loading && <p className="directory-status" role="status">Finding your community…</p>}
    {error && <div className="directory-status"><p className="form-error" role="alert">{error}</p><Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>}
    {!loading && !error && !members.length && <Card className="people-empty"><Users size={35} /><h2>{search ? 'No members found' : filter === 'following' ? 'Your fellowship starts here.' : 'No recommendations just yet.'}</h2><p>{search ? 'Try another display name or username.' : filter === 'following' ? 'Follow someone from Suggested to see them here.' : 'Check New Members or return as the community grows.'}</p>{filter === 'following' && <Button variant="secondary" onClick={() => setFilter('suggested')}>Find people to follow</Button>}</Card>}
    {!loading && <div className="people-grid">{members.map(member => <Card className="member-card" key={member.id}>
      <div className="member-card-cover" style={member.cover_url ? { backgroundImage: `url("${member.cover_url.replace(/["\\\n\r]/g, '')}")` } : undefined} />
      <div className="member-card-body"><Avatar name={member.display_name} src={member.avatar_url} /><Link to={`/members/${member.username}`} className="member-name"><h3>{member.display_name}</h3><span>@{member.username}</span></Link><p className="member-card-bio">{member.bio || 'A fellow believer on the journey.'}</p><div className="member-card-counts"><strong>{Number(member.follower_count).toLocaleString()} <span>followers</span></strong><strong>{Number(member.following_count).toLocaleString()} <span>following</span></strong></div><FollowButton member={member} onChanged={refreshConnections} /><Link className="view-member-link" to={`/members/${member.username}`}>View profile <ArrowRight size={14} /></Link></div>
    </Card>)}</div>}
    {!loading && hasMore && <div className="load-more"><Button variant="secondary" disabled={moreLoading} onClick={loadMore}>{moreLoading ? 'Loading…' : 'Load more members'}</Button></div>}
  </div>
}
