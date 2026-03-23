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
| `--color-muted` | `#F1F5FD` | Hover backgrounds, zebra even rows |
| `--color-text` | `#0F172A` | Primary text |
| `--color-text-muted` | `#64748B` | Labels, secondary text |

Implemented via `tailwind.config.js` `extend.colors` + CSS custom properties in `src/index.css`.
**All component code must reference token names, not raw hex values.**

### 2.2 Typography

| Role | Font | Weight | Size |
|---|---|---|---|
| Headings | Figtree | 600–700 | 18–32px |
| Body | Noto Sans | 400 | 14px |
| Data / labels | Noto Sans | 500 | 12–13px |
| Nav items | Figtree | 500 | 14px |

Loaded via `<link rel="preconnect">` + `<link rel="stylesheet">` in `index.html` `<head>` (not `@import` — avoids render-blocking):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700&family=Noto+Sans:wght@300;400;500;700&display=swap" rel="stylesheet">
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

**Note:** Planning Global grid intentionally overrides `--table-row-height` to `44px` on all breakpoints to satisfy touch target requirements. This is a component-level override, not a token change.

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

- Background: `var(--color-surface)`, `border-right: 1px solid var(--color-border)`, fixed full height
- Width: `240px`
- **Header (56px):** "RadioPlan AI" in Figtree 700 + `var(--color-primary)` + subtitle "Oncologie & Radiothérapie" 11px muted. NotificationBell right-aligned (see Section 4.8).
- **Nav items (44px height):** Lucide icon 20px (`aria-hidden="true"`) + text label, default `var(--color-text-muted)`, active: `border-left: 3px solid var(--color-primary)` + `bg-[var(--color-muted)]` + text `var(--color-primary)`, `aria-current="page"` on active link
- **Admin section:** `var(--color-border)` divider + "ADMINISTRATION" label 11px uppercase muted, then admin nav items
- **Footer:** User avatar (32px circle) + name + role. Logout button visually separated (ghost variant, hover text `var(--color-accent-red)`). `aria-label="Se déconnecter"` on logout button.
- Hover on nav items: `bg-[var(--color-muted)]`, `transition: 150ms ease-out`

### 3.2 Tablet Sidebar (768px–1023px)

- Width: `64px` (icons only)
- Each nav item: `aria-label="[Page name]"` on the anchor, `title` attribute for native tooltip
- Same active state (left blue bar)
- Logo collapses to initials "RP"
- **NotificationBell ownership:** On tablet, bell stays in sidebar header (same as desktop).

### 3.3 Mobile Bottom Tab Bar (<768px)

5 tabs maximum (plugin rule: `bottom-nav-limit`):

| # | Icon | Label | Route |
|---|---|---|---|
| 1 | LayoutDashboard | Tableau de bord | `/` |
| 2 | CalendarDays | Planning | `/planning` |
| 3 | LayoutGrid | Mon Planning | `/mon-planning` |
| 4 | Activity | Activités | `/activities` |
| 5 | UserCircle | Profil | `/profile` |

- Height: `64px` + `padding-bottom: env(safe-area-inset-bottom)`
- Background: `var(--color-surface)`, `border-top: 1px solid var(--color-border)`
- Active: icon + label `var(--color-primary)`; inactive: `#94A3B8`
- Each tab: `aria-label="[Label]"`, active tab: `aria-current="page"`
- Admin routes accessible via Profil tab collapsible section (see Section 5.5)

### 3.4 Mobile Top Bar (<768px)

- Height: `56px`, `var(--color-surface)`, `border-bottom: 1px solid var(--color-border)`, `position: sticky`, `top: 0`, `z-index: 30`
- Center: page title (Figtree 600, 16px, `var(--color-text)`)
- Right: **NotificationBell** (mobile owner — sidebar is absent on mobile)
- No hamburger — sidebar replaced by bottom nav on mobile
- **NotificationBell ownership rule:** Desktop/tablet → sidebar header. Mobile → top bar. `NotificationBell.tsx` is rendered once in `App.tsx` and positioned via context/portal, OR rendered in both locations with CSS `hidden/flex` based on breakpoint.

