# RadioPlan AI — Full UI/UX Redesign Spec

**Date:** 2026-03-23
**Approach:** Design System First (Approach A)
**Style:** Data-Forward Dashboard (plugin: Data-Dense Dashboard + Calendar & Scheduling)
**Worktree:** `.worktrees/redesign` | **Branch:** `feature/redesign`

---

## 1. Goals

- Full visual revamp of RadioPlan AI on both **desktop and mobile**
- Replace dark slate sidebar with a professional light/white design
- Implement true mobile-friendliness (bottom nav, touch targets, responsive layouts)
- Establish a token-based design system for consistency across all pages
- Zero functional changes — only UI/UX changes

---

## 2. Design System — Token Layer

### 2.1 Color Tokens

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#2563EB` | Buttons, active nav, links |
| `--color-primary-hover` | `#1D4ED8` | Hover on primary elements |
| `--color-accent-green` | `#059669` | Présent, available, success |
| `--color-accent-red` | `#DC2626` | Conflicts, absent, destructive |
| `--color-accent-amber` | `#D97706` | Warnings, pending, RCP |
| `--color-bg` | `#F8FAFC` | App background |
| `--color-surface` | `#FFFFFF` | Cards, sidebar, modals |
| `--color-border` | `#E4ECFC` | Card borders, dividers |
| `--color-muted` | `#F1F5FD` | Hover backgrounds, zebra rows |
| `--color-text` | `#0F172A` | Primary text |
| `--color-text-muted` | `#64748B` | Labels, secondary text |

Implemented via `tailwind.config.js` `extend.colors` + CSS custom properties in `src/index.css`.

### 2.2 Typography

| Role | Font | Weight | Size |
|---|---|---|---|
| Headings | Figtree | 600–700 | 18–32px |
| Body | Noto Sans | 400 | 14px |
| Data / labels | Noto Sans | 500 | 12–13px |
| Nav items | Figtree | 500 | 14px |

Loaded via Google Fonts:
```css
@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700&family=Noto+Sans:wght@300;400;500;700&display=swap');
```

### 2.3 Spacing & Layout Tokens

| Token | Value |
|---|---|
| `--grid-gap` | `8px` |
| `--card-padding-dense` | `12px` |
| `--card-padding` | `16px` |
| `--sidebar-width` | `240px` |
| `--sidebar-collapsed-width` | `64px` |
| `--header-height` | `56px` |
| `--bottom-nav-height` | `64px` |
| `--table-row-height` | `36px` |

### 2.4 Breakpoints

| Name | Width | Layout |
|---|---|---|
| Mobile | `< 768px` | Bottom nav, no sidebar, stacked |
| Tablet | `768px–1023px` | Icon-only collapsed sidebar (64px) |
| Desktop | `≥ 1024px` | Full sidebar (240px) |

### 2.5 Z-Index Scale

| Layer | Value |
|---|---|
| Base content | `0` |
| Sticky headers / columns | `10` |
| Sidebar (tablet) | `20` |
| Top bar (mobile) | `30` |
| Bottom nav (mobile) | `40` |
| Modals / sheets | `50` |
| Toasts / notifications | `60` |

---

## 3. Navigation & Shell

### 3.1 Desktop Sidebar (≥1024px)

- Background: `#FFFFFF`, `border-right: 1px solid #E4ECFC`, fixed full height
- Width: `240px`
- **Header (56px):** "RadioPlan AI" in Figtree 700 + `#2563EB` + subtitle "Oncologie & Radiothérapie" in 11px muted. NotificationBell right-aligned.
- **Nav items (44px height):** Lucide icon 20px + label, default `#64748B`, active: left `3px solid #2563EB` border + `bg-[#F1F5FD]` + text `#2563EB`
- **Admin section:** `#E4ECFC` divider + "ADMINISTRATION" label 11px uppercase muted, then admin nav items
- **Footer:** User avatar (32px circle) + name + role, logout button separated below (ghost variant, `#DC2626` text on hover)
- Hover on nav items: `bg-[#F1F5FD]`, transition `150ms ease-out`

### 3.2 Tablet Sidebar (768px–1023px)

- Width: `64px` (icons only)
- Tooltip on hover shows label (satisfies `nav-label-icon` rule)
- Same active state (left blue bar)
- Logo collapses to initials "RP"

### 3.3 Mobile Bottom Tab Bar (<768px)

