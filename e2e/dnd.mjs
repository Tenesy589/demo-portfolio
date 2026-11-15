import { chromium } from 'playwright';
const BASE = process.argv[2] ?? 'http://taskflow.localhost:7100';
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(BASE); await p.getByRole('button', { name: 'Войти' }).click();
await p.locator('a', { hasText: 'Запуск сайта' }).first().click();
await p.waitForSelector('section h3');

const columnCards = async () => p.$$eval('section', (secs) => secs.map((s) => ({ col: s.querySelector('h3')?.textContent, cards: [...s.querySelectorAll('p.text-sm')].map((x) => x.textContent) })));
async function drag(fromText, toText, { below = false } = {}) {
  const a = await p.getByText(fromText, { exact: true }).boundingBox();
  const b = await p.getByText(toText, { exact: true }).boundingBox();
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await p.mouse.down();
  await p.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 5 });
  const ty = below ? b.y + b.height + 8 : b.y + b.height / 2;
  await p.mouse.move(b.x + b.width / 2, ty, { steps: 25 });
  await p.waitForTimeout(150);
  await p.mouse.up();
  await p.waitForTimeout(900);
}
const where = (cols, title) => { for (const c of cols) { const i = c.cards.indexOf(title); if (i >= 0) return `${c.col}#${i}`; } return 'missing'; };

let before = await columnCards();
console.log('before:', before.map((c) => `${c.col}: ${c.cards.join(' | ')}`).join('\n        '));

// 1) cross-column: first card of "Идеи" onto the 2nd card of "В работе"
const moving = before[0].cards[0], target = before[1].cards[1];
await drag(moving, target);
let after = await columnCards();
console.log(`\n1) cross-column "${moving}" → onto "${target}": now ${where(after, moving)}  (target now ${where(after, target)})`);
console.log('   modal opened after drag?', await p.locator('[role=dialog]').count() > 0);

// 2) same column, move down: first card of "В работе" onto its last card
after = await columnCards();
const m2 = after[1].cards[0], t2 = after[1].cards.at(-1);
await drag(m2, t2);
let after2 = await columnCards();
console.log(`2) same-column "${m2}" → onto last "${t2}": now ${where(after2, m2)} of ${after2[1].cards.length}`);

// 3) into an empty-ish spot: onto the "Готово" column header area
const m3 = after2.slice(0, 3).find((c) => c.cards.length).cards[0];
const col = await p.getByText('Готово', { exact: true }).boundingBox();
const a = await p.getByText(m3, { exact: true }).boundingBox();
await p.mouse.move(a.x + 20, a.y + 10); await p.mouse.down(); await p.mouse.move(a.x + 30, a.y + 20, { steps: 5 });
await p.mouse.move(col.x + 40, col.y + 300, { steps: 25 }); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(900);
const after3 = await columnCards();
console.log(`3) "${m3}" dropped in empty area of «Готово»: now ${where(after3, m3)}`);

// 4) persisted?
await p.reload(); await p.waitForSelector('section h3'); await p.waitForTimeout(800);
const reloaded = await columnCards();
const same = JSON.stringify(reloaded) === JSON.stringify(after3);
console.log('4) order identical after reload:', same);
if (!same) console.log('   reloaded:', reloaded.map((c) => `${c.col}: ${c.cards.join(' | ')}`).join('\n             '));

// 5) click still opens the card
await p.getByText(reloaded[0].cards[0], { exact: true }).click(); await p.waitForTimeout(400);
console.log('5) click opens card modal:', await p.locator('[role=dialog]').count() > 0);
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
