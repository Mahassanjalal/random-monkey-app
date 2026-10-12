import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AdminRole = 'ADMIN' | 'MODERATOR' | 'SUPPORT';

const PERMISSIONS: Record<AdminRole, string[]> = {
  ADMIN: ['users', 'cases', 'metrics', 'policies', 'flags', 'audit', 'appeals', 'support', 'transactions'],
  MODERATOR: ['cases', 'appeals', 'users:read', 'metrics'],
  SUPPORT: ['users:read', 'audit', 'metrics'],
};

@Injectable()
export class AdminService {
  constructor(public prisma: PrismaService) {}

  requirePermission(role: string | undefined, permission: string): void {
    if (!role) throw new ForbiddenException();
    const list = PERMISSIONS[role as AdminRole];
    if (!list) throw new ForbiddenException();
    const ok =
      list.includes(permission) ||
      list.some((p) => p.endsWith(':*') && permission.startsWith(p.slice(0, -1)));
    if (!ok) throw new ForbiddenException(`Missing permission ${permission}`);
  }

  async audit(
    actorId: string,
    action: string,
    targetType: string,
    targetId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: {
        actorId,
        action,
        targetType,
        targetId,
        metadataJson: JSON.stringify(metadata),
      },
    });
  }

  async users(query: { q?: string; status?: string; skip?: number; take?: number }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.q) where.username = { contains: query.q };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          status: true,
          role: true,
          ageAssurance: true,
          createdAt: true,
        },
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 200),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { rows, total };
  }

  async updateUserStatus(
    actorId: string,
    userId: string,
    patch: { status?: string; reason?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: patch.status ?? user.status },
    });
    if (patch.status === 'BANNED' || patch.status === 'SUSPENDED') {
      await this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit(actorId, 'user.status_update', 'User', userId, { ...patch });
    return { ok: true };
  }

  async metrics() {
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const [total, activeToday, suspended, banned, openReports, matches24h, activeNow, activeSubs] =
      await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.user.count({ where: { deletedAt: null, updatedAt: { gte: dayAgo } } }),
        this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
        this.prisma.user.count({ where: { status: 'BANNED' } }),
        this.prisma.userReport.count({ where: { status: 'OPEN' } }),
        this.prisma.match.count({ where: { createdAt: { gte: dayAgo } } }),
        this.prisma.match.count({ where: { status: 'ACTIVE' } }),
        this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      ]);
    const bySeverity = await this.prisma.userReport.groupBy({
      by: ['severity'],
      _count: true,
      where: { status: 'OPEN' },
    });
    const severityMap: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const g of bySeverity) severityMap[g.severity] = g._count;
    return {
      users: { total, activeToday, suspended, banned },
      reports: { open: openReports, bySeverity: severityMap },
      matches: { last24h: matches24h, activeNow },
      revenue: { activeSubs, mrrCents: 0 },
    };
  }

  async auditLog(take = 100) {
    const rows = await this.prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      createdAt: r.createdAt.toISOString(),
      metadata: JSON.parse(r.metadataJson || '{}') as Record<string, unknown>,
    }));
  }

  async flags(actorId: string) {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async setFlag(actorId: string, key: string, enabled: boolean, rolloutPct: number, note?: string) {
    await this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled, rolloutPct, note: note ?? '', updatedBy: actorId },
      update: { enabled, rolloutPct, updatedBy: actorId, ...(note !== undefined ? { note } : {}) },
    });
    await this.audit(actorId, 'flag.update', 'FeatureFlag', key, { enabled, rolloutPct });
    return { ok: true };
  }

  async policies(actorId: string) {
    const latest = await this.prisma.matchingPolicyVersion.findFirst({
      orderBy: { version: 'desc' },
    });
    return latest;
  }

  async setPolicy(actorId: string, cfg: Record<string, unknown>, note: string) {
    const latest = await this.prisma.matchingPolicyVersion.findFirst({
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;
    const created = await this.prisma.matchingPolicyVersion.create({
      data: {
        version,
        configJson: JSON.stringify(cfg),
        createdBy: actorId,
        note,
        activeSince: new Date(),
      },
    });
    await this.audit(actorId, 'policy.create', 'MatchingPolicyVersion', created.id, cfg);
    return created;
  }
}
