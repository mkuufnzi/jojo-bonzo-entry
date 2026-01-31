"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const env_1 = require("../config/env");
/**
 * Structured Logger using Pino
 *
 * - Pretty prints in development
 * - JSON in production for better aggregation
 * - Redacts sensitive information
 */
exports.logger = (0, pino_1.default)({
    level: env_1.config.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: env_1.config.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
        },
    } : undefined,
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'password',
            'token',
            'stripeSecretKey',
            'apiKey'
        ],
        remove: true,
    },
});
