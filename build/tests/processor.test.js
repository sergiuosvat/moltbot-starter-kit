"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const processor_1 = require("../src/processor");
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
jest.mock('axios');
describe('JobProcessor', () => {
    let processor;
    beforeEach(() => {
        processor = new processor_1.JobProcessor();
        jest.clearAllMocks();
    });
    test('should hash simple string payload', async () => {
        const payload = 'hello world';
        // SHA256 of "hello world" = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
        const expectedHash = crypto
            .createHash('sha256')
            .update(payload)
            .digest('hex');
        const result = await processor.process({ payload: payload });
        expect(result).toBe(expectedHash);
    });
    test('should fetch URL payload and hash content', async () => {
        const url = 'http://example.com/data';
        const content = 'remote data';
        axios_1.default.get.mockResolvedValue({ data: content });
        const expectedHash = crypto
            .createHash('sha256')
            .update(content)
            .digest('hex');
        const result = await processor.process({ payload: url, isUrl: true });
        expect(axios_1.default.get).toHaveBeenCalledWith(url, expect.objectContaining({ timeout: expect.any(Number) }));
        expect(result).toBe(expectedHash);
    });
    test('should throw error for disallowed domain (SSRF check)', async () => {
        const url = 'http://evil.com/metadata';
        await expect(processor.process({ payload: url, isUrl: true })).rejects.toThrow('Domain not allowed');
        expect(axios_1.default.get).not.toHaveBeenCalledWith(url);
    });
});
//# sourceMappingURL=processor.test.js.map