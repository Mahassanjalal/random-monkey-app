import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { KarmaDto } from '@bundle/shared';

@Injectable()
export class RatingsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Rate a match peer. Only participants may rate, self-rating is refused, and
   * re-rating updates the existing row (idempotent per match+rater).
   */
  async rateMatch(raterId: string, matchId: string, score: number): Promise<{ ok: true }> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { participants: true },
    });
    if (!match) throw new NotFoundException('Match not found');

    const rater = match.participants.find((p) => p.userId === raterId);
    if (!rater) throw new ForbiddenException('Not a participant');
    const ratee = match.participants.find((p) => p.userId !== raterId);
    if (!ratee) throw new ForbiddenException('No peer to rate');

    await this.prisma.matchRating.upsert({
      where: { matchId_raterId: { matchId, raterId } },
      create: { matchId, raterId, rateeId: ratee.userId, score },
      update: { score },
    });
    return { ok: true };
  }

  /** The caller's existing rating for a match (for showing state in the UI). */
  async myRating(raterId: string, matchId: string): Promise<{ score: number | null }> {
    const row = await this.prisma.matchRating.findUnique({
      where: { matchId_raterId: { matchId, raterId } },
    });
    return { score: row?.score ?? null };
  }

  /** Aggregated karma for a user: average score plus a positive/neutral/negative split. */
  async karmaFor(rateeId: string): Promise<KarmaDto> {
    const rows = await this.prisma.matchRating.findMany({
      where: { rateeId },
      select: { score: true },
    });
    if (rows.length === 0) {
      return { score: null, ratings: 0, positive: 0, neutral: 0, negative: 0 };
    }
    let sum = 0;
    let positive = 0;
    let neutral = 0;
    let negative = 0;
    for (const r of rows) {
      sum += r.score;
      if (r.score >= 4) positive++;
      else if (r.score === 3) neutral++;
      else negative++;
    }
    return {
      score: Math.round((sum / rows.length) * 10) / 10,
      ratings: rows.length,
      positive,
      neutral,
      negative,
    };
  }
}
