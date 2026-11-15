import { Routes } from '@angular/router';
import { roleGuard, unsavedChangesGuard } from '../../core/guards';

/** Lazy-loaded feature: this whole file and its pages ship as a separate chunk. */
export default [
  { path: '', loadComponent: () => import('./customer-list.page') },
  { path: 'new', canMatch: [roleGuard('manager')], canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./customer-form.page') },
  { path: ':id', loadComponent: () => import('./customer-detail.page') },
  { path: ':id/edit', canMatch: [roleGuard('manager')], canDeactivate: [unsavedChangesGuard], loadComponent: () => import('./customer-form.page') },
] satisfies Routes;
