/**
 * Typed ACP client failures — callers should catch AcpError instead of
 * treating null as “maybe empty, maybe failed”.
 */
export type AcpErrorCode =
  | 'NETWORK'
  | 'HTTP'
  | 'INVALID_RESPONSE'
  | 'SSRF'
  | 'UNKNOWN';

export class AcpError extends Error {
  readonly code: AcpErrorCode;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    code: AcpErrorCode,
    options?: {status?: number; cause?: unknown},
  ) {
    super(message);
    this.name = 'AcpError';
    this.code = code;
    this.status = options?.status;
    this.cause = options?.cause;
  }
}

export function isAcpError(error: unknown): error is AcpError {
  return error instanceof AcpError;
}
