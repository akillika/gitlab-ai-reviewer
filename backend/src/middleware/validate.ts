import { Request, Response, NextFunction } from 'express';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const MR_URL_REGEX = /^https?:\/\/[^/]+\/(.+)\/-\/merge_requests\/(\d+)\/?$/;

export function validateRegistration(req: Request, res: Response, next: NextFunction): void {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    res.status(400).json({ error: 'Valid email address is required' });
    return;
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  if (password.length > 128) {
    res.status(400).json({ error: 'Password must not exceed 128 characters' });
    return;
  }

  next();
}

export function validateLogin(req: Request, res: Response, next: NextFunction): void {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'Email is required' });
    return;
  }
  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  next();
}

export function validateTokenConfig(req: Request, res: Response, next: NextFunction): void {
  const { gitlabBaseUrl, gitlabToken } = req.body;

  if (!gitlabBaseUrl || typeof gitlabBaseUrl !== 'string' || !URL_REGEX.test(gitlabBaseUrl.trim())) {
    res.status(400).json({ error: 'Valid GitLab base URL is required (e.g. https://gitlab.company.com)' });
    return;
  }
  if (!gitlabToken || typeof gitlabToken !== 'string' || gitlabToken.trim().length < 10) {
    res.status(400).json({ error: 'Valid GitLab Personal Access Token is required' });
    return;
  }

  // Sanitize: strip trailing slash from base URL
  req.body.gitlabBaseUrl = gitlabBaseUrl.trim().replace(/\/+$/, '');
  req.body.gitlabToken = gitlabToken.trim();

  next();
}

export function validateMrUrl(req: Request, res: Response, next: NextFunction): void {
  const { mrUrl } = req.body;

  if (!mrUrl || typeof mrUrl !== 'string') {
    res.status(400).json({ error: 'MR URL is required' });
    return;
  }

  const trimmed = mrUrl.trim();

  // Accept full URL or shorthand format
  if (!MR_URL_REGEX.test(trimmed) && !/^.+!\d+$/.test(trimmed)) {
    res.status(400).json({
      error: 'Invalid MR URL. Expected format: https://gitlab.example.com/group/project/-/merge_requests/123',
    });
    return;
  }

  req.body.mrUrl = trimmed;
  next();
}
