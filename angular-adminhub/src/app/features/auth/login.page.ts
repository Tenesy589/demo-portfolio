import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { I18nService, TranslatePipe } from '../../core/i18n.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, TranslatePipe],
  template: `
    <div class="login-wrap">
      <form class="card login" [formGroup]="form" (ngSubmit)="submit()">
        <div class="brand big"><span class="logo">◆</span> AdminHub</div>
        <h1>{{ 'login.title' | t }}</h1>
        <label>{{ 'login.email' | t }}<input type="email" formControlName="email" autocomplete="username" /></label>
        <label>{{ 'login.password' | t }}<input type="password" formControlName="password" autocomplete="current-password" /></label>
        @if (error()) { <p class="error">{{ 'login.invalid' | t }}</p> }
        <button class="btn primary" [disabled]="form.invalid || loading()">{{ loading() ? '…' : ('login.submit' | t) }}</button>
        <div class="demo-users">
          @for (u of demoUsers; track u.email) {
            <button type="button" class="chip" (click)="fill(u.email, u.password)">{{ u.role }}</button>
          }
        </div>
        <div class="seg center">
          <button type="button" [class.on]="i18n.lang() === 'uk'" (click)="i18n.setLang('uk')">UA</button>
          <button type="button" [class.on]="i18n.lang() === 'en'" (click)="i18n.setLang('en')">EN</button>
        </div>
      </form>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly i18n = inject(I18nService);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly demoUsers = [
    { role: 'admin', email: 'admin@insight.dev', password: 'admin1234' },
    { role: 'manager', email: 'manager@insight.dev', password: 'manager1234' },
    { role: 'viewer', email: 'viewer@insight.dev', password: 'viewer1234' },
  ];

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['admin@insight.dev', [Validators.required, Validators.email]],
    password: ['admin1234', [Validators.required, Validators.minLength(6)]],
  });

  fill(email: string, password: string) {
    this.form.setValue({ email, password });
  }

  submit() {
    this.loading.set(true);
    this.error.set(false);
    const { email, password } = this.form.getRawValue();
    this.auth
      .login(email, password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({ next: () => this.router.navigate(['/dashboard']), error: () => this.error.set(true) });
  }
}