5 tabs maximum (plugin rule: `bottom-nav-limit`):

| # | Icon | Label | Route |
|---|---|---|---|
| 1 | LayoutDashboard | Tableau de bord | `/` |
| 2 | CalendarDays | Planning | `/planning` |
| 3 | LayoutGrid | Mon Planning | `/mon-planning` |
| 4 | Activity | Activités | `/activities` |
| 5 | UserCircle | Profil | `/profile` |

- Height: `64px` + `env(safe-area-inset-bottom)` padding
- Background: `#FFFFFF`, `border-top: 1px solid #E4ECFC`
- Active: icon + label `#2563EB`; inactive: `#94A3B8`
- Admin routes (Équipe, Rôles, Données) accessible via Profil tab collapsible section

### 3.4 Mobile Top Bar (<768px)

- Height: `56px`, `#FFFFFF`, `border-bottom: 1px solid #E4ECFC`
- Center: page title (Figtree 600, 16px)
- Right: NotificationBell
- No hamburger — sidebar is replaced by bottom nav on mobile

---

## 4. Component Library

### 4.1 Card

```
bg-white | border: 1px solid #E4ECFC | border-radius: 8px
shadow: 0 1px 3px rgba(0,0,0,0.06)
padding: 12px (dense) | 16px (standard)
hover (interactive): shadow 0 4px 12px rgba(37,99,235,0.08) | transition 150ms ease-out
```

### 4.2 StatCard

- Icon block: `40×40px`, `border-radius: 8px`, tinted background matching color
- Value: Figtree 700, 28px, `#0F172A`
- Label: Noto Sans 400, 13px, `#64748B`
- Optional trend badge: `+N` in green/red, 12px, pill shape

### 4.3 Buttons

| Variant | Background | Text | Hover |
|---|---|---|---|
| Primary | `#2563EB` | white | `#1D4ED8` |
| Secondary | `#F1F5FD` | `#2563EB` | `#E4ECFC` |
| Destructive | `#DC2626` | white | `#B91C1C` |
| Ghost | transparent | `#64748B` | `#F1F5FD` bg |

- All: `border-radius: 6px`, `min-height: 44px` (mobile touch target), `transition: 150ms ease-out`, `cursor-pointer`
- Loading: spinner replaces label, `disabled` attribute set

### 4.4 Status Badges

| Status | Background | Text |
|---|---|---|
| PRÉSENT / Success | `#F0FDF4` | `#059669` |
| ABSENT / Conflict | `#FEF2F2` | `#DC2626` |
| Pending / RCP | `#FFFBEB` | `#D97706` |
| Consultation | `#EFF6FF` | `#2563EB` |
| Machine / Activity | `#F1F5F9` | `#475569` |

- `border-radius: 4px`, `padding: 2px 8px`, Noto Sans 500 12px

### 4.5 DoctorBadge

- 24×24px circle, existing hex color per doctor, initials in white 11px
- On grids: overlapping stack with `−6px` margin

### 4.6 Data Tables

- Header: `bg-[#F8FAFC]`, Noto Sans 500 12px uppercase `#64748B`, `sticky top-0`, `z-index: 10`
- Row height: `36px`
- Zebra: odd `#FFFFFF`, even `#F8FAFC`
- Row hover: `bg-[#F1F5FD]`, `transition: 100ms`
- Mobile: `overflow-x-auto` wrapper, sticky first column

### 4.7 Modals & Bottom Sheets

**Desktop modal:**
- Backdrop: `rgba(0,0,0,0.4)` + `backdrop-filter: blur(2px)`
- Container: `bg-white`, `border-radius: 12px`, max-width `540px`, centered
- Header: title Figtree 600 16px + `×` close button (44×44px)
- Enter animation: `scale(0.97)→scale(1)` + `opacity 0→1`, `200ms ease-out`

**Mobile bottom sheet:**
- Slides up from bottom, full width, `border-radius: 16px 16px 0 0`
- Drag handle bar (32×4px, `#CBD5E1`, centered top)
- Swipe-down to dismiss
- Enter animation: `translateY(100%)→translateY(0)`, `300ms ease-out`

---

## 5. Page Layouts

### 5.1 Dashboard

