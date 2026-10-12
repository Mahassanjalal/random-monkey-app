import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  // Feature flags (development defaults)
  const flags = [
    { key: 'premium_badges', enabled: true, rolloutPct: 100, note: 'Cosmetic premium badge' },
    { key: 'video_matches', enabled: true, rolloutPct: 100, note: 'Video matchmaking enabled' },
    { key: 'ai_text_moderation', enabled: false, rolloutPct: 0, note: 'Requires MODERATION_PROVIDER=none|openai' },
    { key: 'age_assurance_provider', enabled: false, rolloutPct: 0, note: 'Requires AGE_ASSURANCE_PROVIDER env' },
  ];
  for (const f of flags) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      create: { ...f, updatedBy: 'seed' },
      update: {},
    });
  }

  // Matching policy v1 (dev defaults)
  const existing = await prisma.matchingPolicyVersion.findFirst({ orderBy: { version: 'desc' } });
  if (!existing) {
    await prisma.matchingPolicyVersion.create({
      data: {
        version: 1,
        configJson: JSON.stringify({
          maleQueueAllocationTargetPct: 50,
          fairWaitBoostEnabled: true,
          sparsePoolThreshold: 8,
        }),
        note: 'seeded defaults',
        activeSince: new Date(),
      },
    });
  }

  // Dev-only admin account (authkey login; not for production)
  if (process.env.NODE_ENV !== 'production') {
    const adminUsername = 'admin';
    const existingAdmin = await prisma.user.findUnique({ where: { username: adminUsername } });
    if (!existingAdmin) {
      await prisma.user.create({
        data: {
          id: randomUUID(),
          username: adminUsername,
          email: 'admin@buddy.local',
          passwordHash: '',
          authKey: 'authkey:dev-admin-1234567890',
          role: 'ADMIN',
          status: 'ACTIVE',
          ageAssurance: 'VERIFIED',
          birthDate: '1990-01-01',
          acceptedTermsAt: new Date(),
          profile: { create: { displayName: 'Buddy Admin', interests: '[]' } },
          preferences: { create: { seeking: 'EVERYONE' } },
        },
      });
      console.log('Seeded dev admin: username=admin, password=authkey:dev-admin-1234567890');
    }
  }
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
