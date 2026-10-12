import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({
    where: { id: { in: ['8ce359e2-50d4-4cd4-9eef-9539fb4b5600', 'fd0f5790-a4a9-43fd-9baa-5f25ba6ad865'] }, deletedAt: null, status: 'ACTIVE' },
    include: { preferences: true, profile: true, subscriptions: true, matchesParticipant: { include: { match: true } } },
  });
  console.log('found', users.length);
  for (const u of users) console.log(u.id, u.status, u.deletedAt, !!u.preferences, !!u.profile);
  const all = await p.user.findMany({ select: { id: true, status: true, deletedAt: true, username: true }, take: 10, orderBy: { createdAt: 'desc' } });
  console.log('recent users:', JSON.stringify(all, null, 0).slice(0, 600));
  await p.$disconnect();
})();
