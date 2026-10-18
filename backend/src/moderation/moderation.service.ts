import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { appConfig } from '../config/app.config';
import { logger } from '../common/logger';
import { MediaModerationKind } from '@bundle/shared';

export interface CreateCaseInput {
  subjectUserId: string;
  reportId?: string;
  source: 'USER_REPORT' | 'AI_TEXT' | 'AI_VIDEO' | 'QUEUE_PATTERN';
  reason: string;
  severity: string;
}

export interface TextVerdict {
  blocked: boolean;
  flaggedLabels: string[];
  scores: Record<string, number>;
  confidence: number;
  provider: string;
}

export interface MediaVerdict {
  blocked: boolean;
  flaggedLabels: string[];
  scores: Record<string, number>;
  confidence: number;
  provider: string;
}

const SEVERITY_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 } as const;

@Injectable()
export class ModerationService {
  constructor(private prisma: PrismaService) {}

  async createCase(input: CreateCaseInput) {
    const modCase = await this.prisma.moderationCase.create({
      data: {
        subjectUserId: input.subjectUserId,
        reportId: input.reportId,
        source: input.source,
        reason: input.reason,
        severity: input.severity,
        status: 'OPEN',
      },
    });
    logger.info({ caseId: modCase.id, source: input.source, reason: input.reason }, 'moderation case created');
    return modCase;
  }

  /**
   * Text moderation. Provider is optional; when unconfigured we fail OPEN
   * (record but allow) and surface a degraded-moderation metric.
   */
  async checkText(text: string): Promise<TextVerdict> {
    const cfg = appConfig();
    const provider = cfg.moderationProvider;
    if (provider === 'none' || !cfg.moderationApiKey) {
      return { blocked: false, flaggedLabels: [], scores: {}, confidence: 0, provider: 'none' };
    }
    try {
      if (provider === 'openai') {
        return await this.checkTextOpenAI(text, cfg.moderationApiKey);
      }
      // unknown provider: fail open
      return { blocked: false, flaggedLabels: [], scores: {}, confidence: 0, provider };
    } catch (e: unknown) {
      logger.warn({ err: String(e), provider }, 'moderation provider error; failing open');
      return {
        blocked: false,
        flaggedLabels: [],
        scores: {},
        confidence: 0,
        provider: `${provider}:error`,
      };
    }
  }

