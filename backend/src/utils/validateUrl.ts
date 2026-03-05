import { AppError } from '../middleware/errorHandler';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
]);

/**
 * Check if an IPv4 address belongs to a private/reserved range.
 */
function isPrivateIp(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 127 ||                          // 127.0.0.0/8 loopback
    a === 10 ||                           // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) ||  // 172.16.0.0/12
    (a === 192 && b === 168) ||           // 192.168.0.0/16
    (a === 169 && b === 254) ||           // 169.254.0.0/16 link-local / cloud metadata
    a === 0                               // 0.0.0.0/8
  );
}

/**
 * Validate that a GitLab base URL does not point to internal/private networks.
 * Throws AppError(400) if the URL is unsafe.
 */
export function validateGitLabUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError(400, 'Invalid GitLab URL format');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AppError(400, 'GitLab URL must use http or https');
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new AppError(400, 'GitLab URL must not point to localhost or loopback addresses');
  }

  // Block IPv4 literals in private ranges
  if (isPrivateIp(hostname)) {
    throw new AppError(400, 'GitLab URL must not point to private or internal network addresses');
  }

  // Block IPv6 loopback (::1) and unspecified (::)
  if (hostname === '[::1]' || hostname === '[::]' || hostname === '::1' || hostname === '::') {
    throw new AppError(400, 'GitLab URL must not point to localhost or loopback addresses');
  }
}
