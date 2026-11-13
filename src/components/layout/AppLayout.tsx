import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { ArrowRight, Bell, Cross, LogOut, Menu, Search, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../ui/Avatar'
import { navigation } from './navigation'
import { useProfile } from '../../features/profiles/ProfileProvider'

export function useAppBase() {
  return useLocation().pathname.startsWith('/preview') ? '/preview' : '/app'
}

export function AppLayout({ preview = false }: { preview?: boolean }) {
  const { session, role } = useAuth()
  const { profile } = useProfile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const base = preview ? '/preview' : '/app'
  const name = preview ? 'Preview member' : profile?.display_name || String(session?.user.user_metadata.display_name || 'Community member')
  async function signOut() {
    if (!supabase) return
    setSigningOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) setError('Sign-out failed. Please try again.')
    } catch { setError('Unable to sign out. Check your connection and try again.') }
    finally { setSigningOut(false) }
  }

  return <div className="application">
    <a className="skip-link" href="#main-content">Skip to content</a>
    {preview && <div className="preview-banner"><span><strong>Application preview</strong><span className="preview-detail"> · Read-only example content. You are not signed in.</span></span><Link to="/login">Go to sign in <ArrowRight size={14} /></Link></div>}
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to={base} aria-label="Isotimos Faith home"><span className="brand-mark"><Cross size={24} /><i /></span><span>isotimos<span className="brand-faith">faith</span></span></Link>
        <div className="search-box"><Search size={19} /><input aria-label="Search community, coming soon" placeholder="Search your community" disabled /><span>Coming soon</span></div>
        <div className="header-actions"><button className="icon-button notification-button" disabled aria-label="Notifications coming soon" title="Notifications are not connected yet"><Bell size={21} /></button><span className="header-divider" /><Link className="header-profile" to={`${base}/profile`}><Avatar name={name} src={preview ? null : profile?.avatar_url} small /><span>{preview ? 'Preview' : 'My account'}</span></Link><button className="icon-button mobile-menu-button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="member-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button></div>
      </div>
    </header>
    <div className="app-grid">
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside id="member-navigation" className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div className="sidebar-user"><Avatar name={name} src={preview ? null : profile?.avatar_url} /><div><strong>{name}</strong><span>{preview ? 'Read-only preview' : profile?.username ? `@${profile.username}` : 'Walking in faith'}</span></div></div>
        <span className="nav-caption">YOUR COMMUNITY</span>
        <nav aria-label="Member navigation">{navigation.map(({ label, path, icon: Icon }) => <NavLink key={path} to={`${base}${path}`} end onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={20} strokeWidth={1.8} /><span>{label}</span></NavLink>)}</nav>
        {!preview && (role === 'admin' || role === 'moderator') && <Link className="nav-item" to="/moderation"><ShieldCheck size={20} />Moderation</Link>}
        {!preview && role === 'admin' && <Link className="nav-item" to="/admin"><ShieldCheck size={20} />Administration</Link>}
        <div className="sidebar-bottom"><div className="fellowship-note"><span className="little-cross">✦</span><p>Different stories.<br /><strong>One family in Christ.</strong></p></div>{preview ? <Link className="nav-item" to="/login"><LogOut size={19} />Leave preview</Link> : <button className="nav-item signout" disabled={signingOut} onClick={signOut}><LogOut size={19} />{signingOut ? 'Signing out…' : 'Sign out'}</button>}{error && <p role="alert" className="form-error">{error}</p>}<span className="sidebar-copyright">© {new Date().getFullYear()} Isotimos Faith</span></div>
      </aside>
      <main id="main-content" className="main-content" tabIndex={-1}><Outlet /></main>
    </div>
    <nav className="mobile-bottom-nav" aria-label="Quick navigation">{navigation.filter(item => ['', '/people', '/messages', '/profile'].includes(item.path)).map(({ path, label, icon: Icon }) => <NavLink to={`${base}${path}`} key={path} end className={({ isActive }) => isActive ? 'active' : ''}><Icon size={21} /><span>{label === 'Home feed' ? 'Home' : label === 'My profile' ? 'Profile' : label === 'Discover people' ? 'Discover' : label}</span></NavLink>)}</nav>
  </div>
}
