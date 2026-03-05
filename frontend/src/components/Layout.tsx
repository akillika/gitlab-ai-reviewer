import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { SafeUser } from '../services/api';

interface LayoutProps {
  children: React.ReactNode;
  user: SafeUser | null;
  onLogout: () => void;
}

export function Layout({ children, user, onLogout }: LayoutProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-6">
              <Link to="/" className="text-xl font-bold text-indigo-600">
                AI MR Reviewer
              </Link>
              {user && (
                <>
                  <Link
                    to="/dashboard"
                    className="text-gray-600 hover:text-gray-900 text-sm font-medium"
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/settings"
                    className="text-gray-600 hover:text-gray-900 text-sm font-medium"
                  >
                    Settings
                  </Link>
                </>
              )}
            </div>
            {user && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-sm font-medium text-indigo-600">
                      {user.email.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm text-gray-700 font-medium">
                    {user.email}
                  </span>
                </div>
                {user.hasGitlabToken && user.gitlabUsername && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                    @{user.gitlabUsername}
                  </span>
                )}
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-500 hover:text-gray-700 font-medium"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
