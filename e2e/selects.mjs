import { chromium } from 'playwright';
const [ADMIN, TASK] = [process.argv[2] ?? 'http://admin.localhost:7100', process.argv[3] ?? 'http://taskflow.localhost:7100'];
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const shown = (loc) => loc.evaluateAll((els) => els.map((s) => s.options[s.selectedIndex]?.text.trim()));
let fails = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: shown ${JSON.stringify(got)}${ok ? '' : ' expected ' + JSON.stringify(want)}`); };

// AdminHub
await p.goto(ADMIN); await p.locator('button.btn.primary').click(); await p.waitForURL(/dashboard/);
const token = await p.evaluate(() => JSON.parse(localStorage.getItem('adminhub.session')).access_token);
const api = (path) => p.evaluate(async ([path, token]) => (await fetch(path, { headers: { Authorization: `Bearer ${token}` } })).json(), [path, token]);

const users = await api('/api/auth/users');
await p.goto(ADMIN + '/admin/users'); await p.waitForSelector('tbody tr'); await p.waitForTimeout(500);
const roleName = { admin: 'Администратор', manager: 'Менеджер', viewer: 'Наблюдатель' };
check('users: role per row', await shown(p.locator('tbody select')), users.map((u) => roleName[u.role]));

await p.goto(ADMIN + '/customers?region=Asia&segment=Enterprise&status=churned'); await p.waitForSelector('.filters select'); await p.waitForTimeout(800);
check('customers: filters from URL', await shown(p.locator('.filters select')), ['Asia', 'Enterprise', 'ушёл']);
await p.goto(ADMIN + '/customers'); await p.waitForTimeout(800);
check('customers: no filters', await shown(p.locator('.filters select')), ['Регион: Все', 'Сегмент: Все', 'Статус: Все']);

const c = (await api('/api/customers?size=1&segment=MidMarket&status=active')).items[0];
await p.goto(`${ADMIN}/customers/${c.id}/edit`); await p.waitForSelector('select[formcontrolname=plan]'); await p.waitForTimeout(800);
const statusRu = { lead: 'лид', active: 'активный', churned: 'ушёл' };
check(`edit form (customer ${c.id})`, await shown(p.locator('form select')), [c.region, c.segment, statusRu[c.status], c.plan]);

await p.goto(ADMIN + '/ml'); await p.waitForSelector('select'); await p.waitForTimeout(500);
check('ml simulator defaults', await shown(p.locator('select')), ['SMB', 'basic']);

// TaskFlow card modal
await p.goto(TASK); await p.getByRole('button', { name: 'Войти' }).click(); await p.waitForURL((u) => !u.pathname.includes('login'));
const tf = await p.evaluate(() => JSON.parse(localStorage.getItem('taskflow-auth')).state.token);
await p.locator('a', { hasText: 'Запуск сайта' }).first().click(); await p.waitForSelector('section h3');
const boardId = p.url().split('/').pop();
const board = await p.evaluate(async ([id, t]) => (await fetch(`/api/boards/${id}`, { headers: { Authorization: `Bearer ${t}` } })).json(), [boardId, tf]);
const card = board.columns.flatMap((x) => x.cards).find((x) => x.assignee && x.priority === 'HIGH');
await p.getByText(card.title, { exact: true }).click(); await p.waitForSelector('[role=dialog] select'); await p.waitForTimeout(800);
const pr = { LOW: 'Низкий', MEDIUM: 'Средний', HIGH: 'Высокий' };
check(`taskflow card modal ("${card.title}")`, await shown(p.locator('[role=dialog] select')), [pr[card.priority], card.assignee.name]);

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL SELECTS OK');
process.exit(fails ? 1 : 0);
