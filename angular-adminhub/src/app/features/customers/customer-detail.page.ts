import { HelpComponent } from '../../shared/help.component';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { CustomersApi } from '../../core/api';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { ToastService } from '../../core/toast.service';
import { HasRoleDirective } from '../../shared/has-role.directive';
import { RiskBadgeComponent } from '../../shared/ui';

@Component({
  selector: 'app-customer-detail',
  imports: [HelpComponent, RouterLink, TranslatePipe, CurrencyPipe, DatePipe, DecimalPipe, HasRoleDirective, RiskBadgeComponent],
  template: `
    @if (customer.value(); as c) {
      <div class="page-head">
        <div>
          <a routerLink="/customers" class="muted">← {{ 'nav.customers' | t }}</a>
          <h1>{{ c.name }} <span class="badge" [class]="'status-' + c.status">{{ 'status.' + c.status | t }}</span></h1>
          <p class="muted">{{ c.company }} · {{ c.region }} · {{ c.email }}</p>
        </div>
        <div class="row">
          <a *appHasRole="'manager'" class="btn ghost" [routerLink]="['edit']">✎ {{ 'cust.edit' | t }}</a>
          <button *appHasRole="'admin'" class="btn danger" (click)="remove(c.id)">{{ 'cust.delete' | t }}</button>
        </div>
      </div>

      <app-help key="help.customer" />
      <section class="grid kpis">
        <div class="card kpi"><span class="muted">{{ 'cust.spend' | t }}</span><strong>{{ c.monthly_spend | currency: 'USD' : 'symbol' : '1.0-0' }}</strong></div>
        <div class="card kpi"><span class="muted">{{ 'cust.tenure' | t }}</span><strong>{{ c.tenure_months }}</strong></div>
        <div class="card kpi"><span class="muted">{{ 'cust.plan' | t }}</span><strong>{{ c.plan }}</strong></div>
        <div class="card kpi"><span class="muted">{{ 'cust.nps' | t }}</span><strong>{{ c.nps }}/10</strong></div>
        <div class="card kpi"><span class="muted">{{ 'cust.tickets' | t }}</span><strong>{{ c.support_tickets }}</strong></div>
      </section>

      <section class="grid two">
        <div class="card">
          <h3>{{ 'cust.risk' | t }} @if (churn.value(); as p) { <app-risk [risk]="p.risk" [probability]="p.probability" /> }</h3>
          @if (churn.value(); as p) {
            <p class="muted">{{ 'cust.drivers' | t }}</p>
            @for (d of p.drivers; track d.feature) {
              <div class="driver">
                <span>{{ 'feat.' + d.feature | t }} <small class="muted">{{ d.value | number: '1.0-0' }} · {{ 'cust.typical' | t }} {{ d.typical | number: '1.0-0' }}</small></span>
                <div class="bar"><div [class.neg]="d.impact < 0" [style.width.%]="barWidth(d.impact)"></div></div>
                <small [class.pos]="d.impact > 0">{{ d.impact > 0 ? '+' : '' }}{{ d.impact * 100 | number: '1.0-1' }} {{ 'unit.pp' | t }}</small>
              </div>
            }
          }
        </div>
        <div class="card">
          <h3>{{ 'cust.orders' | t }}</h3>
          <ul class="list">
            @for (o of orders.value(); track o.id) {
              <li><span>{{ o.product }}</span><span class="spacer"></span><span class="muted">{{ o.created_at | date: 'mediumDate' : undefined : i18n.locale() }}</span><strong>{{ o.amount | currency: 'USD' }}</strong></li>
            } @empty { <li class="muted">—</li> }
          </ul>
          <h3>{{ 'form.contacts' | t }}</h3>
          <ul class="list">
            @for (ct of c.contacts; track ct.email) {
              <li><strong>{{ ct.name }}</strong><span class="muted">{{ ct.role }}</span><span class="spacer"></span><a [href]="'mailto:' + ct.email">{{ ct.email }}</a></li>
            }
          </ul>
        </div>
      </section>
    } @else if (customer.isLoading()) {
      <div class="card skeleton tall"></div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CustomerDetailPage {
  readonly id = input.required<string>();
  private readonly api = inject(CustomersApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(I18nService);

  /** rxResource re-fetches automatically whenever the `id` input signal changes. */
  readonly customer = rxResource({ params: () => +this.id(), stream: ({ params }) => this.api.get(params) });
  readonly orders = rxResource({ params: () => +this.id(), stream: ({ params }) => this.api.orders(params) });
  readonly churn = rxResource({ params: () => +this.id(), stream: ({ params }) => this.api.churn(params).pipe(catchError(() => of(undefined))) });

  private readonly maxImpact = computed(() => Math.max(0.01, ...(this.churn.value()?.drivers ?? []).map((d) => Math.abs(d.impact))));
  barWidth = (impact: number) => (Math.abs(impact) / this.maxImpact()) * 100;

  remove(id: number) {
    if (!confirm(this.i18n.t('cust.confirmDelete'))) return;
    this.api.remove(id).subscribe(() => {
      this.toast.success('✓');
      this.router.navigate(['/customers']);
    });
  }
}
