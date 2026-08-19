/**
 * Tests for assertValidDid() added in identity_encoding.ts
 */
import {assertValidDid} from '../src/utils/identity_encoding';

describe('assertValidDid()', () => {
  it('accepts a valid did:key DID', () => {
    expect(() =>
      assertValidDid(
        'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      ),
    ).not.toThrow();
  });

  it('accepts a valid did:ethr DID', () => {
    expect(() =>
      assertValidDid('did:ethr:0xabcdef1234567890abcdef1234567890abcdef12'),
    ).not.toThrow();
  });

  it('accepts a valid did:web DID', () => {
    expect(() => assertValidDid('did:web:example.com')).not.toThrow();
  });

  it('accepts a DID with colons in the identifier segment', () => {
    expect(() =>
      assertValidDid('did:example:namespace:specific-id'),
    ).not.toThrow();
  });

  it('rejects a plain string', () => {
    expect(() => assertValidDid('not-a-did')).toThrow('Invalid DID format');
  });

  it('rejects did with no identifier', () => {
    expect(() => assertValidDid('did:key:')).toThrow('Invalid DID format');
  });

  it('rejects did with uppercase method', () => {
    // DID spec requires lowercase method names
    expect(() => assertValidDid('did:KEY:z6Mk')).toThrow('Invalid DID format');
  });

  it('rejects empty string', () => {
    expect(() => assertValidDid('')).toThrow('Invalid DID format');
  });

  it('rejects did with missing method', () => {
    expect(() => assertValidDid('did::identifier')).toThrow(
      'Invalid DID format',
    );
  });
});
