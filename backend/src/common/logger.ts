import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.refreshToken',
      '*.passwordHash',
    ],
    censor: '[redacted]',
  },
  base: { svc: process.env.SERVICE_NAME ?? 'buddy-api' },
});

export function shortErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export type PinoLogger = typeof logger;
