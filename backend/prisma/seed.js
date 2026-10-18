const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  for (const p of [
    { key: 'credits_100', name: '100 Credits', priceCents: 499, currency: 'USD', credits: 100, active: true },
    { key: 'credits_500', name: '500 Credits', priceCents: 1999, currency: 'USD', credits: 500, active: true },
    { key: 'credits_1000', name: '1000 Credits', priceCents: 3499, currency: 'USD', credits: 1000, active: true },
  ]) {
    await prisma.creditProduct.upsert({
      where: { key: p.key },
      update: {},
      create: p,
    });
  }
  console.log('Credit products seeded');
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
