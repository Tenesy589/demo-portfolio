import { Priority, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const CARDS: [string, string, Priority][] = [
  ['Идеи', 'Тёмная тема в мобильном приложении', 'LOW'],
  ['Идеи', 'Выгрузка отчёта в PDF', 'MEDIUM'],
  ['Идеи', 'Вход через Google', 'HIGH'],
  ['Идеи', 'Горячие клавиши', 'LOW'],
  ['В работе', 'Онлайн-оплата картой', 'HIGH'],
  ['В работе', 'Уведомления в Telegram', 'MEDIUM'],
  ['В работе', 'Новый дизайн главной страницы', 'MEDIUM'],
  ['На проверке', 'Личный кабинет клиента', 'HIGH'],
  ['На проверке', 'Ускорить загрузку каталога', 'HIGH'],
  ['Готово', 'Регистрация и вход', 'MEDIUM'],
  ['Готово', 'Выгрузка в Excel', 'LOW'],
  ['Готово', 'Запуск на сервере', 'MEDIUM'],
];

async function main() {
  if (await prisma.user.findUnique({ where: { email: 'demo@liveboard.dev' } })) {
    console.log('Seed: already applied, skipping');
    return;
  }
  const passwordHash = await hash('demo1234', 10);
  const [demo, ...team] = await Promise.all(
    [
      ['demo@liveboard.dev', 'Демо Пользователь'],
      ['alice@liveboard.dev', 'Алиса Иванова'],
      ['bob@liveboard.dev', 'Борис Петров'],
    ].map(([email, name]) => prisma.user.create({ data: { email, name, passwordHash } })),
  );
  const people = [demo, ...team];

  const board = await prisma.board.create({
    data: {
      title: 'Запуск сайта 🚀',
      ownerId: demo.id,
      columns: { create: ['Идеи', 'В работе', 'На проверке', 'Готово'].map((title, i) => ({ title, position: (i + 1) * 1000 })) },
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
      description: 'Демо-задача. Откройте доску в двух вкладках и измените карточку — изменения появятся в обеих сразу.',
    })),
  });
  await prisma.board.create({
    data: { title: 'Маркетинг', ownerId: team[0].id, columns: { create: ['Сделать', 'В работе', 'Готово'].map((title, i) => ({ title, position: (i + 1) * 1000 })) } },
  });
  console.log('Seed: demo@liveboard.dev / demo1234 (also alice@, bob@)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
