/**
 * SettingsPage — Token configuration with Apple-style form.
 *
 * Features:
 * - GitLab PAT configuration
 * - Current connection status
 * - Remove tokens action
 * - Security information card
 */
import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  configureTokens,
  getTokenStatus,
  removeTokens,
  type SafeUser,
  type TokenStatus,
} from '../services/api';
import { useToast } from '../components/Toast/Toast';

interface SettingsPageProps {
  onUserUpdate: (user: SafeUser) => void;
}

export function SettingsPage({ onUserUpdate }: SettingsPageProps) {
  const { addToast } = useToast();
  const [gitlabUrl, setGitlabUrl] = useState('');
  const [gitlabToken, setGitlabToken] = useState('');
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    getTokenStatus()
      .then((res) => {
        setTokenStatus(res.data);
        if (res.data.gitlabBaseUrl) setGitlabUrl(res.data.gitlabBaseUrl);
      })
      .catch(() => {})
      .finally(() => setStatusLoading(false));
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!gitlabUrl.trim() || !gitlabToken.trim()) return;
    setLoading(true);
    try {
      const res = await configureTokens(gitlabUrl.trim(), gitlabToken.trim());
      onUserUpdate(res.data.user);
      setGitlabToken('');
      addToast('success', 'GitLab credentials saved');
      // Refresh status
      const statusRes = await getTokenStatus();
      setTokenStatus(statusRes.data);
    } catch (err: unknown) {
      addToast(
        'error',
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to save credentials'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await removeTokens();
      onUserUpdate(res.data.user);
      setGitlabUrl('');
      setGitlabToken('');
      setTokenStatus(null);
      addToast('info', 'Credentials removed');
    } catch (err: unknown) {
      addToast(
        'error',
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to remove credentials'
      );
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <div>
        <h1 className="text-title text-txt-primary dark:text-txt-dark-primary">Settings</h1>
        <p className="text-body-sm text-txt-secondary mt-1">
          Configure your GitLab connection to review merge requests.
        </p>
      </div>

      {/* Connection Status */}
      <AnimatePresence>
        {!statusLoading && tokenStatus?.configured && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface dark:bg-surface-dark-secondary rounded-2xl border border-border dark:border-border-dark shadow-card p-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <span className="text-emerald-600 text-lg">{'\u2713'}</span>
                </div>
                <div>
                  <p className="text-body-sm font-medium text-txt-primary dark:text-txt-dark-primary">
                    Connected to GitLab
                  </p>
                  <p className="text-caption text-txt-secondary">
                    {tokenStatus.gitlabUsername && `@${tokenStatus.gitlabUsername} \u00B7 `}
                    {tokenStatus.gitlabBaseUrl}
                  </p>
                </div>
              </div>
              <Badge variant="success" dot>Active</Badge>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Configuration Form */}
      <div className="bg-surface dark:bg-surface-dark-secondary rounded-2xl border border-border dark:border-border-dark shadow-card p-5">
        <h2 className="text-section text-txt-primary dark:text-txt-dark-primary mb-4">
          {tokenStatus?.configured ? 'Update Credentials' : 'Connect GitLab'}
        </h2>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-caption font-medium text-txt-secondary mb-1.5">
              GitLab Base URL
            </label>
            <input
              type="url"
              value={gitlabUrl}
              onChange={(e) => setGitlabUrl(e.target.value)}
              placeholder="https://gitlab.company.com"
              className="w-full px-3.5 py-2.5 text-body-sm bg-surface-secondary dark:bg-surface-dark-tertiary border border-border dark:border-border-dark rounded-xl focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all placeholder:text-txt-tertiary"
            />
          </div>

          <div>
            <label className="block text-caption font-medium text-txt-secondary mb-1.5">
              Personal Access Token
            </label>
            <input
              type="password"
              value={gitlabToken}
              onChange={(e) => setGitlabToken(e.target.value)}
              placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3.5 py-2.5 text-body-sm bg-surface-secondary dark:bg-surface-dark-tertiary border border-border dark:border-border-dark rounded-xl focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all placeholder:text-txt-tertiary font-mono"
            />
            <p className="text-caption text-txt-tertiary mt-1">
              Requires <code className="text-code">api</code> and <code className="text-code">read_repository</code> scopes.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              disabled={!gitlabUrl.trim() || !gitlabToken.trim()}
            >
              {tokenStatus?.configured ? 'Update' : 'Save Credentials'}
            </Button>

            {tokenStatus?.configured && (
              <Button
                type="button"
                variant="danger"
                onClick={handleRemove}
                loading={removing}
              >
                Remove
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* Security Info */}
      <div className="bg-surface dark:bg-surface-dark-secondary rounded-2xl border border-border dark:border-border-dark p-5">
        <h3 className="text-body-sm font-medium text-txt-primary dark:text-txt-dark-primary mb-3">
          Security
        </h3>
        <ul className="space-y-2 text-body-sm text-txt-secondary">
          {[
            'Your GitLab PAT is encrypted with AES-256-GCM before storage.',
            'Tokens are decrypted in-memory only when making API calls.',
            'Encryption keys are derived from server-side secrets.',
            'Reviews are powered by OpenAI (gpt-4.1).',
            'No code is stored permanently \u2014 only embeddings for context retrieval.',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5 flex-shrink-0">{'\u2713'}</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
