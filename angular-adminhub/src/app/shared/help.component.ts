import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18nService, TranslatePipe } from '../core/i18n.service';

/** Dismissible "how to use" box; its text is one translation key, one line per bullet. */
@Component({
  selector: 'app-help',
  imports: [TranslatePipe],
  template: `
    @if (open()) {
      <section class="help-box">
        <button type="button" class="help-close" (click)="setOpen(false)">{{ 'help.hide' | t }}</button>
        <strong>{{ 'help.title' | t }}</strong>
        <ul>
          @for (line of lines(); track $index) { <li>{{ line }}</li> }
        </ul>
      </section>
    } @else {
      <button type="button" class="help-link" (click)="setOpen(true)">{{ 'help.show' | t }}</button>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpComponent {
  readonly key = input.required<string>();
  private readonly i18n = inject(I18nService);
  readonly lines = computed(() => this.i18n.t(this.key()).split('\n'));
  readonly open = signal(true);

  ngOnInit() {
    try { this.open.set(localStorage.getItem('adminhub.help.' + this.key()) !== '0'); } catch { /* private mode */ }
  }

  setOpen(value: boolean) {
    this.open.set(value);
    try { localStorage.setItem('adminhub.help.' + this.key(), value ? '1' : '0'); } catch { /* private mode */ }
  }
}