**Desktop:**
- Top: 4 StatCards in a row (12-col grid, each 3 cols)
- Middle: Weekly schedule card (full width), day tabs + grid/list toggle
- Bottom: 2-col — Conflicts list (left, 7 cols) + RCP summary (right, 5 cols)

**Mobile:**
- StatCards: 2×2 grid
- Weekly schedule: day selector tabs + vertical slot list for selected day
- Conflicts: accordion cards, expandable

### 5.2 Planning Global

**Desktop:** Full-width grid, doctors as rows × days/periods as columns. Sticky header + sticky first column. Week navigator top-right. Validated week badge.

**Mobile:** Same grid structure, dual-axis scroll (`overflow-x: auto` + `overflow-y: auto`). Sticky first column (doctor names, 80px). Sticky header row (44px). Min column width `72px`. Row height `44px`. `touch-action: pan-x pan-y`.

### 5.3 Mon Planning

**Desktop:** Single-doctor week grid + PersonalAgendaWeek/Month tabs below.

**Mobile (agenda/timeline view):**
- Week selector at top (prev/next arrows + week label)
- Chronological list grouped by day (day header + slots as cards)
- Each slot card: time range + type badge + details
- Swipe left on card → reveal details action

### 5.4 Activities

**Desktop:** 2-column — definitions list (left, 320px) + detail/edit panel (right)

**Mobile:** List view → tap opens bottom sheet with detail/edit

### 5.5 Profile

**Desktop:** 2-column — personal info card (left) + agenda tabs (right)

**Mobile:** Stacked — info card → agenda → "Administration" collapsible section (admin users only) with links to Équipe, Rôles, Données

### 5.6 Configuration (Règles & Postes)

**Desktop + Mobile:** Tabbed layout — Postes | Règles | Absences | Paramètres. Mobile: horizontally scrollable tab bar.

### 5.7 DataAdministration, TeamManagement, RoleManagement

**Desktop:** Filter bar + sortable table + action buttons

**Mobile:** Cards instead of table rows (key fields visible, tap to expand full detail + actions)

### 5.8 Login

**Desktop:** Centered card (480px) on `#F8FAFC`, logo top, email/password form, primary button

**Mobile:** Full-screen, form centered vertically, input height `48px`

---

## 6. Accessibility & Performance Checklist (plugin rules)

- [ ] All touch targets ≥44×44px
- [ ] Color contrast ≥4.5:1 for all text (WCAG AA)
- [ ] No color as sole indicator — all statuses have icon + text badge
- [ ] Focus rings visible (2px solid `#2563EB` + 2px offset)
- [ ] `prefers-reduced-motion` respected — animations disabled when set
- [ ] `viewport` meta: `width=device-width, initial-scale=1` (no zoom disable)
- [ ] All animations: `150–300ms`, `ease-out` enter / `ease-in` exit
- [ ] `overflow-x: hidden` on body to prevent horizontal scroll leaks
- [ ] Safe area insets on mobile: `env(safe-area-inset-bottom)` for bottom nav
- [ ] Sticky columns/headers use `position: sticky` + `z-index` scale
- [ ] No emojis as icons — Lucide SVG only
- [ ] `cursor-pointer` on all interactive elements

---

## 7. Implementation Order (Approach A)

1. **Token layer** — `tailwind.config.js` + `src/index.css` CSS variables + Google Fonts
2. **Shell** — `Sidebar.tsx` (desktop + tablet) + `BottomNav.tsx` (new, mobile) + `TopBar.tsx` (new, mobile) + `App.tsx` layout wiring
3. **Base components** — `StatCard.tsx`, `DoctorBadge.tsx`, Button classes, Badge classes, Card classes, Modal/Sheet pattern
4. **Dashboard** — `Dashboard.tsx`
5. **Planning Global** — `Planning.tsx` (responsive grid)
6. **Mon Planning** — `MonPlanning.tsx` (agenda view on mobile)
7. **Activities** — `Activities.tsx`
8. **Profile** — `Profile.tsx` (with admin collapsible)
9. **Configuration** — `Configuration.tsx`
10. **Admin pages** — `TeamManagement.tsx`, `RoleManagement.tsx`, `DataAdministration.tsx`
11. **Login** — `Login.tsx`
12. **Global CSS cleanup** — remove/replace `mobile.css`, purge dark slate classes

---

## 8. Out of Scope

- No functional/logic changes
- No database schema changes
- No new features
- Dark mode (not in scope for this iteration)
