import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, BookOpen, Bookmark, ChevronRight, Heart, ImagePlus, Leaf, MessageCircle, MoreHorizontal, Send, Sparkles, Users } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { useAppBase } from '../../components/layout/AppLayout'

const posts = [
  { name: 'Grace Williams', initialsColor: 1, category: 'Encouragement', time: '2 hours ago', body: 'A gentle reminder for today: you don’t have to have it all figured out to take the next faithful step. God is already in the places you’re worried about. Keep going. 🌿', verse: '“For we walk by faith, not by sight.”', reference: '2 Corinthians 5:7' },
  { name: 'Daniel Ochieng', initialsColor: 2, category: 'Prayer requests', time: '3 hours ago', body: 'This week, I’m praying for everyone stepping into a new season. May you find courage for the unknown and peace in God’s timing. What are you holding in prayer today?' },
  { name: 'Esther Mwangi', initialsColor: 3, category: 'Testimonies', time: '5 hours ago', body: 'Learning to notice the small blessings: a conversation with a friend, a quiet morning, a new opportunity to begin again. God’s faithfulness is woven into our ordinary days.' },
]
const filters = ['For you', 'Prayer requests', 'Testimonies', 'Encouragement']

export function HomeFeed() {
  const [filter, setFilter] = useState('For you')
  const base = useAppBase()
  const visiblePosts = filter === 'For you' ? posts : posts.filter(post => post.category === filter)

  return <>
    <div className="page-heading"><div><div className="eyebrow">A PLACE TO BELONG</div><h1>Your daily dose of fellowship<span className="heading-dot">.</span></h1><p>Grow in faith. Share your story. Encourage someone.</p></div><span className="community-label"><span />United in Christ</span></div>
    <div className="feed-layout"><div className="feed-column">
      <section className="welcome-card"><div className="welcome-copy"><span className="welcome-label"><Sparkles size={14} />FAITH FOR THE EVERYDAY</span><h2>Let’s walk this<br />journey together.</h2><p>A little faith. A little fellowship.<br />A meaningful difference in your day.</p><Link to={`${base}/devotionals`}>Explore devotionals <ArrowRight size={16} /></Link></div><div className="welcome-art" aria-hidden="true"><div className="sun" /><div className="hill hill-back" /><div className="hill hill-mid" /><div className="hill hill-front" /><div className="art-cross" /><span className="art-star star-one">✧</span><span className="art-star star-two">✦</span></div></section>
      <Card className="composer"><div className="composer-top"><Avatar name="Your profile" /><span>What’s on your heart today?</span><span className="placeholder-pill">Coming soon</span></div><div className="composer-bottom"><div><button disabled title="Photo sharing is not connected"><ImagePlus size={17} />Photo</button><button disabled title="Prayer requests are not connected"><Heart size={17} />Prayer</button><button disabled title="Scripture sharing is not connected"><BookOpen size={17} />Scripture</button></div><Button disabled><Send size={14} />Share</Button></div></Card>
      <div className="feed-section-heading"><h2>Community feed</h2><span>Sample posts</span></div>
      <div className="feed-filters" role="group" aria-label="Filter sample posts">{filters.map(item => <button key={item} aria-pressed={filter === item} onClick={() => setFilter(item)} className={filter === item ? 'selected' : ''}>{item}</button>)}</div>
      <p className="sample-note">Placeholder feed · Illustrative members and posts, not live community activity.</p>
      {visiblePosts.map(post => <Card className="post-card" key={post.name}>
        <div className="post-header"><Avatar name={post.name} color={post.initialsColor} /><div className="post-author"><strong>{post.name}</strong><span>{post.time}<span>·</span><Users size={12} /> Example post</span></div><button className="icon-button" disabled aria-label="Post options coming soon"><MoreHorizontal size={21} /></button></div>
        <span className={`category-tag tag-${post.initialsColor}`}>{post.category}</span><p className="post-body">{post.body}</p>
        {post.verse && <blockquote className="post-verse"><span>“</span><div><p>{post.verse}</p><cite>{post.reference}</cite></div><Leaf size={41} strokeWidth={1} /></blockquote>}
        <div className="post-actions"><button disabled><Heart size={18} />Encourage</button><button disabled><MessageCircle size={18} />Comment</button><button disabled aria-label="Save post, coming soon"><Bookmark size={18} /></button></div>
      </Card>)}
      <p className="feed-end"><span>✦</span> A moment of encouragement can change someone’s day.</p>
    </div>
    <aside className="right-rail" aria-label="Faith and community highlights">
      <Card className="verse-card"><div className="rail-label"><span className="small-icon"><BookOpen size={17} /></span>VERSE TO REFLECT ON</div><span className="verse-quote">“</span><blockquote>Be still, and know<br />that I am God.</blockquote><cite>PSALM 46:10</cite><div className="verse-bottom"><span>A moment in His presence.</span><Leaf size={22} strokeWidth={1.3} /></div></Card>
      <Card className="rail-card"><div className="rail-card-heading"><h2>Find your people</h2><Users size={18} /></div><p>Shared faith. Meaningful connections.</p><Link to={`${base}/categories`} className="topic-row"><span className="topic-icon topic-blue"><BookOpen size={19} /></span><span><strong>Bible study</strong><small>Learn and grow together</small></span><ChevronRight size={16} /></Link><Link to={`${base}/categories`} className="topic-row"><span className="topic-icon topic-peach"><Heart size={19} /></span><span><strong>Prayer & encouragement</strong><small>Carry each other in prayer</small></span><ChevronRight size={16} /></Link><Link to={`${base}/categories`} className="topic-row"><span className="topic-icon topic-green"><Leaf size={19} /></span><span><strong>Everyday faith</strong><small>Faith beyond Sunday</small></span><ChevronRight size={16} /></Link><Link className="rail-link" to={`${base}/categories`}>Explore categories <ArrowRight size={15} /></Link></Card>
      <Card className="devotional-card"><span className="eyebrow">A QUIET MOMENT</span><h2>Make room<br />for His word.</h2><p>Pause the scroll. Refresh your soul.</p><Link to={`${base}/devotionals`}>Open devotionals <ArrowRight size={16} /></Link><BookOpen className="devotional-decoration" size={86} strokeWidth={0.8} /></Card>
      <div className="community-guideline"><ShieldIcon /><p>Let kindness lead.<br /><span>A community rooted in love and respect.</span></p></div>
    </aside></div>
  </>
}

function ShieldIcon() { return <span className="kindness-icon"><Heart size={16} /></span> }
