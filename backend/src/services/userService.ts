import { query } from '../utils/db';
import { encrypt, decrypt } from '../utils/encryption';
import { hashPassword, verifyPassword } from '../auth/password';
import { logger } from '../utils/logger';

interface UserRow {
  [key: string]: unknown;
  id: number;
  email: string;
  password_hash: string;
  gitlab_base_url: string | null;
  gitlab_user_id: number | null;
  gitlab_username: string | null;
  encrypted_gitlab_token: string | null;
  encrypted_llm_api_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SafeUser {
  id: number;
  email: string;
  gitlabBaseUrl: string | null;
  gitlabUserId: number | null;
  gitlabUsername: string | null;
  hasGitlabToken: boolean;
}

function toSafeUser(row: UserRow): SafeUser {
  return {
    id: row.id,
    email: row.email,
    gitlabBaseUrl: row.gitlab_base_url,
    gitlabUserId: row.gitlab_user_id,
    gitlabUsername: row.gitlab_username,
    hasGitlabToken: !!row.encrypted_gitlab_token,
  };
}

export async function createUser(email: string, password: string): Promise<SafeUser> {
  const hash = await hashPassword(password);
  const result = await query<UserRow>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *`,
    [email.toLowerCase().trim(), hash]
  );
  return toSafeUser(result.rows[0]);
}

export async function authenticateUser(email: string, password: string): Promise<SafeUser | null> {
  const result = await query<UserRow>(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  if (result.rows.length === 0) return null;

  const user = result.rows[0];
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return null;

  return toSafeUser(user);
}

export async function getUserById(userId: number): Promise<SafeUser | null> {
  const result = await query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) return null;
  return toSafeUser(result.rows[0]);
}

export async function saveTokens(
  userId: number,
  params: {
    gitlabBaseUrl: string;
    gitlabToken: string;
    gitlabUserId: number;
    gitlabUsername: string;
  }
): Promise<SafeUser> {
  const encryptedGitlabToken = encrypt(params.gitlabToken);

  const result = await query<UserRow>(
    `UPDATE users SET
       gitlab_base_url = $1,
       gitlab_user_id = $2,
       gitlab_username = $3,
       encrypted_gitlab_token = $4,
       updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [
      params.gitlabBaseUrl,
      params.gitlabUserId,
      params.gitlabUsername,
      encryptedGitlabToken,
      userId,
    ]
  );

  logger.info('User tokens updated', { userId });
  return toSafeUser(result.rows[0]);
}

export async function getDecryptedGitlabToken(userId: number): Promise<{ token: string; baseUrl: string }> {
  const result = await query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) throw new Error('User not found');

  const user = result.rows[0];
  if (!user.encrypted_gitlab_token || !user.gitlab_base_url) {
    throw new Error('GitLab token not configured. Please configure your tokens in Settings.');
  }

  return {
    token: decrypt(user.encrypted_gitlab_token),
    baseUrl: user.gitlab_base_url,
  };
}

export async function clearTokens(userId: number): Promise<SafeUser> {
  const result = await query<UserRow>(
    `UPDATE users SET
       gitlab_base_url = NULL,
       gitlab_user_id = NULL,
       gitlab_username = NULL,
       encrypted_gitlab_token = NULL,
       encrypted_llm_api_key = NULL,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [userId]
  );
  logger.info('User tokens cleared', { userId });
  return toSafeUser(result.rows[0]);
}
