/**
 * Tests for the upgraded Logger — structured JSON mode and human-readable mode.
 */
import {Logger, LogLevel} from '../src/utils/logger';

describe('Logger — human-readable mode (default in tests)', () => {
  it('info() writes to console.info', () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new Logger('TestCtx');
    logger.info('hello world');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[INFO] [TestCtx] hello world'),
    );
    spy.mockRestore();
  });

  it('warn() writes to console.warn', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new Logger('TestCtx');
    logger.warn('something off');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[WARN] [TestCtx] something off'),
    );
    spy.mockRestore();
  });

  it('error() writes to console.error with message', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger('TestCtx');
    logger.error('bad thing');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR] [TestCtx] bad thing'),
    );
    spy.mockRestore();
  });

  it('error() logs Error stack when provided', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger('TestCtx');
    const err = new Error('boom');
    logger.error('failed', err);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Error: boom'));
    spy.mockRestore();
  });

  it('error() logs non-Error meta', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new Logger('TestCtx');
    logger.error('failed', {code: 42});
    expect(spy).toHaveBeenCalledWith({code: 42});
    spy.mockRestore();
  });

  it('debug() is suppressed at INFO minLevel', () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new Logger('TestCtx', LogLevel.INFO);
    logger.debug('hidden');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('debug() is emitted when minLevel is DEBUG', () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new Logger('TestCtx', LogLevel.DEBUG);
    logger.debug('visible');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG] [TestCtx] visible'),
    );
    spy.mockRestore();
  });

  it('includes serialised meta in log line', () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new Logger('TestCtx');
    logger.info('with meta', {key: 'val'});
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"key":"val"'));
    spy.mockRestore();
  });

  it('includes Error message when meta is an Error', () => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const logger = new Logger('TestCtx');
    logger.info('err as meta', new Error('inner'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('inner'));
    spy.mockRestore();
  });
});

describe('Logger — structured JSON mode (LOG_FORMAT=json)', () => {
  const originalLogFormat = process.env.LOG_FORMAT;

  beforeAll(() => {
    process.env.LOG_FORMAT = 'json';
    jest.resetModules();
  });

  afterAll(() => {
    process.env.LOG_FORMAT = originalLogFormat;
    jest.resetModules();
  });

  it('emits valid JSON to stdout for info', () => {
    // Re-import after env change so isStructured picks up LOG_FORMAT=json
    const {Logger: L} =
      require('../src/utils/logger') as typeof import('../src/utils/logger');
    const writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    const logger = new L('JsonCtx');
    logger.info('structured msg');

    const raw = writeSpy.mock.calls.find(c =>
      String(c[0]).includes('structured msg'),
    );
    expect(raw).toBeDefined();
    const parsed = JSON.parse(String(raw![0]));
    expect(parsed).toMatchObject({
      level: 'INFO',
      context: 'JsonCtx',
      msg: 'structured msg',
    });
    expect(typeof parsed.time).toBe('string');

    writeSpy.mockRestore();
  });

  it('emits valid JSON to stderr for error with Error object', () => {
    const {Logger: L} =
      require('../src/utils/logger') as typeof import('../src/utils/logger');
    const writeSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    const logger = new L('JsonCtx');
    logger.error('something failed', new Error('root cause'));

    const raw = writeSpy.mock.calls.find(c =>
      String(c[0]).includes('something failed'),
    );
    expect(raw).toBeDefined();
    const parsed = JSON.parse(String(raw![0]));
    expect(parsed).toMatchObject({level: 'ERROR', msg: 'something failed'});
    expect(parsed.err).toMatchObject({message: 'root cause'});

    writeSpy.mockRestore();
  });

  it('includes meta field for non-Error info meta', () => {
    const {Logger: L} =
      require('../src/utils/logger') as typeof import('../src/utils/logger');
    const writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    const logger = new L('JsonCtx');
    logger.info('with meta', {foo: 'bar'});

    const raw = writeSpy.mock.calls.find(c =>
      String(c[0]).includes('with meta'),
    );
    expect(raw).toBeDefined();
    const parsed = JSON.parse(String(raw![0]));
    expect(parsed.meta).toEqual({foo: 'bar'});

    writeSpy.mockRestore();
  });
});