---

## 4. Component Library

### 4.1 Card

```
background: var(--color-surface)
border: 1px solid var(--color-border)
border-radius: 8px
box-shadow: 0 1px 3px rgba(0,0,0,0.06)
padding: var(--card-padding-dense) [dense] | var(--card-padding) [standard]
```
Interactive card hover: `box-shadow: 0 4px 12px rgba(37,99,235,0.08)`, `transition: 150ms ease-out`

### 4.2 StatCard

- Icon block: `40×40px`, `border-radius: 8px`, tinted background matching semantic color
- Value: Figtree 700, 28px, `var(--color-text)`
- Label: Noto Sans 400, 13px, `var(--color-text-muted)`
- Optional trend badge: `+N` in green/red, 12px pill

### 4.3 Buttons

| Variant | Background | Text | Hover |
|---|---|---|---|
| Primary | `var(--color-primary)` | white | `var(--color-primary-hover)` |
| Secondary | `var(--color-muted)` | `var(--color-primary)` | `var(--color-border)` |
| Destructive | `var(--color-accent-red)` | white | `#B91C1C` |
| Ghost | transparent | `var(--color-text-muted)` | `var(--color-muted)` bg |

- All: `border-radius: 6px`, `min-height: 44px`, `transition: 150ms ease-out`, `cursor-pointer`
- Loading state: spinner replaces label, `disabled` attribute set
- Disabled: `opacity: 0.5`, `cursor: not-allowed`

### 4.4 Status Badges

| Status | Background | Text |
|---|---|---|
| PRÉSENT / Success | `#F0FDF4` | `var(--color-accent-green)` |
| ABSENT / Conflict | `#FEF2F2` | `var(--color-accent-red)` |
| Pending / RCP | `#FFFBEB` | `var(--color-accent-amber)` |
| Consultation | `#EFF6FF` | `var(--color-primary)` |
| Machine / Activity | `#F1F5F9` | `#475569` |

- `border-radius: 4px`, `padding: 2px 8px`, Noto Sans 500 12px
- All badges include an icon (8px dot or Lucide icon) — color is never the sole indicator

### 4.5 DoctorBadge

- 24×24px circle, existing hex color per doctor, initials in white 11px
- `aria-label="Dr [Name]"` on the element
- On grids: overlapping stack with `margin-left: -6px`

### 4.6 Data Tables

- Header: `bg-[var(--color-bg)]`, Noto Sans 500 12px uppercase `var(--color-text-muted)`, `position: sticky`, `top: 0`, `z-index: 10`
- Row height: `var(--table-row-height)` (36px default, 44px in planning grids)
- Zebra: odd rows `var(--color-surface)`, even rows `var(--color-muted)`
- Row hover: `bg-[var(--color-muted)]`, `transition: 100ms`
- Mobile: `overflow-x: auto` wrapper, sticky first column (`position: sticky`, `left: 0`, `z-index: 10`, `bg-[var(--color-surface)]`)
- Sortable columns: `aria-sort="ascending|descending|none"` on `<th>`
- Empty state: centered illustration + message + action button (see Section 4.9)

### 4.7 Modals & Bottom Sheets

**Desktop modal:**
- Backdrop: `rgba(0,0,0,0.4)` + `backdrop-filter: blur(2px)`
- Container: `var(--color-surface)`, `border-radius: 12px`, max-width `540px`, centered
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title id
- Focus trap: on open, focus moves to first focusable element inside modal; Tab cycles within modal; Escape closes
- Header: title Figtree 600 16px + `×` close button (44×44px, `aria-label="Fermer"`)
- Enter: `scale(0.97)→scale(1)` + `opacity 0→1`, `200ms ease-out`
- Exit: `scale(1)→scale(0.97)` + `opacity 1→0`, `150ms ease-in`

