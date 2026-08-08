# Internal design system (cashier + director)

Public awwwards site is unchanged.

## Goal

Professional, readable, fast internal UI — not decorative dashboards.

## Tokens

`src/styles/internal-tokens.css` + component styles in `src/styles/internal.css`

| Token | Role |
|---|---|
| `--internal-bg` | Page background |
| `--internal-surface` | Cards / panels |
| `--internal-border` | Light borders |
| `--internal-text` / `--internal-text-secondary` | Typography |
| `--internal-green` / `--internal-orange` | Brand actions |
| `--internal-success` / `--internal-warning` / `--internal-danger` | Status |
| `--internal-chart-1..5` | Chart palette |
| `--internal-radius` (16) / `--internal-tap` (44) | Geometry |

Director (`--dir-*`) and cashier (`--ink`, `--green-*`) variables alias to the same tokens.

## Shared components

`src/components/internal/`

- `PageHeader` — title 28–34px, short description, actions
- `KpiCard` — value + real comparison delta (or «Нет данных» / «Новый показатель»)
- `ChartCard` — loading skeleton / empty / chart body
- `StatusBadge` — success / warning / danger / neutral
- `EmptyState`, `ErrorAlert`, `LoadingSkeleton`
- `ConfirmDialog`

Import via `@/components/internal`.

## Visual rules

- Light business UI, soft borders, almost no shadow
- Orange = primary CTA; green = positive/primary data
- Red only for refunds/errors
- Tables: sticky header, row ~52px, money right-aligned + tabular nums
- Tap targets ≥ 44px
- `prefers-reduced-motion` disables shimmer and transitions
- Charts: no 3D, limited palette, animations off for speed

## Data integrity

No static charts, fake growth %, or demo numbers.  
KPI comparisons come from the previous comparable period calculated on the server from PAID orders.
