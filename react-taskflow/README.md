# TaskFlow: real-time Kanban (React)

React's strength is complex, highly interactive UI driven by state. This app is the frontend for **LiveBoard**.

```bash
docker compose up -d --build     # → http://localhost:7102  (demo@liveboard.dev / demo1234)
```

This compose file *includes* the whole Node backend stack.

## What's inside

| Feature | Where |
|---|---|
| **Drag & drop** across columns (dnd-kit), keyboard-accessible, `DragOverlay` | `pages/BoardPage.tsx` |
| **Optimistic updates** with rollback, reusable `useOptimisticBoard` hook | `hooks/queries.ts` |
| **Real-time sync**: WebSocket events go through a *pure, idempotent reducer* into the React Query cache (no second store for server state) | `lib/board-cache.ts`, `hooks/useBoardRealtime.ts` |
| **Presence avatars** and a live "Alice is editing…" indicator | |
| **Conflict handling**: on a 409 from the server, the user sees a toast and gets the latest version | |
| Client mirror of the server's fractional indexing, so a dropped card lands exactly where it was dropped | `positionAt` |
| Route-level code splitting (`lazy` + `Suspense`), manual vendor chunks | `App.tsx`, `vite.config.ts` |
| Zustand (persisted auth and theme), dark mode with no flash, toasts, `memo` for drag performance | `store/` |
| CSV export download, live activity feed, connection status showing which backend replica you're on | |

nginx serves the SPA and proxies `/api` and `/socket.io` on the same origin, so CORS isn't needed. Hashed assets are cached as immutable.

**Stack:** React 19 · TypeScript · Vite 6 · TanStack Query 5 · Zustand · dnd-kit · Socket.IO client · Tailwind CSS 4
