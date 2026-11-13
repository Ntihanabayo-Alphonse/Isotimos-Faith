import { Link } from 'react-router'
import { ArrowLeft, Construction } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { useAppBase } from '../../components/layout/AppLayout'

export function PlaceholderPage({ title, description, planned }: { title: string; description: string; planned: string[] }) {
  const base = useAppBase()
  return <div className="placeholder-page"><div className="page-heading"><div><span className="eyebrow">YOUR COMMUNITY</span><h1>{title}</h1><p>{description}</p></div></div><Card className="placeholder-card"><span className="placeholder-icon"><Construction size={30} /></span><span className="placeholder-pill">Placeholder screen</span><h2>A space for {title.toLowerCase()}.</h2><p>This route and its access controls are in place. The features below are planned and are not implemented yet.</p><ul>{planned.map(item => <li key={item}>{item}</li>)}</ul><Link to={base} className="btn btn-primary"><ArrowLeft size={16} />Back to the feed</Link></Card></div>
}

export const memberScreens = [
  { path: 'profile', title: 'My profile', description: 'Your story, your faith, your community.', planned: ['View and edit your member profile', 'Profile photos and personal faith journey', 'Your activity and connections'] },
  { path: 'devotionals', title: 'Devotionals', description: 'A moment to pause, reflect, and grow.', planned: ['Read published devotionals', 'Browse by theme and scripture', 'Track your reading'] },
  { path: 'categories', title: 'Categories', description: 'Find conversations that speak to your journey.', planned: ['Browse community topics', 'Follow categories', 'Discover related posts'] },
  { path: 'saved', title: 'Saved', description: 'Keep encouragement close to your heart.', planned: ['Save posts and devotionals', 'Organize your reading', 'Remove saved items'] },
  { path: 'my-content', title: 'My content', description: 'The stories and encouragement you share.', planned: ['Create and edit posts', 'Manage drafts and published content', 'View content status'] },
  { path: 'messages', title: 'Messages', description: 'Meaningful conversations start here.', planned: ['Private member conversations', 'Message notifications', 'Blocking and reporting tools'] },
  { path: 'settings', title: 'Settings', description: 'Make this space your own.', planned: ['Account and privacy preferences', 'Notification settings', 'Password reset and account management'] },
]
