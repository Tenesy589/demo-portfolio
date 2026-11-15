// Walk through the Omex demo (site + Nova admin) like a visitor; screenshots + console/network errors.
// Usage: node omex-walk.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:7110';
const OUT = new URL('./shots/omex/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const sitePages = ['/', '/user/proxy', '/user/my', '/user/history', '/user/payments', '/payments/add',
  '/support', '/support/1', '/user/referral-link', '/user/panel', '/user/contests-rewards', '/user/profile',
  '/user/account', '/news', '/how-it-works'];
const novaPages = ['/nova/dashboards/main', '/nova/resources/users', '/nova/resources/proxies',
  '/nova/resources/tickets', '/nova/resources/withdrawals-resources',
  '/nova/resources/pages', '/nova/resources/countries', '/nova/resources/purchase-histories'];

const problems = [];
async function track(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${tag}] console: ${m.text().slice(0, 160)}`); });
  page.on('pageerror', (e) => problems.push(`[${tag}] pageerror: ${e.message.slice(0, 160)}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) problems.push(`[${tag}] ${r.status()} ${r.url().replace(BASE, '')}`); });
}
const name = (p) => p.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'home';

const browser = await chromium.launch();
for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  // --- customer site
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await track(page, `site-${label}`);
  await page.goto(BASE + '/user/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}${label}-site-login.png` });
  await page.locator('input[type="email"], input[name="email"], input[name="username"], input[type="text"]').first().fill('demo@omex.demo');
  await page.locator('input[type="password"]').first().fill('demo1234');
  await page.locator('.entrance-form__btn').first().click();
  await page.waitForTimeout(2500);
  problems.push(`[site-${label}] after login url: ${page.url().replace(BASE, '')}`);
  for (const p of sitePages) {
    await page.goto(BASE + p, { waitUntil: 'networkidle' }).catch((e) => problems.push(`[site-${label}] goto ${p}: ${e.message}`));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}${label}-site-${name(p)}.png`, fullPage: label === 'desktop' });
  }
  await ctx.close();

  // --- Nova admin
  const actx = await browser.newContext({ viewport });
  const admin = await actx.newPage();
  await track(admin, `nova-${label}`);
  await admin.goto(BASE + '/nova/login', { waitUntil: 'networkidle' });
  await admin.screenshot({ path: `${OUT}${label}-nova-login.png` });
  await admin.fill('input[name="email"], input#email', 'admin@omex.demo');
  await admin.fill('input[type="password"]', 'demo1234');
  await admin.locator('button[type="submit"]').click();
  await admin.waitForTimeout(2500);
  problems.push(`[nova-${label}] after login url: ${admin.url().replace(BASE, '')}`);
  for (const p of novaPages) {
    await admin.goto(BASE + p, { waitUntil: 'networkidle' }).catch((e) => problems.push(`[nova-${label}] goto ${p}: ${e.message}`));
    await admin.waitForTimeout(1200);
    await admin.screenshot({ path: `${OUT}${label}-nova-${name(p)}.png` });
  }
  await actx.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'no problems');
console.log('screenshots:', OUT);
