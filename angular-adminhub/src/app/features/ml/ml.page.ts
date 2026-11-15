import { HelpComponent } from '../../shared/help.component';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { catchError, debounceTime, of, startWith, switchMap } from 'rxjs';
import { MlApi } from '../../core/api';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { TaskStatus } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { HasRoleDirective } from '../../shared/has-role.directive';

@Component({
  selector: 'app-ml',
  imports: [HelpComponent, ReactiveFormsModule, TranslatePipe, DecimalPipe, PercentPipe, DatePipe, HasRoleDirective],
  template: `
    <div class="page-head"><h1>🧠 {{ 'nav.ml' | t }}</h1></div>
    <app-help key="help.ml" />
    <section class="grid two">
      <div class="card">
        <h3>{{ 'ml.model' | t }}</h3>
        @if (model.value(); as m) {
          <dl class="stats">
            <dt>{{ 'ml.algorithm' | t }}</dt><dd><strong>{{ modelName(m.model) }}</strong></dd>
            <dt>{{ 'ml.testAuc' | t }}</dt><dd><strong>{{ m.test_roc_auc | number: '1.2-2' : i18n.locale() }}</strong></dd>
            @for (s of cvScores(m.cv_roc_auc); track s[0]) { <dt>{{ 'ml.cvAuc' | t }} · {{ modelName(s[0]) }}</dt><dd>{{ s[1] | number: '1.2-2' : i18n.locale() }}</dd> }
            <dt>{{ 'ml.precisionRecall' | t }}</dt><dd>{{ m.precision | percent : undefined : i18n.locale() }} / {{ m.recall | percent : undefined : i18n.locale() }}</dd>
            <dt>{{ 'ml.trainTest' | t }}</dt><dd>{{ m.train_size }} / {{ m.test_size }}</dd>
            <dt>{{ 'ml.trainedAt' | t }}</dt><dd>{{ m.trained_at | date: 'medium' : undefined : i18n.locale() }}</dd>
          </dl>
          <p class="muted small">{{ 'ml.aucHint' | t }}</p>
        }
        @if (!auth.hasRole('admin')) { <p class="muted small">{{ 'ml.adminOnly' | t }}</p> }
        <div *appHasRole="'admin'" class="train">
          <button class="btn primary" [disabled]="training()" (click)="train()">{{ training() ? ('ml.training' | t) : ('ml.train' | t) }}</button>
          @if (task(); as t) {
            <div class="progress"><div [style.width.%]="t.progress?.percent ?? 0"></div></div>
            <small class="muted">{{ t.state }} · {{ t.progress?.step }}</small>
          }
        </div>
      </div>

      <div class="card" [formGroup]="whatIf">
        <h3>{{ 'ml.whatIf' | t }}</h3>
        <p class="muted">{{ 'ml.whatIfHint' | t }}</p>
        @for (f of sliders; track f.key) {
          <label class="slider">{{ 'feat.' + f.key | t }}: <strong>{{ whatIf.get(f.key)!.value }}</strong>
            <input type="range" [min]="f.min" [max]="f.max" [step]="f.step" [formControlName]="f.key" />
          </label>
        }
        <div class="row">
          <select formControlName="segment">@for (s of ['SMB', 'MidMarket', 'Enterprise']; track s) { <option>{{ s }}</option> }</select>
          <select formControlName="plan">@for (p of ['basic', 'pro', 'enterprise']; track p) { <option>{{ p }}</option> }</select>
        </div>
        @if (prediction(); as p) {
          <div class="gauge" [class]="'risk-' + p.risk">
            <span class="muted">{{ 'ml.probability' | t }}</span>
            <strong>{{ p.probability | percent: '1.0-0' : i18n.locale() }}</strong>
            <span class="badge" [class]="'risk-' + p.risk">{{ 'risk.' + p.risk | t }}</span>
          </div>
        }
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class MlPage {
  private readonly api = inject(MlApi);
  private readonly toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);

  readonly model = rxResource({ stream: () => this.api.model().pipe(catchError(() => of(undefined))) });
  readonly task = signal<TaskStatus | null>(null);
  readonly training = signal(false);

  readonly sliders = [
    { key: 'support_tickets', label: 'Support tickets', min: 0, max: 15, step: 1 },
    { key: 'last_login_days', label: 'Days since last login', min: 0, max: 90, step: 1 },
    { key: 'nps', label: 'NPS', min: 0, max: 10, step: 1 },
    { key: 'tenure_months', label: 'Tenure (months)', min: 0, max: 60, step: 1 },
    { key: 'monthly_spend', label: 'Monthly spend $', min: 0, max: 5000, step: 50 },
  ] as const;

  readonly whatIf = inject(NonNullableFormBuilder).group({
    support_tickets: [3], last_login_days: [10], nps: [7], tenure_months: [12], monthly_spend: [400],
    segment: ['SMB'], plan: ['basic'],
  });

  /** Live inference: debounce slider noise, cancel stale requests with switchMap. */
  readonly prediction = toSignal(
    this.whatIf.valueChanges.pipe(
      startWith(this.whatIf.getRawValue()),
      debounceTime(150),
      switchMap(() => this.api.predict(this.whatIf.getRawValue()).pipe(catchError(() => of(undefined)))),
    ),
  );

  cvScores = (o: Record<string, number>) => Object.entries(o);
  modelName = (m: string) => ({ logistic_regression: 'Logistic Regression', random_forest: 'Random Forest' })[m] ?? m;

  train() {
    this.training.set(true);
    this.api.train().subscribe({
      next: (t) => this.task.set(t),
      complete: () => {
        this.training.set(false);
        this.model.reload();
        this.toast.success(this.i18n.t('ml.trained'));
      },
      error: () => this.training.set(false),
    });
  }
}
