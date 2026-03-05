/**
 * LoginPage — Apple-style clean login/register form.
 *
 * Centered card layout with:
 * - Brand identity
 * - Toggle between Sign In / Register
 * - Inline validation
 * - Subtle animations
 * - Security note
 */
import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { Button } from '../components/ui/Button';
import { registerUser, loginUser, type SafeUser } from '../services/api';

interface LoginPageProps {
  onLogin: (token: string, user: SafeUser) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = mode === 'register'
        ? await registerUser(email.trim(), password)
        : await loginUser(email.trim(), password);
      onLogin(res.data.token, res.data.user);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        `Failed to ${mode === 'login' ? 'sign in' : 'create account'}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-secondary dark:bg-surface-dark px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent mx-auto mb-4 flex items-center justify-center shadow-card">
            <span className="text-white text-xl font-bold">AI</span>
          </div>
          <h1 className="text-title text-txt-primary dark:text-txt-dark-primary">
            MR Reviewer
          </h1>
          <p className="text-body-sm text-txt-secondary mt-1">
            AI-powered code review for GitLab
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface dark:bg-surface-dark-secondary rounded-2xl border border-border dark:border-border-dark shadow-card p-6">
          {/* Mode toggle */}
          <div className="flex bg-surface-secondary dark:bg-surface-dark-tertiary rounded-xl p-0.5 mb-6">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={clsx(
                'flex-1 py-2 text-body-sm font-medium rounded-lg transition-all duration-200',
                mode === 'login'
                  ? 'bg-surface dark:bg-surface-dark shadow-card text-txt-primary dark:text-txt-dark-primary'
                  : 'text-txt-secondary hover:text-txt-primary'
              )}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); }}
              className={clsx(
                'flex-1 py-2 text-body-sm font-medium rounded-lg transition-all duration-200',
                mode === 'register'
                  ? 'bg-surface dark:bg-surface-dark shadow-card text-txt-primary dark:text-txt-dark-primary'
                  : 'text-txt-secondary hover:text-txt-primary'
              )}
            >
              Create Account
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-caption font-medium text-txt-secondary mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-3.5 py-2.5 text-body-sm bg-surface-secondary dark:bg-surface-dark-tertiary border border-border dark:border-border-dark rounded-xl focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all placeholder:text-txt-tertiary"
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-caption font-medium text-txt-secondary mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={'\u2022'.repeat(12)}
                className="w-full px-3.5 py-2.5 text-body-sm bg-surface-secondary dark:bg-surface-dark-tertiary border border-border dark:border-border-dark rounded-xl focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all placeholder:text-txt-tertiary"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            <AnimatePresence>
              {mode === 'register' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <label className="block text-caption font-medium text-txt-secondary mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={'\u2022'.repeat(12)}
                    className="w-full px-3.5 py-2.5 text-body-sm bg-surface-secondary dark:bg-surface-dark-tertiary border border-border dark:border-border-dark rounded-xl focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all placeholder:text-txt-tertiary"
                    autoComplete="new-password"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-body-sm text-severity-major bg-severity-major-bg px-3 py-2 rounded-lg"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full"
            >
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>
        </div>

        {/* Footer note */}
        <p className="text-center text-caption text-txt-tertiary mt-5 leading-relaxed">
          Powered by OpenAI &middot; Your GitLab PAT is encrypted<br />
          with AES-256-GCM and never stored in plain text.
        </p>
      </motion.div>
    </div>
  );
}
