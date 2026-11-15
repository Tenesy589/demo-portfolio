import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { Role, Session, User } from './models';

const KEY = 'adminhub.session';
const RANK: Record<Role, number> = { viewer: 0, manager: 1, admin: 2 };

/** Session state as signals: any component reading `user()` updates automatically. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<Session | null>(this.restore());

  readonly user = computed<User | null>(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.access_token ?? null);
  readonly isLoggedIn = computed(() => !!this.session());

  login(email: string, password: string) {
    return this.http.post<Session>('/api/auth/login', { email, password }).pipe(
      tap((s) => {
        localStorage.setItem(KEY, JSON.stringify(s));
        this.session.set(s);
      }),
    );
  }

  logout() {
    localStorage.removeItem(KEY);
    this.session.set(null);
    this.router.navigate(['/login']);
  }

  /** Hierarchical RBAC — mirrors the backend: admin ⊃ manager ⊃ viewer. */
  hasRole(min: Role): boolean {
    const u = this.user();
    return !!u && RANK[u.role] >= RANK[min];
  }

  private restore(): Session | null {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null;
      if (!s) return null;
      const { exp } = JSON.parse(atob(s.access_token.split('.')[1]));
      return exp * 1000 > Date.now() ? s : null;
    } catch {
      return null;
    }
  }
}
