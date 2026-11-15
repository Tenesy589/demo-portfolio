import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { TranslatePipe } from '../core/i18n.service';

@Component({
  selector: 'app-kpi',
  template: `
    <div class="card kpi">
      <span class="muted">{{ label() }}</span>
      <strong>{{ value() }}</strong>
      @if (delta() !== null && delta() !== undefined) {
        <span class="delta" [class.up]="delta()! >= 0">{{ delta()! >= 0 ? '▲' : '▼' }} {{ delta() }}%</span>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpiComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number | null>();
  readonly delta = input<number | null>();
}

@Component({
  selector: 'app-risk',
  template: `<span class="badge" [class]="'risk-' + risk()">{{ (probability() * 100).toFixed(0) }}% · {{ risk() }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RiskBadgeComponent {
  readonly risk = input.required<'low' | 'medium' | 'high'>();
  readonly probability = input.required<number>();
}

/** Shows the first validation error of a control, translated. */
@Component({
  selector: 'app-field-error',
  imports: [TranslatePipe],
  template: `
    @if (control().invalid && (control().touched || control().dirty)) {
      <small class="error">{{ 'form.' + firstError() | t }}</small>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Default,
})
export class FieldErrorComponent {
  readonly control = input.required<AbstractControl>();
  firstError = () => Object.keys(this.control().errors ?? {})[0] ?? '';
}
