import {JobProcessor} from '../src/processor';
import axios from 'axios';
import * as crypto from 'crypto';

jest.mock('axios');

describe('JobProcessor', () => {
  let processor: JobProcessor;

  beforeEach(() => {
    processor = new JobProcessor();
    jest.clearAllMocks();
  });

  test('should hash simple string payload', async () => {
    const payload = 'hello world';
    // SHA256 of "hello world" = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
    const expectedHash = crypto
      .createHash('sha256')
      .update(payload)
      .digest('hex');

    const result = await processor.process({payload: payload});
    expect(result).toBe(expectedHash);
  });

  test('should fetch URL payload and hash content', async () => {
    const url = 'http://example.com/data';
    const content = 'remote data';
    (axios.get as jest.Mock).mockResolvedValue({data: content});

    const expectedHash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');

    const result = await processor.process({payload: url, isUrl: true});

    expect(axios.get).toHaveBeenCalledWith(
      url,
      expect.objectContaining({timeout: expect.any(Number), maxRedirects: 0}),
    );
    expect(result).toBe(expectedHash);
  });

  test('should throw error for disallowed domain (SSRF check)', async () => {
    const url = 'http://evil.com/metadata';

    await expect(
      processor.process({payload: url, isUrl: true}),
    ).rejects.toThrow('Agent URL domain not allowed');

    expect(axios.get).not.toHaveBeenCalled();
  });

  test('should throw when URL fetch fails (no silent hash of raw URL)', async () => {
    const url = 'http://example.com/data';
    (axios.get as jest.Mock).mockRejectedValue(new Error('network down'));

    await expect(
      processor.process({payload: url, isUrl: true}),
    ).rejects.toThrow('network down');
  });
});