**Mobile bottom sheet:**
- Slides up from bottom, full width, `border-radius: 16px 16px 0 0`
- Drag handle: 32×4px, `var(--color-border)`, centered top, `margin: 8px auto`
- Swipe-down to dismiss: implement using **Vaul** (`npm install vaul`) — a Radix-based drawer primitive designed for React. Handles gesture, animation, and accessibility automatically.
- Same `role="dialog"` + `aria-modal` + focus trap as desktop modal
- Enter: `translateY(100%)→translateY(0)`, `300ms ease-out`

### 4.8 NotificationBell

- Icon: `Bell` (Lucide, 20px), `aria-label="Notifications"`
- Unread badge: `16×16px` red circle, `var(--color-accent-red)`, count in white 10px, `position: absolute`, top-right of bell
- **Dropdown (desktop/tablet):** 320px wide panel, `position: absolute`, `top: 56px`, `right: 0`, `z-index: 60`, white surface, border + shadow. Max height `400px`, `overflow-y: auto`. Each notification: icon + text + timestamp + read/unread dot.
- **Mobile sheet:** Full-width bottom sheet (Section 4.7 pattern), title "Notifications", list of notification cards
- Empty state: centered bell icon + "Aucune notification" text
- Ownership: Desktop/tablet → sidebar header. Mobile → top bar (Section 3.4 rule).

### 4.9 Empty & Loading States

**Empty state (any list/table with no data):**
- Centered vertically in the container
- Lucide icon (48px, `var(--color-text-muted)`)
- Title: Figtree 600 16px
- Description: Noto Sans 400 14px `var(--color-text-muted)`
- Action button (primary variant) when relevant (e.g., "Ajouter un médecin")

**Loading skeleton:**
- Used for any async content that takes >300ms (plugin rule: `progressive-loading`)
- Shimmer animation: `background: linear-gradient(90deg, var(--color-muted) 25%, var(--color-border) 50%, var(--color-muted) 75%)`, `background-size: 200%`, `animation: shimmer 1.5s infinite`
- Skeletons match the shape of the content they replace (card skeleton, row skeleton, etc.)
- `prefers-reduced-motion`: shimmer animation disabled, static muted color only

**Error state:**
- Red icon + message + "Réessayer" button (primary variant)
- `aria-live="polite"` on error container for screen reader announcement

### 4.10 Form Inputs

- Input height: `40px` desktop / `48px` mobile (touch target)
- Border: `1px solid var(--color-border)`, `border-radius: 6px`, `bg-[var(--color-surface)]`
- Focus: `border-color: var(--color-primary)`, `box-shadow: 0 0 0 3px rgba(37,99,235,0.15)`, `outline: none`
- Error state: `border-color: var(--color-accent-red)`, error message below in `var(--color-accent-red)` 12px
- Disabled: `opacity: 0.5`, `cursor: not-allowed`, `bg-[var(--color-muted)]`
- Label: always visible above input (never placeholder-only), Noto Sans 500 13px `var(--color-text)`
- `<select>`: same height/border as input, custom chevron icon
- Required fields: asterisk `*` after label, `aria-required="true"` on input
- Autocomplete: `autocomplete` attribute set appropriately per field type
- Mobile keyboard: `inputmode` / `type` set to `email`, `tel`, `number` as appropriate

---

## 5. Page Layouts

### 5.1 Dashboard

**Desktop:**
- Top: 4 StatCards in a row (12-col grid, each 3 cols), `gap: var(--grid-gap)`
- Middle: Weekly schedule card (full width), day tabs + grid/list toggle
- Bottom: 2-col — Conflicts list (left, 7 cols) + RCP summary (right, 5 cols)

**Mobile:**
- StatCards: 2×2 grid (`grid-cols-2`)
- Weekly schedule: day selector tabs (horizontally scrollable) + vertical slot list for selected day
- Conflicts: accordion cards, tap to expand

### 5.2 Planning Global

**Desktop:** Full-width grid, doctors as rows × days/periods as columns. Sticky header row + sticky first column (doctor names). Week navigator top-right. Validated week badge.

