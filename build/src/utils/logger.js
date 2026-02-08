"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    context;
    minLevel;
    constructor(context, minLevel = LogLevel.INFO) {
        this.context = context;
        this.minLevel = minLevel;
    }
    formatMessage(level, message, meta) {
        const timestamp = new Date().toISOString();
        let log = `[${timestamp}] [${level}] [${this.context}] ${message}`;
        if (meta) {
            log += ` ${JSON.stringify(meta)}`;
        }
        return log;
    }
    debug(message, meta) {
        if (this.minLevel <= LogLevel.DEBUG) {
            console.log(this.formatMessage('DEBUG', message, meta));
        }
    }
    info(message, meta) {
        if (this.minLevel <= LogLevel.INFO) {
            console.info(this.formatMessage('INFO', message, meta));
        }
    }
    warn(message, meta) {
        if (this.minLevel <= LogLevel.WARN) {
            console.warn(this.formatMessage('WARN', message, meta));
        }
    }
    error(message, error) {
        if (this.minLevel <= LogLevel.ERROR) {
            console.error(this.formatMessage('ERROR', message));
            if (error) {
                if (error instanceof Error) {
                    console.error(error.stack);
                }
                else {
                    console.error(error);
                }
            }
        }
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map