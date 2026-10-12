import { z } from 'zod';

export const queueJoinSchema = z.object({ mode: z.enum(['VIDEO', 'TEXT']) });
export const matchResumeSchema = z.object({ matchId: z.string().min(8).max(64) });
export const rtcOfferSchema = z.object({ matchId: z.string().min(8).max(64), sdp: z.string().min(10).max(20000) });
export const rtcAnswerSchema = rtcOfferSchema;
export const rtcIceSchema = z.object({
  matchId: z.string().min(8).max(64),
  candidate: z.string().min(4).max(2000),
  sdpMid: z.string().max(8).optional(),
  sdpMLineIndex: z.number().int().min(0).max(20).optional(),
});
export const rtcStateSchema = z.object({
  matchId: z.string().min(8).max(64),
  state: z.enum(['checking', 'connected', 'disconnected', 'failed', 'closed']),
  quality: z.enum(['UNKNOWN', 'GOOD', 'DEGRADED', 'POOR']).optional(),
});
export const chatSendSchema = z.object({
  matchId: z.string().min(8).max(64),
  text: z.string().min(1).max(1000),
  kind: z.enum(['text', 'emoji', 'reaction']).optional().default('text'),
});

export function parse<T>(schema: z.ZodSchema<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const msg = r.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`validation: ${msg}`);
  }
  return r.data;
}
