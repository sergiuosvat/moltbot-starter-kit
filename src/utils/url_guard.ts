import {lookup} from 'dns/promises';

import {CONFIG} from '../config';

const PRIVATE_IPV4 =
  /^(127\.|10\.|192\.168\.|169\.254\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[01])\.)/;

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  if (PRIVATE_IPV4.test(host)) return true;
  // IPv6 unique-local / link-local
  if (
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80')
  ) {
    return true;
  }
  return false;
}

export function assertAllowedAgentUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid agent URL: ${url}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported agent URL protocol: ${parsed.protocol}`);
  }

  if (isPrivateHostname(parsed.hostname)) {
    throw new Error(
      `Private/link-local agent URL host not allowed: ${parsed.hostname}`,
    );
  }

  const allowedDomains = CONFIG.SECURITY.ALLOWED_DOMAINS.filter(
    d => d && d.trim(),
  );

  if (allowedDomains.length === 0) {
    throw new Error(
      'Agent URL rejected: ALLOWED_DOMAINS is not configured. Set ALLOWED_DOMAINS in .env to allow outbound fetch targets.',
    );
  }

  const isAllowed = allowedDomains.some(
    domain =>
      parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
  );

  if (!isAllowed) {
    throw new Error(`Agent URL domain not allowed: ${parsed.hostname}`);
  }
}

/** Alias used by job processor and other outbound fetches. */
export function assertAllowedFetchUrl(url: string): void {
  assertAllowedAgentUrl(url);
}

/**
 * Resolves hostname and rejects if any address is private.
 * Call after assertAllowedAgentUrl for stronger SSRF protection.
 */
export async function assertResolvedPublicHost(url: string): Promise<void> {
  const parsed = new URL(url);
  try {
    const records = await lookup(parsed.hostname, {all: true});
    for (const record of records) {
      if (isPrivateHostname(record.address)) {
        throw new Error(
          `Resolved address is private (${record.address}) for ${parsed.hostname}`,
        );
      }
    }
  } catch (error) {
    if ((error as Error).message.includes('private')) throw error;
    // DNS failure — let the subsequent fetch surface the error
  }
}
