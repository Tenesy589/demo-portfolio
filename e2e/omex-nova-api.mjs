// Logs into Nova and opens every resource index + first detail page; reports HTTP errors.
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:7110';
const keys = `cities commission-analytics commission-distributions commission-distribution-settings complaints contests
contest-users continents countries country-hosts email-templates gates host-proxies lang-templates languages articles
categories pages page-blocks proxies proxy-hostings proxy-i-s-ps proxy-orgs proxy-rent-periods proxy-types
purchase-histories purchase-history-proxies rates referrals referrals-chains refunded-timers roles notification-settings
states tickets transaction-histories trial-periods unlimited-subscriptions users user-referrals user-proxies
virtual-proxies withdrawals-resources z-i-ps report-settings`.split(/\s+/);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(BASE + '/nova/login');
await page.fill('input[name="email"], input#email', 'admin@omex.demo');
await page.fill('input[type="password"]', 'demo1234');
await page.locator('button[type="submit"]').click();
await page.waitForURL(/dashboards/);

const bad = [];
for (const k of keys) {
  const res = await page.request.get(`${BASE}/nova-api/${k}?page=1&perPage=5`, { headers: { Accept: 'application/json' } });
  let note = `${res.status()}`;
  if (res.ok()) {
    const j = await res.json();
    const first = j.resources?.[0]?.id?.value;
    note += ` rows=${j.resources?.length ?? '?'}`;
    if (first !== undefined) {
      const d = await page.request.get(`${BASE}/nova-api/${k}/${first}`, { headers: { Accept: 'application/json' } });
      note += ` detail=${d.status()}`;
      if (!d.ok()) bad.push(`${k} detail ${d.status()}`);
    }
  } else bad.push(`${k} index ${res.status()}`);
  console.log(k.padEnd(36), note);
}
for (const tool of ['/nova/referrals-chains', '/nova/commission-distribution', '/nova/wallets-withdraw-tool', '/nova/wallets-withdraw-history-tool', '/nova/support-chat', '/nova/generate-proxy', '/nova/proxy-hosting-management-tool', '/nova/proxy-checker']) {
  const errs = [];
  const h = (r) => { if (r.status() >= 500) errs.push(`${r.status()} ${r.url().replace(BASE, '')}`); };
  page.on('response', h);
  await page.goto(BASE + tool, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1000);
  page.off('response', h);
  console.log(tool.padEnd(36), errs.length ? errs.join(', ') : 'ok');
  if (errs.length) bad.push(`${tool}: ${errs.join(', ')}`);
}
console.log('\nproblems:', bad.length ? '\n' + bad.join('\n') : 'none');
await browser.close();