**Mobile:** Same grid structure, dual-axis scroll.
- Outer container: `height: calc(100vh - var(--header-height) - var(--bottom-nav-height))`, `overflow: hidden`
- Inner grid wrapper: `overflow-x: auto`, `overflow-y: auto`, `overscroll-behavior: contain`, `touch-action: pan-x pan-y`
- Sticky first column: `position: sticky`, `left: 0`, `z-index: 10`, `bg-[var(--color-surface)]`, width `80px`
- Sticky header row: `position: sticky`, `top: 0`, `z-index: 11`, `bg-[var(--color-bg)]`, height `44px`
- Min column width: `72px` per period. Row height: `44px` (touch target override)
- Pinch-zoom: allowed (`touch-action` does not block it)

### 5.3 Mon Planning

**Desktop:** Single-doctor week grid + PersonalAgendaWeek/Month tabs below.

**Mobile (agenda/timeline view):**
- Week selector bar at top: `<` prev arrow + "Semaine du DD/MM" label + `>` next arrow (all 44×44px)
- Chronological list grouped by day: day header (Figtree 600 14px, `var(--color-text-muted)`) + slot cards below
- Slot card: time range (Noto Sans 500 13px) + type badge (Section 4.4) + location/details line
- Tap card → opens bottom sheet (Section 4.7) with full slot details
- "Swipe left" is removed — tap is the primary interaction (plugin rule: `hover-vs-tap`)

### 5.4 Activities

**Desktop:** 2-column — definitions list (left, 320px) + detail/edit panel (right, fills remaining width)

**Mobile:** Vertical list of activity cards → tap card → bottom sheet opens with detail/edit form (Section 4.10 form inputs apply)
- Empty state: Section 4.9 empty state pattern

### 5.5 Profile

**Desktop:** 2-column — personal info card (left, 320px) + agenda tabs (right)

