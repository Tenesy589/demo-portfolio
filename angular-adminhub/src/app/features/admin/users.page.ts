import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { UsersApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { Role } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-users',
  imports: [TranslatePipe],
  template: `
    <div class="page-head"><h1>🔐 {{ 'nav.users' | t }}</h1></div>
    <div class="card table-card">
      <table class="table">
        <thead><tr><th>{{ 'cust.name' | t }}</th><th>Email</th><th>{{ 'users.role' | t }}</th></tr></thead>
        <tbody>
          @for (u of users.value(); track u.id) {
            <tr>
              <td>{{ u.name }}</td>
              <td>{{ u.email }}</td>
              <td>
                <select [value]="u.role" [disabled]="u.id === auth.user()?.id" (change)="setRole(u.id, $any($event.target).value)">
                  @for (r of roles; track r) { <option [value]="r">{{ r }}</option> }
                </select>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class UsersPage {
  private readonly api = inject(UsersApi);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  readonly auth = inject(AuthService);
  readonly roles: Role[] = ['viewer', 'manager', 'admin'];
  readonly users = rxResource({ stream: () => this.api.list() });

  setRole(id: number, role: Role) {
    this.api.setRole(id, role).subscribe(() => {
      this.toast.success(this.i18n.t('users.updated'));
      this.users.reload();
    });
  }
}
