import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { appConfig } from '../config/app.config';
import { logger } from '../common/logger';

/**
 * Age assurance provider abstraction.
 * Providers are configured via env. Supported kinds:
 *  - 'none' (development only; SELF_DECLARED only)
 *  - external HTTP provider (e.g. a third-party age-assurance service): POST
 *    to AGE_ASSURANCE_ENDPOINT with a bearer key; returns { verified: boolean, riskScore: number, checkRef }
 *
 * Self-declared DOB is never treated as sufficient in production: registered
 * users stay at SELF_DECLARED and are flagged for provider verification when
 * a provider is configured; high-risk signals escalate to human review.
 */
@Injectable()
export class AgeAssuranceService {
  constructor(private prisma: PrismaService) {}

  get configured(): boolean {
    const cfg = appConfig();
    return cfg.ageAssuranceProvider !== 'none' && !!cfg.ageAssuranceApiKey;
  }

  async verifyViaProvider(userId: string): Promise<{ verified: boolean; riskScore: number }> {
    const cfg = appConfig();
    if (!this.configured) {
      logger.warn({ userId }, 'age assurance requested but no provider configured');
      return { verified: false, riskScore: 0.5 };
    }
    try {
      const endpoint = process.env.AGE_ASSURANCE_ENDPOINT;
      if (!endpoint) throw new Error('AGE_ASSURANCE_ENDPOINT not set');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.ageAssuranceApiKey}`,
        },
        body: JSON.stringify({ userId }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`age assurance http ${res.status}`);
      const json = (await res.json()) as { verified: boolean; riskScore?: number; checkRef?: string };
      const riskScore = json.riskScore ?? 0;
      await this.prisma.ageVerification.create({
        data: {
          userId,
          provider: cfg.ageAssuranceProvider,
          assuranceLevel: json.verified ? 'VERIFIED' : 'UNKNOWN',
          riskScore,
          checkRef: json.checkRef,
          metadataJson: '{}',
        },
      });
      await this.prisma.user.update({
        where: { id: userId },
        data: { ageAssurance: json.verified ? 'VERIFIED' : 'UNKNOWN' },
      });
      return { verified: !!json.verified, riskScore };
    } catch (e) {
      logger.warn({ err: String(e), userId }, 'age assurance provider error');
      return { verified: false, riskScore: 0.7 };
    }
  }

  /**
   * Risk-based review trigger: called by matchmaking when signals suggest
   * potential underage activity (e.g., suspicious DOB pattern). Creates a
   * moderation case for human review and applies RESTRICT_MATCHING.
   */
  async flagForReview(userId: string, reason: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    if (user.ageAssurance === 'VERIFIED') return;
    await this.prisma.moderationCase.create({
      data: {
        subjectUserId: userId,
        source: 'QUEUE_PATTERN',
        reason: 'UNDERAGE',
        severity: 'HIGH',
        status: 'OPEN',
        resolutionNote: reason,
      },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { ageAssurance: 'UNDERAGE_SUSPECTED' },
    });
    logger.warn({ userId, reason }, 'user flagged for age review');
  }
}