**Mobile:** Stacked:
1. Personal info card
2. Agenda tabs (PersonalAgendaWeek/Month)
3. **Administration section** (admin users only):
   - Toggle button: "Administration ▾" (Figtree 600, 14px, `var(--color-text-muted)`), `44px` height, full width, tap to expand/collapse
   - `aria-expanded` on toggle button
   - Expanded: shows 3 link items (Gestion d'équipe, Gestion des rôles, Données), each `44px` height, icon + label, same style as bottom nav items
   - Collapsed by default

### 5.6 Configuration (Règles & Postes)

**Desktop + Mobile:** Tabbed layout — Postes | Règles | Absences | Paramètres
- Tab bar: horizontally scrollable on mobile (`overflow-x: auto`, `-webkit-overflow-scrolling: touch`, no scrollbar visible)
- Active tab: `border-bottom: 2px solid var(--color-primary)`, text `var(--color-primary)`
- Tab panels below: each section uses the standard Card (Section 4.1) + Form Inputs (Section 4.10) pattern
- **Mobile content adaptation:** Multi-column form layouts (e.g., 2-col on desktop) collapse to single column on mobile. Tables within tabs use `overflow-x: auto` + card-per-row fallback for very narrow screens (<480px).
- Empty states per tab: Section 4.9 pattern

### 5.7 DataAdministration, TeamManagement, RoleManagement

**Desktop:** Filter bar (top) + sortable table (Section 4.6) + action buttons (right of each row)

**Mobile:** Each table row becomes a card:
- Card shows 2–3 key fields
- "⋯" menu button (44×44px) on card top-right → action sheet (bottom sheet) with available actions
- Empty state: Section 4.9 pattern

### 5.8 Login

**Desktop:** Centered card (480px wide, standard padding) on `var(--color-bg)`, logo + app name top, email/password form (Section 4.10), primary button full-width

**Mobile:**
- Full-screen, `var(--color-surface)` background
- Logo scaled to `48px`, centered
- Form centered vertically (`min-height: 100dvh`, flexbox column, `justify-content: center`)
- `padding: 24px 16px` + `padding-top: env(safe-area-inset-top)` + `padding-bottom: env(safe-area-inset-bottom)`
- Input height: `48px` (touch target)
- Keyboard avoidance: no fixed positioning that conflicts with virtual keyboard; use `position: relative` + natural document flow so browser handles keyboard push-up natively
- Password field: show/hide toggle button (Section 4.10)

---

## 6. Accessibility Checklist (plugin rules)

### Visual
- [ ] Color contrast ≥4.5:1 for all normal text (WCAG AA)
- [ ] Color contrast ≥3:1 for large text and UI components
- [ ] No color as sole indicator — all statuses have icon/text alongside color
- [ ] Focus rings: `outline: 2px solid var(--color-primary)`, `outline-offset: 2px` on all focusable elements (never removed)

### Interaction
- [ ] All touch targets ≥44×44px
- [ ] `cursor-pointer` on all interactive elements
- [ ] All buttons have visible labels or `aria-label`
- [ ] Icon-only buttons (collapsed sidebar, close ×, bell): `aria-label` required
- [ ] `prefers-reduced-motion`: all animations disabled/reduced when set

### ARIA & Semantics
- [ ] Active nav items: `aria-current="page"`
- [ ] Modals/sheets: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- [ ] Focus trap inside all open modals and sheets
- [ ] Escape key closes modals and sheets
- [ ] Sortable table headers: `aria-sort`
- [ ] Expandable sections (Profile admin): `aria-expanded` on trigger
- [ ] Toast/error messages: `aria-live="polite"` (or `role="alert"` for critical errors)
- [ ] Form fields: `<label for>`, `aria-required`, `aria-describedby` for error messages

### Layout
- [ ] `viewport` meta: `width=device-width, initial-scale=1` (no `user-scalable=no`)
- [ ] Safe area insets: bottom nav + top bar use `env(safe-area-inset-*)` padding
- [ ] No horizontal scroll on any page at any breakpoint
- [ ] `overflow-x: hidden` on `<body>` to prevent accidental scroll leaks
- [ ] Sticky columns/headers use correct `z-index` from scale (Section 2.5)

---

## 7. Dependencies to Add

| Package | Purpose |
|---|---|
| `vaul` | Bottom sheet / drawer with gesture support (mobile modals) |

Install: `npm install vaul`

---

## 8. Implementation Order (Approach A)

1. **Token layer** — `tailwind.config.js` extend + CSS variables in `src/index.css` + Google Fonts in `index.html`
2. **Global CSS cleanup** — remove/replace `mobile.css` content, purge all dark slate (`slate-900`, `slate-800`) classes from existing files, reset to token-based classes. Done NOW to prevent specificity conflicts throughout the build.
3. **Base components** — `StatCard.tsx`, `DoctorBadge.tsx`, Button classes, Badge classes, Card classes, form input classes, empty/loading/error state components
4. **Login page** — `Login.tsx` (no shell dependency, enables auth testing early)
5. **Shell** — `Sidebar.tsx` (desktop + tablet) + `BottomNav.tsx` (new) + `TopBar.tsx` (new) + `App.tsx` layout wiring
6. **NotificationBell** — `NotificationBell.tsx` refactor (dropdown desktop, sheet mobile, owner logic)
7. **Dashboard** — `Dashboard.tsx`
8. **Planning Global** — `Planning.tsx` (responsive grid + dual-axis mobile scroll)
9. **Mon Planning** — `MonPlanning.tsx` (agenda timeline on mobile)
10. **Activities** — `Activities.tsx`
11. **Profile** — `Profile.tsx` (admin collapsible section)
12. **Configuration** — `Configuration.tsx` (tab bar, form inputs)
13. **Admin pages** — `TeamManagement.tsx`, `RoleManagement.tsx`, `DataAdministration.tsx`
14. **Modals audit** — `SlotDetailsModal.tsx`, `ConflictResolverModal.tsx`, `RcpExceptionModal.tsx`, `AbsenceConflictsModal.tsx` — migrate to new modal/sheet pattern

---

## 9. Out of Scope

- No functional/logic changes
- No database schema changes
- No new features
- Dark mode (not in scope for this iteration)