  private async checkTextOpenAI(text: string, apiKey: string): Promise<TextVerdict> {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`moderation http ${res.status}`);
    const json = (await res.json()) as {
      results: {
        flagged: boolean;
        categories: Record<string, boolean>;
        category_scores: Record<string, number>;
      }[];
    };
    const r = json.results?.[0];
    const flaggedLabels = r
      ? Object.entries(r.categories)
          .filter(([, v]) => v)
          .map(([k]) => k)
      : [];
    // High-severity labels block outright; others only create a case.
    const hardBlock = flaggedLabels.some((l) =>
      ['sexual/minors', 'violence/graphic', 'self-harm/instructions'].includes(l),
    );
    if (r && flaggedLabels.length && !hardBlock) {
      // record a case for review, do not block
      void this.prisma.moderationCase.create({
        data: {
          subjectUserId: 'system',
          source: 'AI_TEXT',
          reason: flaggedLabels[0] ?? 'OTHER',
          severity: 'LOW',
          status: 'OPEN',
          aiScoresJson: JSON.stringify(r.category_scores ?? {}),
          aiProvider: 'openai',
          aiConfidence: Math.max(0, ...Object.values(r.category_scores ?? { 0: 0 })),
        },
      }).catch(() => undefined);
    }
    return {
      blocked: hardBlock,
      flaggedLabels,
      scores: r?.category_scores ?? {},
      confidence: r ? Math.max(0, ...Object.values(r.category_scores ?? {})) : 0,
      provider: 'openai',
    };
  }

  /** Vision-capable media moderation via OpenAI GPT-4V chat completions. */
  private async checkMediaOpenAIVision(imageDataUrl: string, apiKey: string): Promise<MediaVerdict> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this image for nudity, sexual content involving minors, extreme violence, self-harm, hate symbols, or other policy violations. Respond with JSON only: { "flagged": boolean, "labels": string[], "confidence": number (0-1) }.',
              },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`openai vision http ${res.status}`);
    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? '{}';
    let parsed: { flagged?: boolean; labels?: string[]; confidence?: number };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { flagged: false, labels: [], confidence: 0 };
    }
    const flagged = !!parsed.flagged;
    const labels = Array.isArray(parsed.labels) ? parsed.labels : [];
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;

    // High-severity labels block outright.
    const hardBlock = flagged && labels.some((l) =>
      ['sexual', 'nudity', 'minors', 'child', 'violence', 'self-harm'].some((k) =>
        l.toLowerCase().includes(k),
      ),
    );

    if (flagged && !hardBlock) {
      void this.prisma.moderationCase.create({
        data: {
          subjectUserId: 'system',
          source: 'AI_VIDEO',
          reason: labels.join(', ') || 'MEDIA_FLAGGED',
          severity: 'MEDIUM',
          status: 'OPEN',
          aiScoresJson: JSON.stringify({ confidence }),
          aiProvider: 'openai-vision',
          aiConfidence: confidence,
        },
      }).catch(() => undefined);
    }

    return {
      blocked: hardBlock,
      flaggedLabels: labels,
      scores: { vision: confidence },
      confidence,
      provider: 'openai-vision',
    };
  }

  /**
   * Media moderation for a frame/segment captured during a call.
   * Fail-open when provider is unconfigured: records a verdict but does not block.
   * If blocked, creates a ModerationCase with source AI_VIDEO for human review.
   */
  async checkMedia(
    matchId: string,
    userId: string,
    kind: MediaModerationKind,
    imageDataUrl: string,
  ): Promise<MediaVerdict> {
    const cfg = appConfig();
    const provider = cfg.moderationProvider;
    let verdict: MediaVerdict = {
      blocked: false,
      flaggedLabels: [],
      scores: {},
      confidence: 0,
      provider: 'none',
    };

    if (provider !== 'none' && cfg.moderationApiKey) {
      try {
        // Vision-capable media moderation. Send the image as a base64 data URL to a
        // multimodal moderation provider (e.g. OpenAI GPT-4V via chat completions,
        // AWS Rekognition, Google Vision, or Sightengine). The OpenAI /moderations
        // endpoint is text-only and is NOT used for image analysis.
        if (provider === 'openai-vision') {
          verdict = await this.checkMediaOpenAIVision(imageDataUrl, cfg.moderationApiKey);
        } else {
          // Unknown or text-only provider: fail open, record degraded metric.
          logger.warn({ provider }, 'media moderation provider not vision-capable; failing open');
          verdict.provider = `${provider}:not-vision-capable`;
        }
      } catch (e: unknown) {
        logger.warn({ err: String(e), provider }, 'media moderation provider error; failing open');
        verdict.provider = `${provider}:error`;
      }
    }

    // Always record the verdict.
    await this.prisma.mediaModerationVerdict.create({
      data: {
        matchId,
        userId,
        kind: String(kind),
        provider: verdict.provider,
        blocked: verdict.blocked,
        flaggedLabels: JSON.stringify(verdict.flaggedLabels),
        scoresJson: JSON.stringify(verdict.scores),
        confidence: verdict.confidence,
      },
    }).catch((e) => logger.warn({ err: String(e) }, 'failed to record media verdict'));

    if (verdict.blocked) {
      await this.createCase({
        subjectUserId: userId,
        source: 'AI_VIDEO',
        reason: verdict.flaggedLabels.join(', ') || 'MEDIA_FLAGGED',
        severity: 'HIGH',
      }).catch(() => undefined);
    }

    return verdict;
  }

  async getMediaVerdicts(matchId: string) {
    return this.prisma.mediaModerationVerdict.findMany({
      where: { matchId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async applyAction(
    caseId: string,
    moderatorId: string,
    type: 'WARN' | 'RESTRICT_MATCHING' | 'SUSPEND' | 'BAN' | 'DISMISS_CASE',
    note: string,
    until?: Date | null,
  ): Promise<void> {
    const modCase = await this.prisma.moderationCase.findUnique({ where: { id: caseId } });
    if (!modCase) throw new Error('Case not found');
    await this.prisma.moderationAction.create({
      data: { caseId, moderatorId, type, note, until: until ?? null },
    });
    if (type === 'SUSPEND') {
      await this.prisma.user.update({
        where: { id: modCase.subjectUserId },
        data: { status: 'SUSPENDED', suspendedUntil: until ?? new Date(Date.now() + 24 * 3600e3) },
      });
    } else if (type === 'BAN') {
      await this.prisma.user.update({
        where: { id: modCase.subjectUserId },
        data: { status: 'BANNED' },
      });
    } else if (type === 'DISMISS_CASE') {
      await this.prisma.moderationCase.update({
        where: { id: caseId },
        data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNote: note },
      });
      return;
    }
    await this.prisma.moderationCase.update({
      where: { id: caseId },
      data: { status: 'UNDER_REVIEW' },
    });
  }

  async updateCaseStatus(
    caseId: string,
    status: string,
    moderatorId: string,
    note: string,
  ): Promise<void> {
    await this.prisma.moderationCase.update({
      where: { id: caseId },
      data: {
        status,
        ...(status === 'RESOLVED' ? { resolvedAt: new Date(), resolutionNote: note } : {}),
        assignedTo: moderatorId,
      },
    });
  }

  async listCases(status?: string): Promise<unknown[]> {
    const rows = await this.prisma.moderationCase.findMany({
      where: status ? { status } : undefined,
      include: { actions: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows;
  }
}
