import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './AuthProvider'
import type { AppRole } from './AuthProvider'
import { StatusScreen } from '../../components/ui/StatusScreen'

export function ProtectedRoute({ roles }: { roles?: AppRole[] }) {
  const { session, loading, role, roleLoading, roleError } = useAuth()
  const location = useLocation()
  if (loading) return <StatusScreen title="Opening your community" message="Checking your session…" loading />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!session.user.email_confirmed_at) return <Navigate to="/auth/verify" replace />
  if (roles && roleLoading) return <StatusScreen title="Checking access" message="Verifying your role with Supabase…" loading />
  if (roles && (roleError || !role || !roles.includes(role))) {
    return <StatusScreen title="Access restricted" message={roleError ? 'Your permissions could not be verified. Check the server role setup or try signing in again.' : 'Your account does not have permission to open this workspace.'} />
  }
  return <Outlet />
}
