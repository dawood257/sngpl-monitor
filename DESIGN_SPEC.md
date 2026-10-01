# SNGLP Monitor — Design Specification

> A high-density operations dashboard that stays readable in low-light control rooms and outdoors on mobile, with AA-contrast status cues that never rely on color alone.

## 1. Assumptions
- **Purpose:** Operations team monitors 8+ heterogeneous servers (RHEL + AIX) hosting Oracle EBS, WebLogic, ORDS, APEX.
- **Top tasks:** Spot failing server, triage incident, audit SSH sessions.
- **Platforms:** Desktop web (≥1280px), tablet, Android/iOS mobile (PWA + WebView).
- **Brand:** Near-black navy canvas, thin borders, small-caps labels, neon status accents. SNGPL green reserved for brand mark only.
- **Constraints:** FastAPI + vanilla JS; tokens delivered as CSS variables.

## 2. Reference Analysis — Keep / Change / Add

| Aspect | Reference | Decision | Rationale |
|--------|-----------|----------|-----------|
| Dark navy canvas | ✅ | Keep | Reduces eye strain in 24/7 ops. |
| Card grid density | ✅ | Keep | High density is a feature for ops. |
| KPI sparkline tiles | ✅ | Keep, add threshold glow | Quick trend read. |
| Semicircle gauges | ✅ | Keep, add text value + zone | Visual + numeric, colorblind-safe. |
| Priority table | ✅ | Keep, add icon + text badge | Color-only cue fails WCAG 1.4.1. |
| Progress-bar list | ✅ | Keep | Space-efficient resource read. |
| Icon-only sidebar | ⚠️ | Change | Add labels + tooltips; 44px targets. |
| Text size/contrast | ❌ | Change | 11px → 12px min, 4.5:1 body. |
| Color-only status | ❌ | Change | Add shape + icon + text. |
| Red/green series | ❌ | Change | Colorblind-safe palette + line styles. |
| Light theme | ❌ | Add | Daytime / outdoor use. |
| Mobile layout | ❌ | Add | Bottom tabs + card reflow. |
| Settings experience | ❌ | Add | Unified page / list→detail. |
| Empty/error/loading | ❌ | Add | Skeleton, empty, error, alert. |

## 3. Responsive Behavior

| Breakpoint | Grid | Sidebar | Topbar | Tables | Gauges | KPI cluster |
|------------|------|---------|--------|--------|--------|-------------|
| Mobile `<640px` | 1 col, 16px gutters | Bottom tab bar 64px | 56px; back + ⋯ | Card list | 3 mini arcs 72px | Horizontal scroll, snap |
| Tablet `640–1023px` | 2 col, 20px gutters | Collapsed 72px | 64px; overflow | Compress, hide Date | 3 arcs 96px | 2×2 grid |
| Desktop `1024–1439px` | 3 col, 24px gutters | Expanded 240px | 64px; all actions | Full table | 3 arcs 120px | 2×2 grid |
| Wide `≥1440px` | 3 col, max 1440px | Same | Same | Same | Same | Same |

## 4. Design Tokens

### 4.1 Dark Theme
| Role | Token | Hex | Contrast |
|------|-------|-----|----------|
| Canvas | `--bg-canvas` | `#0A0F1C` | — |
| Surface | `--bg-surface` | `#111827` | — |
| Elevated | `--bg-elevated` | `#161F31` | — |
| Hover | `--bg-hover` | `#1E293B` | — |
| Border subtle | `--border-subtle` | `#1F2937` | — |
| Border strong | `--border-strong` | `#334155` | — |
| Text | `--fg-primary` | `#F1F5F9` | 15.1:1 ✅ |
| Text 2 | `--fg-secondary` | `#94A3B8` | 6.4:1 ✅ |
| Text 3 | `--fg-tertiary` | `#64748B` | 4.0:1 ⚠️ (non-essential only) |
| Info | `--accent-blue` | `#60A5FA` | 6.0:1 ✅ |
| OK | `--accent-teal` | `#2DD4BF` | 8.6:1 ✅ |
| Warn | `--accent-yellow` | `#FACC15` | 11.0:1 ✅ |
| Danger | `--accent-rose` | `#FB7185` | 5.5:1 ✅ |
| Success | `--accent-green` | `#4ADE80` | 9.7:1 ✅ |
| Special | `--accent-violet` | `#A78BFA` | 6.1:1 ✅ |

### 4.2 Light Theme
| Role | Token | Hex | Contrast |
|------|-------|-----|----------|
| Canvas | `--bg-canvas` | `#F8FAFC` | — |
| Surface | `--bg-surface` | `#FFFFFF` | — |
| Text | `--fg-primary` | `#0F172A` | 16.9:1 ✅ |
| Text 2 | `--fg-secondary` | `#475569` | 7.5:1 ✅ |
| Info | `--accent-blue` | `#1D4ED8` | 7.1:1 ✅ |
| OK | `--accent-teal` | `#0F766E` | 5.8:1 ✅ |
| Warn | `--accent-yellow` | `#B45309` | 5.4:1 ✅ |
| Danger | `--accent-rose` | `#BE123C` | 7.1:1 ✅ |
| Success | `--accent-green` | `#047857` | 5.9:1 ✅ |

