const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
(async () => {
  const prisma = new PrismaClient();
  const raw = fs.readFileSync('prisma/migrations/20260709070000_roles_and_sortorder/migration.sql','utf8');
  const stmts = raw.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n')
    .split(';').map(s=>s.trim()).filter(Boolean);
  await prisma.$transaction(stmts.map(s=>prisma.$executeRawUnsafe(s)));
  console.log('Applied', stmts.length, 'statements.');
  await prisma.$disconnect();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
