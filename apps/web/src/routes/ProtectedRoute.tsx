import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/auth-context';

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}
