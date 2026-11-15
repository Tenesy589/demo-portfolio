import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { I18nService } from './i18n.service';
import { Role } from './models';

export const authGuard: CanActivateFn = () => inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/login']);

/** canMatch: the lazy chunk for a forbidden route is never even downloaded. */
export const roleGuard =
  (role: Role): CanMatchFn =>
  () =>
    inject(AuthService).hasRole(role) || inject(Router).createUrlTree(['/dashboard']);

export interface HasUnsavedChanges { hasUnsavedChanges(): boolean }

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (cmp) =>
  !cmp.hasUnsavedChanges() || confirm(inject(I18nService).t('form.unsaved'));
