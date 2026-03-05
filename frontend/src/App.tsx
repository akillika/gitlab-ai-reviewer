/**
 * App — Root application component.
 *
 * Wires together:
 * - React Router with protected routes
 * - Toast notification provider
 * - AppLayout (nav bar) for dashboard/settings pages
 * - ReviewPage uses its own full-screen layout (no nav bar)
 * - Auth state management
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { AppLayout } from './layouts/AppLayout';
import { ToastProvider } from './components/Toast/Toast';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReviewPage } from './pages/ReviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { HealthDashboardPage } from './pages/HealthDashboardPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-secondary dark:bg-surface-dark">
        <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function App() {
  const { user, isAuthenticated, loading, login, updateUser, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-secondary dark:bg-surface-dark">
        <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Login — standalone layout, no nav bar */}
          <Route
            path="/login"
            element={
              isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={login} />
            }
          />

          {/* Dashboard — AppLayout with nav bar */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AppLayout user={user!} onLogout={logout}>
                  <DashboardPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* Settings — AppLayout with nav bar */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <AppLayout user={user!} onLogout={logout}>
                  <SettingsPage onUserUpdate={updateUser} />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* Review Workspace — Full-screen, own layout (no nav bar) */}
          <Route
            path="/review/:reviewId"
            element={
              <ProtectedRoute>
                <ReviewPage />
              </ProtectedRoute>
            }
          />

          {/* Health Dashboard — AppLayout with nav bar */}
          <Route
            path="/health"
            element={
              <ProtectedRoute>
                <AppLayout user={user!} onLogout={logout}>
                  <HealthDashboardPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* Redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
