# Internal design system (cashier + director)

Public awwwards site is unchanged.

## Tokens

`src/styles/internal-tokens.css`

- surfaces: `--internal-bg`, `--internal-surface`, `--internal-elevated`
- text: `--internal-text`, `--internal-text-secondary`
- brand: `--internal-green`, `--internal-green-soft`, `--internal-orange`
- status: `--internal-success`, `--internal-warning`, `--internal-danger`
- chart palette: `--internal-chart-1..5`
- radius 16px, soft shadow, Manrope/existing brand font

## Shared pieces

- KPI card / chart card (`src/components/internal/*`)
- Director sidebar + mobile drawer
- Cashier bottom nav (safe-area aware)
- Filter bar, tables, heatmap CSS grid

## Visual rules

- Light business UI, green/orange accents
- Red only for refunds/errors
- No glassmorphism / neon / heavy gradients
- Tap targets ≥ 44px
- `prefers-reduced-motion` respected for shimmer/sidebar transitions