### 4.3 Typography
| Token | Size / Line | Weight | Use |
|-------|-------------|--------|-----|
| display | 32 / 40 | 600 | Big KPI numbers |
| h1 | 24 / 32 | 600 | Page title |
| h2 | 18 / 28 | 600 | Section |
| body | 14 / 22 | 400 | Body |
| label | 12 / 16 `.04em` uppercase | 600 | Section labels, table headers |
| meta | 12 / 16 | 400 | Secondary meta |

**Families:** `Inter` (UI), `JetBrains Mono` (IDs, IPs). Max 2 typefaces.

### 4.4 Spacing (8px base)
`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 80`

### 4.5 Radius
`sm 4px · md 8px · lg 12px · pill 999px`

### 4.6 Density Modes
| Property | Comfortable | Compact |
|----------|-------------|---------|
| Row height | 56px | 40px |
| Card padding | 20px | 12px |
| Card gap | 16px | 8px |
| Button height | 36px | 28px |
| Font body | 14 | 13 |
| Font KPI | 32 | 24 |
| Sidebar width | 240px | 200px |

> **Mobile floor:** never below 44px tap target, even in Compact.

### 4.7 Motion
| Token | Duration | Easing | Use |
|-------|----------|--------|-----|
| fast | 120ms | `cubic-bezier(0.2,0,0,1)` | Hover, focus |
| base | 180ms | same | Modal, theme swap |
| slow | 300ms | `cubic-bezier(0.4,0,0.2,1)` | Chart entry, gauge sweep |
| spring | 400ms | `cubic-bezier(0.34,1.56,0.64,1)` | KPI alert pulse (once) |

**Reduced motion:** All durations → 0.001ms if `prefers-reduced-motion: reduce`.

## 5. Colorblind-Safe Chart Palette
`#0072B2` (blue) · `#009E73` (green) · `#D55E00` (orange-red) · `#CC79A7` (magenta) · `#E69F00` (amber) · `#56B4E9` (sky)

**Pair every series with:** line style (solid/dashed/dotted) + distinct marker (● ▲ ■ ◆).

## 6. Accessibility Checklist
- [ ] AA contrast: body ≥4.5:1, large ≥3:1, chart elements ≥3:1
- [ ] Focus visible on all interactive elements
- [ ] Keyboard path: Tab order follows visual order; Esc closes modals
- [ ] Mobile tap targets ≥44×44px
- [ ] Safe-area insets on iOS (bottom tab bar)
- [ ] Non-color status cues: icon + text + shape (not color alone)
- [ ] `prefers-reduced-motion` respected
- [ ] RTL mirroring: sidebar flips right, progress bars flip, table columns reverse
- [ ] Screen reader: ARIA roles (`role="tablist"`, `aria-current="page"`, `aria-live="polite"` for alerts)

## 7. Microcopy (English → Urdu)

| Key | English | اردو |
|-----|---------|------|
| dashboard.empty | No servers yet | ابھی کوئی سرور نہیں |
| dashboard.error | Could not load data | ڈیٹا لوڈ نہیں ہو سکا |
| incident.none | All systems healthy | تمام سسٹمز بہتر ہیں |
| settings.saved | Preferences saved | ترجیحات محفوظ ہو گئیں |
| theme.dark | Dark | گہرا |
| theme.light | Light | ہلکا |

## 8. Handoff Notes
- **Class prefix:** all new components use `ds-` (design system).
- **Tokens:** never hardcode hex; always use `var(--token)`.
- **Density:** set `html[data-layout="compact|comfortable|wide"]`.
- **Theme:** set `html[data-theme="dark|light"]` — old `.theme-*` classes still supported for backward compat.
- **Focus:** rely on the global `:focus-visible` rule.
- **Grid:** always multiples of 4px; prefer 8px.

## 9. Risks & Open Questions
1. **Chart library choice:** current SVG-based; consider ECharts for large time series (10k+ points).
2. **RTL charts:** axis direction mirroring needs explicit testing (not covered by CSS alone).
3. **Density + mobile:** Comfortable on mobile may feel too sparse; test with ops team.
4. **Colorblind users:** validate chosen palette with simulator on 3 key charts.
5. **Legacy classes:** old `.theme-clean` etc. still referenced in `index.html`; plan migration to `.theme-light`.
6. **Table on mobile:** card list increases scroll length ~3x; consider virtual scrolling if rows >100.

---

*Generated as part of the SNGLP Monitor UX overhaul, Phase 6.*
