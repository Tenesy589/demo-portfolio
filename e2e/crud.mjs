import { chromium } from 'playwright';
const BASE = process.argv[2] ?? 'http://taskflow.localhost:7100';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
let fails = 0; const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${extra}`); };
const api = (path, init = {}) => p.evaluate(async ([path, init]) => {
  const t = JSON.parse(localStorage.getItem('taskflow-auth')).state.token;
  const r = await fetch('/api' + path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } });
  return r.status === 204 ? null : r.json();
}, [path, init]);

await p.goto(BASE); await p.getByRole('button', { name: 'Войти' }).click(); await p.waitForURL((u) => !u.pathname.includes('login'));
await p.getByPlaceholder('Название новой доски').fill('Тестовая доска'); await p.getByRole('button', { name: 'Создать доску' }).click();
await p.waitForURL(/boards\//); await p.waitForSelector('section h3'); const id = p.url().split('/').pop();

// rename board
await p.getByRole('button', { name: 'Тестовая доска' }).click(); await p.keyboard.press('ControlOrMeta+a'); await p.keyboard.type('Отдел продаж'); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
check('board renamed', (await api(`/boards/${id}`)).title === 'Отдел продаж');

// rename first column
await p.locator('section h3 button').first().click(); await p.keyboard.press('ControlOrMeta+a'); await p.keyboard.type('Новые'); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
let board = await api(`/boards/${id}`);
check('column renamed', board.columns[0].title === 'Новые', `(${board.columns.map((c) => c.title).join(', ')})`);

// add two cards to the 2nd column, delete one via the modal
const col2 = p.locator('section').nth(1);
for (const t of ['Карточка А', 'Карточка Б']) { await col2.getByText('+ Добавить карточку').click(); await p.keyboard.type(t); await p.keyboard.press('Enter'); await p.waitForTimeout(600); }
await p.getByText('Карточка А', { exact: true }).click(); await p.locator('[role=dialog]').getByRole('button', { name: 'Удалить', exact: true }).click();
await p.getByRole('button', { name: 'Нажмите ещё раз для удаления' }).click(); await p.waitForTimeout(700);
board = await api(`/boards/${id}`);
check('card deleted', board.columns[1].cards.map((c) => c.title).join() === 'Карточка Б');

// delete column 2 (with 1 card): first click arms, second confirms
const del = col2.locator('header button[title="Удалить колонку"]');
await del.click(); const armedText = (await del.textContent()).trim(); await del.click(); await p.waitForTimeout(700);
board = await api(`/boards/${id}`);
check('column delete asks first', armedText.includes('1'), `("${armedText}")`);
check('column deleted', board.columns.length === 3 && !board.columns.some((c) => c.cards.some((k) => k.title === 'Карточка Б')));

// second tab watching the board, then delete the board from the first
const p2 = await ctx.newPage(); await p2.goto(`${BASE}/boards/${id}`); await p2.waitForSelector('section h3'); await p2.waitForTimeout(800);
await p.getByRole('button', { name: 'Удалить доску' }).click(); await p.getByRole('button', { name: 'Удалить доску навсегда?' }).click();
await p.waitForURL((u) => u.pathname === '/'); await p.waitForTimeout(1200);
check('board deleted', !(await api('/boards')).some((x) => x.id === id));
check('deleted board gone from list', (await p.locator(`a[href="/boards/${id}"]`).count()) === 0);
check('other tab left the deleted board', new URL(p2.url()).pathname === '/', `(${new URL(p2.url()).pathname})`);
// clean up leftovers from earlier runs
for (const x of await api('/boards')) if (['Отдел продаж', 'Тестовая доска'].includes(x.title)) await api(`/boards/${x.id}`, { method: 'DELETE' });
console.log('page errors:', errors.length ? errors : 'none');
await b.close(); process.exit(fails ? 1 : 0);
