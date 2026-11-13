import { createBrowserRouter, Link, Navigate, useRouteError } from 'react-router'
import { AppLayout } from '../components/layout/AppLayout'
import { StatusScreen } from '../components/ui/StatusScreen'
import { AuthPage } from '../features/auth/AuthPage'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { HomeFeed } from '../features/feed/HomeFeed'
import { memberScreens, PlaceholderPage } from '../features/workspaces/PlaceholderPage'
import { VerificationPage } from '../features/auth/VerificationPage'
import { ProfileGate } from '../features/profiles/ProfileGate'
import { ProfilePage } from '../features/profiles/ProfilePage'
import { DiscoverPeople } from '../features/people/DiscoverPeople'
import { MemberProfile, MyProfile, PublicMemberLayout } from '../features/people/MemberProfile'

const memberChildren = [
  { index: true, element: <HomeFeed /> },
  ...memberScreens.map(screen => ({ path: screen.path, element: <PlaceholderPage {...screen} /> })),
  { path: 'people', element: <PlaceholderPage title="Discover people" description="Meet fellow believers in your community." planned={['Sign in to browse real members', 'Search members and follow their journeys']} /> },
]

function RouteError() {
  useRouteError()
  return <main className="status-screen"><h1>Something went wrong</h1><p>The application could not open this screen. Refresh the page and try again.</p><Link to="/login" className="btn btn-primary">Return to sign in</Link></main>
}

export const router = createBrowserRouter([{
  errorElement: <RouteError />,
  children: [
    { path: '/', element: <Navigate to="/app" replace /> },
    { path: '/login', element: <AuthPage key="login" /> },
    { path: '/register', element: <AuthPage key="register" register /> },
    { path: '/auth/verify', element: <VerificationPage /> },
    { path: '/auth/callback', element: <VerificationPage callback /> },
    { path: '/members/:username', element: <PublicMemberLayout />, children: [{ index: true, element: <MemberProfile /> }] },
    { path: '/preview', element: <AppLayout preview />, children: memberChildren },
    { element: <ProtectedRoute />, children: [{ element: <ProfileGate />, children: [
      { path: '/app', element: <AppLayout />, children: [
        ...memberChildren.filter(route => !('path' in route) || !['profile', 'people'].includes(route.path)),
        { path: 'profile', element: <MyProfile /> },
        { path: 'profile/edit', element: <ProfilePage /> },
        { path: 'people', element: <DiscoverPeople /> },
        { path: 'onboarding', element: <ProfilePage onboarding /> },
      ] },
      { element: <ProtectedRoute roles={['moderator', 'admin']} />, children: [
        { element: <AppLayout />, children: [{ path: '/moderation', element: <PlaceholderPage title="Moderation" description="Care for the community with wisdom and kindness." planned={['Review reported content', 'Record moderation decisions', 'Apply server-authorized moderation actions']} /> }] },
      ] },
      { element: <ProtectedRoute roles={['admin']} />, children: [
        { element: <AppLayout />, children: [{ path: '/admin', element: <PlaceholderPage title="Administration" description="A trusted workspace for community stewardship." planned={['Manage members through authorized server operations', 'Audit privileged actions', 'Configure community settings']} /> }] },
      ] },
    ] }] },
    { path: '*', element: <StatusScreen title="Page not found" message="This page is not part of your community. Let’s get you back." /> },
  ],
}])
