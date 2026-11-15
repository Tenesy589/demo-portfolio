import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap, tap } from 'rxjs';
import { CustomersApi } from '../../core/api';
import { TranslatePipe } from '../../core/i18n.service';
import { CustomerQuery, REGIONS } from '../../core/models';
import { HasRoleDirective } from '../../shared/has-role.directive';

@Component({
  selector: 'app-customer-list',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, CurrencyPipe, HasRoleDirective],
  template: `
    <div class="page-head">
      <h1>{{ 'nav.customers' | t }} <span class="muted">{{ page()?.total ?? '' }}</span></h1>
      <a *appHasRole="'manager'" class="btn primary" routerLink="new">+ {{ 'cust.new' | t }}</a>
    </div>

    <div class="card filters">
      <input class="grow" [formControl]="search" [placeholder]="'cust.search' | t" />
      <select [value]="query().region ?? ''" (change)="setParam('region', $any($event.target).value)">
        <option value="">{{ 'cust.region' | t }}: {{ 'cust.all' | t }}</option>
        @for (r of regions; track r) { <option [value]="r">{{ r }}</option> }
      </select>
      <select [value]="query().segment ?? ''" (change)="setParam('segment', $any($event.target).value)">
        <option value="">{{ 'cust.segment' | t }}: {{ 'cust.all' | t }}</option>
        @for (s of ['SMB', 'MidMarket', 'Enterprise']; track s) { <option [value]="s">{{ s }}</option> }
      </select>
      <select [value]="query().status ?? ''" (change)="setParam('status', $any($event.target).value)">
        <option value="">{{ 'cust.status' | t }}: {{ 'cust.all' | t }}</option>
        @for (s of ['lead', 'active', 'churned']; track s) { <option [value]="s">{{ s }}</option> }
      </select>
    </div>

    <div class="card table-card" [class.loading]="loading()">
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              @for (c of columns; track c.key) {
                <th [class.sortable]="c.sortable" (click)="c.sortable && sortBy(c.key)">
                  {{ c.label | t }} @if (sortField() === c.key) { {{ sortDesc() ? '↓' : '↑' }} }
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (c of page()?.items; track c.id) {
              <tr [routerLink]="[c.id]" class="clickable">
                <td><strong>{{ c.name }}</strong><br /><small class="muted">{{ c.email }}</small></td>
                <td>{{ c.company }}</td>
                <td>{{ c.region }}</td>
                <td><span class="badge">{{ c.segment }}</span></td>
                <td><span class="badge" [class]="'status-' + c.status">{{ c.status }}</span></td>
                <td class="num">{{ c.monthly_spend | currency: 'USD' : 'symbol' : '1.0-0' }}</td>
                <td class="num">{{ c.tenure_months }}</td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty">{{ 'cust.empty' | t }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="pager">
        <button class="btn ghost sm" [disabled]="query().page <= 1" (click)="setParam('page', query().page - 1)">←</button>
        <span>{{ query().page }} / {{ totalPages() }}</span>
        <button class="btn ghost sm" [disabled]="query().page >= totalPages()" (click)="setParam('page', query().page + 1)">→</button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CustomerListPage implements OnInit {
  private readonly api = inject(CustomersApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly regions = REGIONS;
  readonly columns = [
    { key: 'name', label: 'cust.name', sortable: true },
    { key: 'company', label: 'cust.company', sortable: true },
    { key: 'region', label: 'cust.region', sortable: false },
    { key: 'segment', label: 'cust.segment', sortable: false },
    { key: 'status', label: 'cust.status', sortable: false },
    { key: 'monthly_spend', label: 'cust.spend', sortable: true },
    { key: 'tenure_months', label: 'cust.tenure', sortable: true },
  ];
  readonly search = new FormControl('', { nonNullable: true });
  readonly loading = signal(false);

  /** The URL is the single source of truth for filters → shareable, back-button friendly. */
  readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((p): CustomerQuery => ({
        q: p.get('q') ?? undefined,
        region: p.get('region') ?? undefined,
        segment: p.get('segment') ?? undefined,
        status: p.get('status') ?? undefined,
        sort: p.get('sort') ?? '-created_at',
        page: Number(p.get('page') ?? 1),
        size: 15,
      })),
    ),
    { requireSync: true },
  );

  /** switchMap cancels the in-flight request when filters change — no race conditions. */
  readonly page = toSignal(
    this.route.queryParamMap.pipe(
      map(() => this.query()),
      tap(() => this.loading.set(true)),
      switchMap((q) => this.api.list(q).pipe(catchError(() => of(null)))),
      tap(() => this.loading.set(false)),
    ),
  );

  readonly totalPages = computed(() => Math.max(1, Math.ceil((this.page()?.total ?? 0) / this.query().size)));
  readonly sortField = computed(() => this.query().sort.replace('-', ''));
  readonly sortDesc = computed(() => this.query().sort.startsWith('-'));

  ngOnInit() {
    this.search.setValue(this.query().q ?? '', { emitEvent: false });
    this.search.valueChanges
      .pipe(debounceTime(300), map((v) => v.trim()), distinctUntilChanged(), startWith(this.search.value), takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => q !== (this.query().q ?? '') && this.setParam('q', q));
  }

  sortBy(key: string) {
    this.setParam('sort', this.sortField() === key && !this.sortDesc() ? `-${key}` : key);
  }

  setParam(key: string, value: string | number) {
    this.router.navigate([], {
      queryParams: { [key]: value === '' ? null : value, ...(key !== 'page' && { page: null }) },
      queryParamsHandling: 'merge',
    });
  }
}
