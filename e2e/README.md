# Browser checks (Playwright)

Run against the local platform (`make up`) or production. Each script prints `OK`/`FAIL` lines.

| Script | What it checks |
|---|---|
| `walk.mjs <outDir> <host> <proto>` | Visits every page of every app on desktop (1440) and phone (390) widths, saves full-page screenshots, reports console errors / HTTP ≥400 |
| `dnd.mjs <taskflow url>` | Drag & drop: across columns, within a column, onto empty space; no modal after drag; order survives reload |
| `selects.mjs <admin url> <taskflow url>` | Every `<select>` displays the value stored in the database (roles, URL filters, edit form, ML, card modal) |
| `crud.mjs <taskflow url>` | Rename board/column, delete card/column/board (two-click confirm), second tab leaves a deleted board |

`dnd.mjs` and `crud.mjs` assume the seeded LiveBoard demo data — reset it when cards have been moved around.
