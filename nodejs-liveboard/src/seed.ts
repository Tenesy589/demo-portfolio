import { Priority, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const CARDS: [string, string, Priority][] = [
  ['Backlog', 'Dark mode for mobile app', 'LOW'],
  ['Backlog', 'Export board to PDF', 'MEDIUM'],
  ['Backlog', 'SSO with Google Workspace', 'HIGH'],
  ['Backlog', 'Keyboard shortcuts', 'LOW'],
  ['In progress', 'Real-time presence avatars', 'HIGH'],
  ['In progress', 'Rate limiting on public API', 'MEDIUM'],
  ['In progress', 'Migrate to Postgres 17', 'MEDIUM'],
  ['Review', 'Optimistic UI for drag & drop', 'HIGH'],
  ['Review', 'Redis adapter for horizontal scaling', 'HIGH'],
  ['Done', 'JWT authentication', 'MEDIUM'],
  ['Done', 'CSV export via streams', 'LOW'],
  ['Done', 'Docker Compose setup', 'MEDIUM'],
];

async function main() {
  if (await prisma.user.findUnique({ where: { email: 'demo@liveboard.dev' } })) {
    console.log('Seed: already applied, skipping');
    return;
  }
  const passwordHash = await hash('demo1234', 10);
  const [demo, ...team] = await Promise.all(
    [
      ['demo@liveboard.dev', 'Demo User'],
      ['alice@liveboard.dev', 'Alice Johnson'],
      ['bob@liveboard.dev', 'Bob Smith'],
    ].map(([email, name]) => prisma.user.create({ data: { email, name, passwordHash } })),
  );
  const people = [demo, ...team];

  const board = await prisma.board.create({
    data: {
      title: 'Launch v2.0 🚀',
      ownerId: demo.id,
      columns: { create: ['Backlog', 'In progress', 'Review', 'Done'].map((title, i) => ({ title, position: (i + 1) * 1000 })) },
    },
    include: { columns: true },
  });
  const columnId = (title: string) => board.columns.find((c) => c.title === title)!.id;

  await prisma.card.createMany({
    data: CARDS.map(([col, title, priority], i) => ({
      boardId: board.id,
      columnId: columnId(col),
      title,
      priority,
      position: (i + 1) * 1000,
      assigneeId: people[i % people.length].id,
      description: 'Seeded demo card. Open it in two browser tabs and edit — changes sync live.',
    })),
  });
  await prisma.board.create({
    data: { title: 'Marketing site', ownerId: team[0].id, columns: { create: ['To do', 'Doing', 'Done'].map((title, i) => ({ title, position: (i + 1) * 1000 })) } },
  });
  console.log('Seed: demo@liveboard.dev / demo1234 (also alice@, bob@)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
