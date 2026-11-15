import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { catchError, forkJoin, of } from 'rxjs';
import { AnalyticsApi, CustomersApi } from '../../core/api';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { ChartComponent } from '../../shared/chart.component';
import { KpiComponent, RiskBadgeComponent } from '../../shared/ui';

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7'];

@Component({
  selector: 'app-dashboard',
  imports: [ChartComponent, KpiComponent, RiskBadgeComponent, TranslatePipe, RouterLink, DecimalPipe],
  providers: [CurrencyPipe],
  template: `
    @if (data(); as d) {
      <section class="grid kpis">
        <app-kpi [label]="'dash.revenue' | t" [value]="money(d.kpis.revenue_total)" />
        <app-kpi [label]="'dash.lastMonth' | t" [value]="money(d.kpis.revenue_last_month)" [delta]="d.kpis.revenue_growth_pct" />
        <app-kpi [label]="'dash.aov' | t" [value]="money(d.kpis.avg_order_value)" />
        <app-kpi [label]="'dash.active' | t" [value]="d.kpis.active_customers" />
        <app-kpi [label]="'dash.churn' | t" [value]="d.kpis.churn_rate_pct + '%'" />
      </section>

      <section class="grid two">
        <div class="card wide">
          <h3>{{ 'dash.trend' | t }} <span class="muted">R² = {{ d.forecast.r2 }}</span></h3>
          <app-chart [config]="trendChart()!" [height]="300" />
        </div>
        <div class="card">
          <h3>{{ 'dash.byRegion' | t }}</h3>
          <app-chart [config]="regionChart()!" />
        </div>
        <div class="card">
          <h3>{{ 'dash.byProduct' | t }}</h3>
          <app-chart [config]="productChart()!" />
        </div>
      </section>

      <section class="grid two">
        <div class="card">
          <h3>{{ 'dash.cohorts' | t }}</h3>
          <div class="table-scroll">
            <table class="heatmap">
              <tr><th></th><th>n</th>@for (a of d.cohorts.ages; track a) { <th>M{{ a }}</th> }</tr>
              @for (c of d.cohorts.cohorts; track c; let i = $index) {
                <tr>
                  <th>{{ c }}</th><td class="muted">{{ d.cohorts.sizes[i] }}</td>
                  @for (v of d.cohorts.matrix[i]; track $index) {
                    <td [style.background]="v === null ? 'transparent' : 'rgba(99,102,241,' + v / 100 + ')'" [class.light]="v !== null && v > 55">{{ v === null ? '' : (v | number: '1.0-0') }}</td>
                  }
                </tr>
              }
            </table>
          </div>
        </div>
        <div class="card">
          <h3>{{ 'dash.atRisk' | t }}</h3>
          <ul class="list">
            @for (r of d.atRisk; track r.customer_id) {
              <li>
                <a [routerLink]="['/customers', r.customer_id]">{{ r.name }}</a>
                <span class="muted">{{ r.company }}</span>
                <span class="spacer"></span>
                <app-risk [risk]="r.risk" [probability]="r.probability" />
              </li>
            }
          </ul>
        </div>
      </section>
    } @else {
      <div class="grid kpis">@for (i of [1, 2, 3, 4, 5]; track i) { <div class="card skeleton"></div> }</div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DashboardPage {
  private readonly analytics = inject(AnalyticsApi);
  private readonly customers = inject(CustomersApi);
  private readonly currency = inject(CurrencyPipe);
  private readonly i18n = inject(I18nService);

  /** All widgets load in parallel; a failing ML endpoint doesn't break the page. */
  readonly data = toSignal(
    forkJoin({
      kpis: this.analytics.kpis(),
      forecast: this.analytics.forecast(6),
      region: this.analytics.breakdown('region'),
      product: this.analytics.breakdown('product'),
      cohorts: this.analytics.cohorts(10),
      atRisk: this.customers.atRisk(8).pipe(catchError(() => of([]))),
    }),
  );

  money = (v: number) => this.currency.transform(v, 'USD', 'symbol', '1.0-0', this.i18n.locale());

  readonly trendChart = computed<ChartConfiguration | undefined>(() => {
    const f = this.data()?.forecast;
    if (!f) return undefined;
    const labels = [...f.history.map((h) => h.month), ...f.forecast.map((p) => p.month)];
    const pad = (n: number) => Array(n).fill(null);
    const lastHist = f.history.at(-1)!.revenue;
    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Revenue', data: [...f.history.map((h) => h.revenue), ...pad(f.forecast.length)], borderColor: PALETTE[0], backgroundColor: 'rgba(99,102,241,.12)', fill: true, tension: 0.3 },
          { label: 'Forecast', data: [...pad(f.history.length - 1), lastHist, ...f.forecast.map((p) => p.revenue)], borderColor: PALETTE[2], borderDash: [6, 4], tension: 0.3 },
          { label: '95% CI', data: [...pad(f.history.length), ...f.forecast.map((p) => p.high)], borderWidth: 0, backgroundColor: 'rgba(245,158,11,.15)', fill: '+1', pointRadius: 0 },
          { label: '', data: [...pad(f.history.length), ...f.forecast.map((p) => p.low)], borderWidth: 0, pointRadius: 0 },
        ],
      },
      options: { plugins: { legend: { labels: { filter: (i) => !!i.text } } }, interaction: { mode: 'index', intersect: false } },
    };
  });

  readonly regionChart = computed<ChartConfiguration | undefined>(() => {
    const r = this.data()?.region;
    return r && { type: 'doughnut', data: { labels: r.map((x) => x.name), datasets: [{ data: r.map((x) => x.revenue), backgroundColor: PALETTE }] }, options: { plugins: { legend: { position: 'right' } } } };
  });

  readonly productChart = computed<ChartConfiguration | undefined>(() => {
    const p = this.data()?.product;
    return p && { type: 'bar', data: { labels: p.map((x) => x.name), datasets: [{ label: 'Revenue', data: p.map((x) => x.revenue), backgroundColor: PALETTE[0], borderRadius: 6 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } } } };
  });
}
