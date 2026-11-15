# AdminHub: enterprise CRM admin panel (Angular)

Angular is designed for large, structured business applications: DI, strict typing, forms, routing and guards included. This app is the frontend for **InsightAPI**.

```bash
docker compose up -d --build     # → http://localhost:7104  (one-click login as admin / manager / viewer)
```

## What's inside

| Feature | Where |
|---|---|
| **Zoneless change detection**: no zone.js, driven entirely by **Signals** | `app.config.ts` |
| **RxJS**: debounced search, `switchMap` request cancellation, URL as the single source of truth for filters | `customer-list.page.ts` |
| **Task polling stream**: `timer` + `switchMap` + `takeWhile(inclusive)` for the ML training progress bar | `core/api.ts → MlApi.train` |
| **Live what-if inference**: slider `valueChanges` → debounce → `switchMap` → prediction | `ml.page.ts` |
| **Strictly typed reactive forms**: `FormArray` of contacts, **cross-field** and **array-level** custom validators | `customer-form.page.ts` |
| **RBAC**: `canMatch` role guards (forbidden chunks are never downloaded), `*appHasRole` structural directive | `core/guards.ts`, `shared/has-role.directive.ts` |
| `canDeactivate` unsaved-changes guard | |
| Functional HTTP **interceptors**: auth header and centralised error handling | `core/interceptors.ts` |
| **Runtime i18n** UA/EN on signals, switched with no reload | `core/i18n.service.ts` |
| `rxResource`, `input()` route binding (`withComponentInputBinding`), `@if/@for` control flow, lazy routes, preloading | |
| Dashboard: KPIs, revenue with forecast band, doughnut and bar charts, **cohort heatmap**, at-risk customers | `dashboard.page.ts` |

Initial bundle ≈ 87 kB gzipped; Chart.js is lazy-loaded with the dashboard.

**Stack:** Angular 20 · Signals · RxJS 7 · Reactive Forms · Chart.js · SCSS design tokens (dark mode)
