export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

const isStructured =
  process.env.NODE_ENV === 'production' || process.env.LOG_FORMAT === 'json';

export class Logger {
  private context: string;
  private minLevel: LogLevel;

  constructor(context: string, minLevel: LogLevel = LogLevel.INFO) {
    this.context = context;
    this.minLevel = minLevel;
  }

  private emit(level: LogLevel, message: string, meta?: unknown): void {
    if (this.minLevel > level) return;

    if (isStructured) {
      const entry: Record<string, unknown> = {
        time: new Date().toISOString(),
        level: LEVEL_NAMES[level],
        context: this.context,
        msg: message,
      };
      if (meta !== undefined) {
        if (meta instanceof Error) {
          entry['err'] = {message: meta.message, stack: meta.stack};
        } else {
          entry['meta'] = meta;
        }
      }
      process.stdout.write(JSON.stringify(entry) + '\n');
    } else {
      const timestamp = new Date().toISOString();
      let line = `[${timestamp}] [${LEVEL_NAMES[level]}] [${this.context}] ${message}`;
      if (meta !== undefined) {
        if (meta instanceof Error) {
          line += ` ${meta.message}`;
        } else {
          try {
            line += ` ${JSON.stringify(meta)}`;
          } catch {
            line += ' [unstringifiable meta]';
          }
        }
      }
      if (level >= LogLevel.ERROR) {
        console.error(line);
      } else if (level >= LogLevel.WARN) {
        console.warn(line);
      } else {
        console.info(line);
      }
    }
  }

  debug(message: string, meta?: unknown): void {
    this.emit(LogLevel.DEBUG, message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.emit(LogLevel.INFO, message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.emit(LogLevel.WARN, message, meta);
  }

  error(message: string, error?: unknown): void {
    if (this.minLevel > LogLevel.ERROR) return;

    if (isStructured) {
      const entry: Record<string, unknown> = {
        time: new Date().toISOString(),
        level: 'ERROR',
        context: this.context,
        msg: message,
      };
      if (error instanceof Error) {
        entry['err'] = {message: error.message, stack: error.stack};
      } else if (error !== undefined) {
        entry['meta'] = error;
      }
      process.stderr.write(JSON.stringify(entry) + '\n');
    } else {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] [ERROR] [${this.context}] ${message}`);
      if (error) {
        if (error instanceof Error) {
          console.error(error.stack);
        } else {
          console.error(error);
        }
      }
    }
  }
}
