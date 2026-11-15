import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const OUT = process.argv[2] ?? './shots', BASE = process.argv[3] ?? 'demo.glowly.uz', PROTO = process.argv[4] ?? 'https';
const url = (sub, path = '/') => `${PROTO}://${sub ? sub + '.' : ''}${BASE}${path}`;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const log = [];
async function page(vp) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: 'light' });
  const p = await ctx.newPage();
  p.on('console', (m) => m.type() === 'error' && log.push(`[console] ${p.url()} :: ${m.text().slice(0, 200)}`));
  p.on('pageerror', (e) => log.push(`[pageerror] ${p.url()} :: ${e.message.slice(0, 200)}`));
  p.on('response', (r) => r.status() >= 400 && log.push(`[http ${r.status()}] ${r.url()}`));
  return p;
}
const shot = async (p, name) => { await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); };
const D = { width: 1440, height: 900 }, M = { width: 390, height: 844 };

for (const [vp, tag] of [[D, 'd'], [M, 'm']]) {
  // Landing
  let p = await page(vp);
  await p.goto(url(''), { waitUntil: 'networkidle' }); await shot(p, `${tag}-01-landing`);

  // TaskFlow
  p = await page(vp);
  await p.goto(url('taskflow'), { waitUntil: 'networkidle' }); await shot(p, `${tag}-10-taskflow-login`);
  await p.getByRole('button', { name: 'Войти' }).click();
  await p.waitForURL((u) => !u.pathname.includes('login')); await shot(p, `${tag}-11-taskflow-boards`);
  await p.locator('a', { hasText: 'Запуск сайта' }).first().click(); await p.waitForTimeout(1500); await shot(p, `${tag}-12-taskflow-board`);
  await p.getByText('Вход через Google', { exact: true }).first().click().catch(() => {}); await shot(p, `${tag}-13-taskflow-card`);

  // AdminHub
  p = await page(vp);
  await p.goto(url('admin'), { waitUntil: 'networkidle' }); await shot(p, `${tag}-20-admin-login`);
  await p.locator('button.btn.primary').click(); await p.waitForURL(/dashboard/); await p.waitForTimeout(2000); await shot(p, `${tag}-21-admin-dashboard`);
  await p.goto(url('admin', '/customers'), { waitUntil: 'networkidle' }); await shot(p, `${tag}-22-admin-customers`);
  if (tag === 'd') {
    await p.locator('tr.clickable').first().click(); await p.waitForTimeout(1500); await shot(p, `${tag}-23-admin-customer`);
    await p.goto(url('admin', '/customers/new'), { waitUntil: 'networkidle' }); await shot(p, `${tag}-24-admin-new`);
    await p.goto(url('admin', '/ml'), { waitUntil: 'networkidle' }); await p.waitForTimeout(1200); await shot(p, `${tag}-25-admin-ml`);
    await p.goto(url('admin', '/admin/users'), { waitUntil: 'networkidle' }); await shot(p, `${tag}-26-admin-users`);
  }

  // PulseCheck
  p = await page(vp);
  await p.goto(url('pulse'), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3000); await shot(p, `${tag}-30-pulse`);
}
await browser.close();
console.log([...new Set(log)].join('\n') || 'no errors');
