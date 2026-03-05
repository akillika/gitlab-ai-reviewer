/**
 * AppLayout — Top-level app shell with navigation bar.
 *
 * Apple-style minimal navigation:
 * - Brand on left
 * - Nav links center
 * - User actions right (theme toggle, user avatar, logout)
 * - Subtle glass-like header with border
 */
import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import type { SafeUser } from '../services/api';
import { useTheme } from '../hooks/useTheme';

interface AppLayoutProps {
  children: ReactNode;
  user: SafeUser;
  onLogout: () => void;
}

export function AppLayout({ children, user, onLogout }: AppLayoutProps) {
  const navigate = useNavigate();
  const { toggle, isDark } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-surface-secondary dark:bg-surface-dark">
      {/* Navigation bar */}
      <header className="sticky top-0 z-30 bg-surface/80 dark:bg-surface-dark/80 backdrop-blur-surface border-b border-border dark:border-border-dark">
        <div className="max-w-[1600px] mx-auto px-5 h-12 flex items-center gap-6">
          {/* Brand */}
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <span className="text-body font-semibold text-txt-primary dark:text-txt-dark-primary hidden sm:block">
              MR Reviewer
            </span>
          </button>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            <NavItem to="/dashboard">Dashboard</NavItem>
            <NavItem to="/settings">Settings</NavItem>
          </nav>

          <div className="flex-1" />

          {/* Right side actions */}
          <div className="flex items-center gap-3">
            {/* GitLab indicator */}
            {user.gitlabUsername && (
              <span className="text-caption text-txt-tertiary hidden md:block">
                {user.gitlabUsername}
              </span>
            )}

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-txt-secondary hover:bg-surface-secondary dark:hover:bg-surface-dark-secondary transition-colors"
              aria-label="Toggle theme"
            >
              {isDark ? '\u2600' : '\u263E'}
            </button>

            {/* User avatar */}
            <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center">
              <span className="text-caption font-semibold text-accent">
                {user.email[0].toUpperCase()}
              </span>
            </div>

            {/* Logout */}
            <button
              onClick={onLogout}
              className="text-caption text-txt-tertiary hover:text-txt-primary transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors duration-150',
          isActive
            ? 'bg-surface-secondary dark:bg-surface-dark-secondary text-txt-primary dark:text-txt-dark-primary'
            : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-secondary/50'
        )
      }
    >
      {children}
    </NavLink>
  );
}
