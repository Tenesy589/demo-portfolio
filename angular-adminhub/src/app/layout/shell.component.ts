import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { I18nService, TranslatePipe } from '../core/i18n.service';
import { ToastService } from '../core/toast.service';
import { HasRoleDirective } from '../shared/has-role.directive';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, HasRoleDirective],
  template: `
    <div class="shell" [class.nav-open]="navOpen()">
      <aside class="sidebar">
        <div class="brand"><span class="logo">◆</span> AdminHub</div>
        <nav (click)="navOpen.set(false)">
          <a routerLink="/dashboard" routerLinkActive="active">📊 {{ 'nav.dashboard' | t }}</a>
          <a routerLink="/customers" routerLinkActive="active">👥 {{ 'nav.customers' | t }}</a>
          <a routerLink="/ml" routerLinkActive="active">🧠 {{ 'nav.ml' | t }}</a>
          <a *appHasRole="'admin'" routerLink="/admin/users" routerLinkActive="active">🔐 {{ 'nav.users' | t }}</a>
        </nav>
        <div class="me">
          <div>
            <strong>{{ auth.user()?.name }}</strong>
            <span class="badge role">{{ 'role.' + auth.user()?.role | t }}</span>
          </div>
          <button class="btn ghost sm" (click)="auth.logout()">{{ 'nav.logout' | t }}</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="btn ghost burger" (click)="navOpen.set(!navOpen())" aria-label="Menu">☰</button>
          <span class="brand mobile-only"><span class="logo">◆</span> AdminHub</span>
          <span class="spacer"></span>
          <div class="seg">
            @for (l of i18n.langs; track l) {
              <button type="button" [class.on]="i18n.lang() === l" (click)="i18n.setLang(l)">{{ l === 'uk' ? 'UA' : l.toUpperCase() }}</button>
            }
          </div>
          <button class="btn ghost" (click)="toggleTheme()" aria-label="Theme">{{ dark() ? '☀️' : '🌙' }}</button>
        </header>
        <main class="content"><router-outlet /></main>
      </div>
    </div>
    <div class="toasts">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="t.kind" (click)="toast.dismiss(t.id)">{{ t.text }}</div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  readonly i18n = inject(I18nService);
  readonly toast = inject(ToastService);
  readonly navOpen = signal(false);
  readonly dark = signal(document.documentElement.classList.contains('dark'));

  toggleTheme() {
    this.dark.update((d) => !d);
    document.documentElement.classList.toggle('dark', this.dark());
    localStorage.setItem('adminhub.theme', this.dark() ? 'dark' : 'light');
  }
}
