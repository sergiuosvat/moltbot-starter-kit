/**
 * Additional url_guard tests for new deny-by-default behaviour
 * when ALLOWED_DOMAINS is empty/unset.
 */
import {
  assertAllowedAgentUrl,
  assertAllowedFetchUrl,
} from '../src/utils/url_guard';
import {CONFIG} from '../src/config';

describe('url_guard — empty ALLOWED_DOMAINS deny-by-default', () => {
  const original = CONFIG.SECURITY.ALLOWED_DOMAINS;

  afterEach(() => {
    CONFIG.SECURITY.ALLOWED_DOMAINS = original;
  });

  it('throws a clear error when ALLOWED_DOMAINS is empty', () => {
    CONFIG.SECURITY.ALLOWED_DOMAINS = [];
    expect(() =>
      assertAllowedAgentUrl('https://agent.example.com/ping'),
    ).toThrow('ALLOWED_DOMAINS is not configured');
  });

  it('throws when ALLOWED_DOMAINS contains only empty strings', () => {
    CONFIG.SECURITY.ALLOWED_DOMAINS = ['', '  '];
    expect(() =>
      assertAllowedAgentUrl('https://agent.example.com/ping'),
    ).toThrow('ALLOWED_DOMAINS is not configured');
  });

  it('assertAllowedFetchUrl also respects empty ALLOWED_DOMAINS', () => {
    CONFIG.SECURITY.ALLOWED_DOMAINS = [];
    expect(() =>
      assertAllowedFetchUrl('https://data.example.com/file'),
    ).toThrow('ALLOWED_DOMAINS is not configured');
  });

  it('allows a URL when its domain is explicitly listed', () => {
    CONFIG.SECURITY.ALLOWED_DOMAINS = ['trusted.io'];
    expect(() =>
      assertAllowedAgentUrl('https://agent.trusted.io/api'),
    ).not.toThrow();
  });

  it('rejects when domain is not in non-empty ALLOWED_DOMAINS', () => {
    CONFIG.SECURITY.ALLOWED_DOMAINS = ['trusted.io'];
    expect(() => assertAllowedAgentUrl('https://untrusted.com/api')).toThrow(
      'Agent URL domain not allowed',
    );
  });

  it('rejects invalid URL regardless of ALLOWED_DOMAINS', () => {
    CONFIG.SECURITY.ALLOWED_DOMAINS = ['example.com'];
    expect(() => assertAllowedAgentUrl('not-a-url')).toThrow(
      'Invalid agent URL',
    );
  });
});
