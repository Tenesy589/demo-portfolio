import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login.page'), title: 'AdminHub · Login' },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.page'), title: 'AdminHub · Dashboard' },
      { path: 'customers', loadChildren: () => import('./features/customers/customers.routes'), title: 'AdminHub · Customers' },
      { path: 'ml', loadComponent: () => import('./features/ml/ml.page'), title: 'AdminHub · Churn AI' },
      { path: 'admin/users', canMatch: [roleGuard('admin')], loadComponent: () => import('./features/admin/users.page'), title: 'AdminHub · Users' },
    ],
  },
  { path: '**', redirectTo: '' },
];
