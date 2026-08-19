import {assertAllowedAgentUrl} from '../src/utils/url_guard';

describe('url_guard', () => {
  it('allows configured domains', () => {
    expect(() =>
      assertAllowedAgentUrl('https://agent.example.com/ping'),
    ).not.toThrow();
  });

  it('rejects disallowed domains', () => {
    expect(() => assertAllowedAgentUrl('https://evil.com/api')).toThrow(
      'Agent URL domain not allowed',
    );
  });

  it('rejects unsupported protocols', () => {
    expect(() => assertAllowedAgentUrl('file:///etc/passwd')).toThrow(
      'Unsupported agent URL protocol',
    );
  });

  it('rejects private/link-local hosts', () => {
    expect(() => assertAllowedAgentUrl('http://127.0.0.1/secret')).toThrow(
      'Private/link-local',
    );
    expect(() => assertAllowedAgentUrl('http://localhost/secret')).toThrow(
      'Private/link-local',
    );
    expect(() => assertAllowedAgentUrl('http://10.0.0.5/secret')).toThrow(
      'Private/link-local',
    );
  });
});
