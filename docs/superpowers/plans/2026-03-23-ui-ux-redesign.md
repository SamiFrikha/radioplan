# RadioPlan AI — Full UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full visual redesign of RadioPlan AI — light design system, professional data-dense dashboard style, true mobile responsiveness with bottom nav — zero functional changes.

**Architecture:** Token-first approach — establish CSS variables and Tailwind config before touching any component. All work is done in `.worktrees/redesign` on branch `feature/redesign`. Each phase builds on the previous; do not skip ahead.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vite, Lucide React icons, Vaul (new — bottom sheets), Google Fonts (Figtree + Noto Sans)

**Spec:** `docs/superpowers/specs/2026-03-23-redesign-design.md`

---

## Phase 1 — Token Layer & Foundation

### Task 1: Tailwind Config — Design Tokens

**Files:**
- Modify: `tailwind.config.js`
- Modify: `src/index.css`
- Modify: `index.html`

- [ ] **Step 1: Extend Tailwind config with design tokens**

Replace the contents of `tailwind.config.js` with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./context/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          hover: '#1D4ED8',
        },
        accent: {
          green: '#059669',
          red: '#DC2626',
          amber: '#D97706',
        },
        surface: '#FFFFFF',
        'app-bg': '#F8FAFC',
        border: '#E4ECFC',
        muted: '#F1F5FD',
        'text-base': '#0F172A',
        'text-muted': '#64748B',
      },
      fontFamily: {
        heading: ['Figtree', 'sans-serif'],
        body: ['Noto Sans', 'sans-serif'],
      },
      fontSize: {
        'data': ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        'label': ['13px', { lineHeight: '1.4', fontWeight: '500' }],
      },
      spacing: {
        'sidebar': '240px',
        'sidebar-collapsed': '64px',
        'top-bar': '56px',
        'bottom-nav': '64px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px rgba(37,99,235,0.08)',
        'modal': '0 20px 60px rgba(0,0,0,0.15)',
      },
      borderRadius: {
        'card': '8px',
        'btn': '6px',
        'badge': '4px',
      },
      zIndex: {
        'sticky': '10',
        'sidebar': '20',
        'topbar': '30',
        'bottomnav': '40',
        'modal': '50',
        'toast': '60',
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 2: Add CSS variables and font to src/index.css**

Replace the contents of `src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-primary: #2563EB;
  --color-primary-hover: #1D4ED8;
  --color-accent-green: #059669;
  --color-accent-red: #DC2626;
  --color-accent-amber: #D97706;
  --color-bg: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-border: #E4ECFC;
  --color-muted: #F1F5FD;
  --color-text: #0F172A;
  --color-text-muted: #64748B;
  --sidebar-width: 240px;
  --sidebar-collapsed-width: 64px;
  --header-height: 56px;
  --bottom-nav-height: 64px;
  --grid-gap: 8px;
  --card-padding: 16px;
  --card-padding-dense: 12px;
  --table-row-height: 36px;
}

* {
  box-sizing: border-box;
}

body {
  font-family: 'Noto Sans', sans-serif;
  background-color: var(--color-bg);
  color: var(--color-text);
  font-size: 14px;
  overflow-x: hidden;
}

/* Focus rings — never remove */
*:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Scrollbar styling */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 99px; }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* Shimmer skeleton animation */
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton {
  background: linear-gradient(90deg, var(--color-muted) 25%, var(--color-border) 50%, var(--color-muted) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    background: var(--color-muted);
  }
}
```

- [ ] **Step 3: Add Google Fonts to index.html head**

In `index.html`, add inside `<head>` before any other `<link>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700&family=Noto+Sans:wght@300;400;500;700&display=swap" rel="stylesheet">
```

Also make these changes in `index.html`:
1. Update viewport meta (no zoom disable):
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```
2. Update `<meta name="theme-color">` from dark to brand blue:
```html
<meta name="theme-color" content="#2563EB">
```
3. Remove dark classes from `<body>` tag — change:
```html
<body class="bg-slate-50 text-slate-900 font-sans antialiased">
```
to:
```html
<body class="antialiased">
```
4. Update print CSS in any `<style>` block — if it targets `.flex.h-screen`, update to target `.min-h-dvh` or remove it (the new layout uses `min-h-dvh` not `h-screen`).

- [ ] **Step 4: Install Vaul**

```bash
cd .worktrees/redesign
npm install vaul
```

- [ ] **Step 5: Start dev server and verify fonts load**

```bash
npm run dev
```

Open `http://localhost:3000` — verify Figtree/Noto Sans load in browser DevTools Network tab. Background should now be `#F8FAFC` instead of white.

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.js src/index.css index.html package.json package-lock.json
git commit -m "feat(design): add token layer, Tailwind config, Google Fonts, Vaul"
```

---

### Task 2: Global CSS Cleanup

**Files:**
- Delete: `mobile.css` (content migrated to `src/index.css`)
- Modify: `index.html` (remove mobile.css import)
- Modify: All files referencing `slate-900`, `slate-800`, `bg-gray-900`

- [ ] **Step 1: Remove mobile.css import from index.html**

Find and remove this line from `index.html` (it is only in `index.html`, not in `index.tsx`):
```html
<link rel="stylesheet" href="/mobile.css">
```
If no such line exists, the file may already be gone — proceed to Step 3.

- [ ] **Step 2: Find all dark slate class usages**

```bash
grep -rn "slate-900\|slate-800\|bg-gray-900\|bg-gray-800" --include="*.tsx" --include="*.ts" .
```

Note all files returned — these will be updated in their respective tasks (Sidebar, etc.). Do not bulk-replace yet; each component gets its own task.

- [ ] **Step 3: Delete mobile.css**

```bash
rm mobile.css
```

- [ ] **Step 4: Verify app still starts**

```bash
npm run dev
```

No console errors expected. The dark sidebar will still show — that is fixed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove mobile.css, prep for token-based styling"
```

---

## Phase 2 — Base Components

### Task 3: Shared UI Primitives (Badge, Card classes, Button classes)

**Files:**
- Create: `components/ui/Badge.tsx`
- Create: `components/ui/Card.tsx`
- Create: `components/ui/Button.tsx`
- Create: `components/ui/EmptyState.tsx`
- Create: `components/ui/Skeleton.tsx`
- Create: `components/ui/index.ts`

- [ ] **Step 1: Create Badge component**

Create `components/ui/Badge.tsx`:

```tsx
import React from 'react';

type BadgeVariant = 'green' | 'red' | 'amber' | 'blue' | 'gray';

const variantClasses: Record<BadgeVariant, string> = {
  green: 'bg-[#F0FDF4] text-accent-green',
  red: 'bg-[#FEF2F2] text-accent-red',
  amber: 'bg-[#FFFBEB] text-accent-amber',
  blue: 'bg-[#EFF6FF] text-primary',
  gray: 'bg-[#F1F5F9] text-[#475569]',
};

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant, children, className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-badge text-[11px] font-medium font-body ${variantClasses[variant]} ${className}`}>
    <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
    {children}
  </span>
);
```

- [ ] **Step 2: Create Card component**

Create `components/ui/Card.tsx`:

```tsx
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', hover = false }) => (
  <div className={`bg-surface border border-border rounded-card shadow-card ${hover ? 'transition-shadow duration-150 hover:shadow-card-hover cursor-pointer' : ''} ${className}`}>
    {children}
  </div>
);

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, className = '' }) => (
  <div className={`px-4 py-3 border-b border-border flex items-center justify-between ${className}`}>
    {children}
  </div>
);

export const CardTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="font-heading font-semibold text-sm text-text-base">{children}</h3>
);

export const CardBody: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={className}>{children}</div>
);
```

- [ ] **Step 3: Create Button component**

Create `components/ui/Button.tsx`:

```tsx
import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type ButtonSize = 'sm' | 'md';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'bg-muted text-primary hover:bg-border',
  destructive: 'bg-accent-red text-white hover:bg-[#B91C1C]',
  ghost: 'bg-transparent text-text-muted hover:bg-muted',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs min-h-[44px] md:min-h-[32px]',
  md: 'h-9 px-4 text-sm min-h-[44px] md:min-h-[36px]',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}) => (
  <button
    className={`inline-flex items-center justify-center gap-1.5 rounded-btn font-heading font-medium transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    disabled={disabled || loading}
    {...props}
  >
    {loading ? (
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
      </svg>
    ) : children}
  </button>
);
```

- [ ] **Step 4: Create EmptyState component**

Create `components/ui/EmptyState.tsx`:

```tsx
import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, actionLabel, onAction }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <Icon className="w-12 h-12 text-text-muted mb-3" aria-hidden="true" />
    <h3 className="font-heading font-semibold text-base text-text-base mb-1">{title}</h3>
    {description && <p className="text-sm text-text-muted mb-4 max-w-xs">{description}</p>}
    {actionLabel && onAction && (
      <Button variant="primary" onClick={onAction}>{actionLabel}</Button>
    )}
  </div>
);
```

- [ ] **Step 5: Create Skeleton component**

Create `components/ui/Skeleton.tsx`:

```tsx
import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`skeleton ${className}`} aria-hidden="true" />
);

export const SkeletonCard: React.FC = () => (
  <div className="bg-surface border border-border rounded-card p-4 space-y-3">
    <Skeleton className="h-4 w-1/3" />
    <Skeleton className="h-8 w-1/2" />
    <Skeleton className="h-3 w-2/3" />
  </div>
);
```

- [ ] **Step 6: Create barrel export**

Create `components/ui/index.ts`:

```ts
export { Badge } from './Badge';
export { Card, CardHeader, CardTitle, CardBody } from './Card';
export { Button } from './Button';
export { EmptyState } from './EmptyState';
export { Skeleton, SkeletonCard } from './Skeleton';
```

- [ ] **Step 7: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add components/ui/
git commit -m "feat(ui): add Badge, Card, Button, EmptyState, Skeleton primitives"
```

---

### Task 4: StatCard Redesign

**Files:**
- Modify: `components/StatCard.tsx`

- [ ] **Step 1: Rewrite StatCard**

Replace the full contents of `components/StatCard.tsx`:

```tsx
import React from 'react';
import { LucideIcon } from 'lucide-react';

type StatCardColor = 'blue' | 'red' | 'green' | 'amber';

const colorClasses: Record<StatCardColor, { icon: string; value: string }> = {
  blue:  { icon: 'bg-[#EFF6FF] text-primary',       value: 'text-text-base' },
  red:   { icon: 'bg-[#FEF2F2] text-accent-red',    value: 'text-accent-red' },
  green: { icon: 'bg-[#F0FDF4] text-accent-green',  value: 'text-accent-green' },
  amber: { icon: 'bg-[#FFFBEB] text-accent-amber',  value: 'text-accent-amber' },
};

interface StatCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  color?: StatCardColor;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, value, label, color = 'blue' }) => {
  const colors = colorClasses[color];
  return (
    <div className="bg-surface border border-border rounded-card shadow-card p-4 flex items-center gap-3.5">
      <div className={`w-10 h-10 rounded-card flex items-center justify-center flex-shrink-0 ${colors.icon}`}>
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <div>
        <p className={`font-heading font-bold text-[26px] leading-none ${colors.value}`}>{value}</p>
        <p className="text-[12px] text-text-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
};

export default StatCard;
```

- [ ] **Step 2: Update any callers of StatCard**

Search for all `<StatCard` usages and ensure they pass an `icon` prop (LucideIcon) and `color` prop. Check `pages/Dashboard.tsx`.

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/StatCard.tsx
git commit -m "feat(ui): redesign StatCard with token-based colors"
```

---

### Task 5: DoctorBadge Update

**Files:**
- Modify: `components/DoctorBadge.tsx`

- [ ] **Step 1: Read current DoctorBadge implementation**

Read `components/DoctorBadge.tsx` to understand current structure.

- [ ] **Step 2: Update DoctorBadge to use new sizing and aria**

Ensure the badge circle is `24×24px` with `aria-label="Dr [name]"`. Keep existing hex color logic unchanged. Add `font-heading` class for initials.

- [ ] **Step 3: Commit**

```bash
git add components/DoctorBadge.tsx
git commit -m "feat(ui): update DoctorBadge sizing and aria-label"
```

---

## Phase 3 — Login Page

### Task 6: Login Page Redesign

**Files:**
- Modify: `pages/Login.tsx`

- [ ] **Step 1: Read current Login.tsx**

Read the full file to understand form structure and auth logic. Do not change any auth logic.

- [ ] **Step 2: Rewrite Login JSX (keep all logic)**

**Important:** The snippet below uses `handleSubmit`, `email`, `setEmail`, `password`, `setPassword`, `error`, `loading` as variable names. After reading Step 1, rename these references to match whatever names the current `Login.tsx` actually uses (e.g. `onSubmit`, `isLoading`, etc.) — do NOT change the logic, only rename to match.

Replace only the JSX return. The page should render:

```tsx
// Desktop: centered card on app-bg background
// Mobile: full-screen surface with safe-area padding

return (
  <div className="min-h-dvh bg-app-bg flex items-center justify-center p-4"
       style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
    <div className="bg-surface border border-border rounded-card shadow-modal w-full max-w-[440px] p-8">
      {/* Logo */}
      <div className="text-center mb-8">
        <h1 className="font-heading font-bold text-2xl text-primary">RadioPlan AI</h1>
        <p className="text-sm text-text-muted mt-1">Oncologie &amp; Radiothérapie</p>
      </div>

      {/* Form — keep existing onSubmit handler and state */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-label font-medium text-text-base mb-1.5">
            Adresse email <span aria-hidden="true" className="text-accent-red">*</span>
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            aria-required="true"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full h-12 md:h-10 px-3 border border-border rounded-btn text-sm bg-surface
                       focus:border-primary focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] focus:outline-none
                       transition-shadow duration-150"
            placeholder="prenom.nom@hopital.fr"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-label font-medium text-text-base mb-1.5">
            Mot de passe <span aria-hidden="true" className="text-accent-red">*</span>
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              aria-required="true"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full h-12 md:h-10 px-3 pr-10 border border-border rounded-btn text-sm bg-surface
                         focus:border-primary focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] focus:outline-none
                         transition-shadow duration-150"
            />
            <button
              type="button"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center
                         text-text-muted hover:text-text-base transition-colors"
            >
              {/* Eye / EyeOff icon */}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" aria-live="polite" className="text-sm text-accent-red bg-[#FEF2F2] border border-[#FECACA] rounded-btn px-3 py-2">
            {error}
          </div>
        )}

        <Button type="submit" variant="primary" loading={loading} className="w-full mt-2">
          Se connecter
        </Button>
      </form>
    </div>
  </div>
);
```

Add `const [showPassword, setShowPassword] = React.useState(false)` to existing state. Import `Button` from `../components/ui`.

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Test login page visually**

```bash
npm run dev
```

Navigate to `/login`. Verify: white card on light background, fonts loading, form inputs styled, button uses new design.

- [ ] **Step 5: Commit**

```bash
git add pages/Login.tsx
git commit -m "feat(login): redesign login page with new design system"
```

---

## Phase 4 — Shell (Sidebar + Mobile Nav)

### Task 7: New Sidebar (Desktop + Tablet)

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Read current Sidebar.tsx in full**

Read `components/Sidebar.tsx` to understand all props and logic before touching.

- [ ] **Step 2: Rewrite Sidebar with light design**

Key changes:
- Remove all `slate-900`, `slate-800`, `slate-700` classes
- Background: `bg-surface` with `border-r border-border`
- Nav items: `text-text-muted hover:bg-muted hover:text-text-base`, active: `border-l-[3px] border-primary bg-muted text-primary`
- Add `aria-current="page"` to active NavLink
- Add `aria-label` to icon-only elements
- Tablet (md screens, `< lg`): hide labels, show icons only — use `hidden lg:block` on label spans
- Sidebar width: `w-sidebar` on `lg+`, `w-sidebar-collapsed` on `md`
- Header: white background, "RadioPlan AI" in `text-primary font-heading font-bold`
- Admin divider: `border-t border-border` + "ADMINISTRATION" label in 10px uppercase muted
- Footer: user info + logout with `hover:text-accent-red`
- Remove the mobile overlay/slide behavior entirely (handled by BottomNav now)
- Keep `print:hidden`

Full active NavLink pattern:
```tsx
className={({ isActive }) =>
  `flex items-center px-3 h-11 rounded-lg transition-colors duration-150 relative
   ${isActive
     ? 'bg-muted text-primary border-l-[3px] border-primary pl-[calc(0.75rem-3px)]'
     : 'text-text-muted hover:bg-muted hover:text-text-base border-l-[3px] border-transparent pl-[calc(0.75rem-3px)]'
   }`
}
aria-current={isActive ? 'page' : undefined}
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Visual check**

```bash
npm run dev
```

Verify: white sidebar, blue active indicator, smooth hover. At tablet width (768–1023px), labels hidden.

- [ ] **Step 5: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat(sidebar): redesign with light theme, tablet collapse, ARIA"
```

---

### Task 8: BottomNav Component (Mobile)

**Files:**
- Create: `components/BottomNav.tsx`

- [ ] **Step 1: Create BottomNav component**

Create `components/BottomNav.tsx`:

```tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, LayoutGrid, Activity, UserCircle } from 'lucide-react';

const tabs = [
  { to: '/',             icon: LayoutDashboard, label: 'Tableau' },
  { to: '/planning',     icon: CalendarDays,    label: 'Planning' },
  { to: '/mon-planning', icon: LayoutGrid,      label: 'Mon Plan.' },
  { to: '/activities',   icon: Activity,        label: 'Activités' },
  { to: '/profile',      icon: UserCircle,      label: 'Profil' },
];

const BottomNav: React.FC = () => (
  <nav
    className="fixed bottom-0 left-0 right-0 z-bottomnav bg-surface border-t border-border
               flex items-center justify-around lg:hidden print:hidden"
    style={{
      height: 'calc(64px + env(safe-area-inset-bottom))',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}
    aria-label="Navigation principale"
  >
    {tabs.map(({ to, icon: Icon, label }) => (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
        aria-label={label}
        className={({ isActive }) =>
          `flex flex-col items-center justify-center gap-0.5 px-2 min-w-[56px] h-full
           transition-colors duration-150
           ${isActive ? 'text-primary' : 'text-[#94A3B8]'}`
        }
        aria-current={undefined} // set below via render prop
      >
        {({ isActive }) => (
          <>
            <Icon className="w-5 h-5" aria-hidden="true" />
            <span className={`text-[10px] font-heading font-medium leading-none ${isActive ? 'text-primary' : ''}`}>
              {label}
            </span>
            {/* aria-current must be set on the anchor element itself */}
            {isActive && <span className="sr-only" aria-current="page" />}
          </>
        )}
      </NavLink>
    ))}
  </nav>
);

export default BottomNav;
```

- [ ] **Step 2: Create TopBar component**

Create `components/TopBar.tsx`:

```tsx
import React from 'react';
import { useLocation } from 'react-router-dom';
import NotificationBell from './NotificationBell';

const routeTitles: Record<string, string> = {
  '/':              'Tableau de bord',
  '/planning':      'Planning Global',
  '/mon-planning':  'Mon Planning',
  '/activities':    'Activités',
  '/profile':       'Mon Profil',
  '/configuration': 'Règles & Postes',
  '/data':          'Données',
  '/admin/team':    "Gestion d'équipe",
  '/admin/roles':   'Gestion des rôles',
};

const TopBar: React.FC = () => {
  const { pathname } = useLocation();
  const title = routeTitles[pathname] ?? 'RadioPlan AI';

  return (
    <header
      className="fixed top-0 left-0 right-0 z-topbar bg-surface border-b border-border
                 flex items-center justify-between px-4 lg:hidden print:hidden"
      style={{
        height: 'calc(56px + env(safe-area-inset-top))',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="w-9" aria-hidden="true" />
      <h1 className="font-heading font-semibold text-base text-text-base absolute left-1/2 -translate-x-1/2">
        {title}
      </h1>
      <div className="ml-auto">
        <NotificationBell />
      </div>
    </header>
  );
};

export default TopBar;
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/BottomNav.tsx components/TopBar.tsx
git commit -m "feat(nav): add BottomNav and TopBar for mobile"
```

---

### Task 9: App.tsx Layout Wiring

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Read current App.tsx layout section**

Read `App.tsx`. Find the `AppLayout` component (defined around line 47 inside the file, used as a wrapper in every `<Route>`). This is the component to rewrite — it is NOT an inline JSX block but a standalone component definition. Also note `isMobileMenuOpen` state: it is declared twice (once inside `AppLayout`, once inside the main `App` component at ~line 75). Remove **both** declarations and all references (`setIsMobileMenuOpen`, `isMenuOpen` props on `<Sidebar>`) since the mobile menu no longer exists.

- [ ] **Step 2: Replace the AppLayout component definition**

Find the `AppLayout` component definition in `App.tsx` and replace its full body with the new layout:

```tsx
// Import new components
import BottomNav from './components/BottomNav';
import TopBar from './components/TopBar';

// Layout JSX (inside authenticated routes):
<div className="flex min-h-dvh bg-app-bg">
  {/* Sidebar: visible on md+ only */}
  <Sidebar />

  {/* Main content area */}
  <div className="flex-1 flex flex-col min-w-0
                  lg:ml-sidebar">
    {/* TopBar: visible on mobile only (lg:hidden inside component) */}
    <TopBar />

    {/* Page content */}
    <main
      className="flex-1 p-4 md:p-6
                 pt-[calc(56px+env(safe-area-inset-top)+1rem)] lg:pt-6
                 pb-[calc(64px+env(safe-area-inset-bottom)+1rem)] lg:pb-6"
    >
      {/* Routes rendered here */}
    </main>
  </div>

  {/* BottomNav: visible on mobile only (lg:hidden inside component) */}
  <BottomNav />
</div>
```

Remove any existing hamburger menu button and mobile overlay logic from `App.tsx` — it is no longer needed.

Update `<Sidebar>` to remove `isOpen` and `onClose` props if they were only used for mobile toggle.

- [ ] **Step 3: Update Sidebar props interface**

In `Sidebar.tsx`, if `isOpen` and `onClose` props existed only for mobile toggle, remove them. The sidebar is always visible on `md+` and hidden on mobile via CSS (`hidden md:flex`).

- [ ] **Step 4: Verify full app renders**

```bash
npm run dev
```

Check: sidebar visible on desktop, hidden on mobile, bottom nav visible on mobile, top bar visible on mobile with correct page title, main content not obscured by fixed bars.

- [ ] **Step 5: Commit**

```bash
git add App.tsx components/Sidebar.tsx
git commit -m "feat(layout): wire BottomNav + TopBar into App, responsive shell"
```

---

### Task 10: NotificationBell Redesign

**Files:**
- Modify: `components/NotificationBell.tsx`

- [ ] **Step 1: Read current NotificationBell.tsx**

Read the full file. Note how notifications are fetched and displayed.

- [ ] **Step 2: Update NotificationBell styling**

Key changes (keep all data logic):
- Bell icon button: `w-9 h-9 rounded-lg bg-muted hover:bg-border flex items-center justify-center relative`
- Unread badge: `absolute top-1 right-1 w-2 h-2 bg-accent-red rounded-full border-2 border-surface`
- Dropdown panel (desktop): `absolute right-0 top-12 w-80 bg-surface border border-border rounded-card shadow-modal z-toast overflow-hidden`
- Mobile: wrap dropdown in a Vaul drawer for sheet behavior:

```tsx
import { Drawer } from 'vaul';

// On mobile (detect via CSS or window.innerWidth):
// Use <Drawer.Root> + <Drawer.Content> instead of absolute dropdown
// The trigger is the same bell button
```

Use Vaul's `Drawer` for the mobile sheet. The correct Vaul API (`vaul` v0.9+):

```tsx
import { Drawer } from 'vaul';

// Usage:
<Drawer.Root open={isOpen} onOpenChange={setIsOpen} dismissible>
  <Drawer.Portal>
    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-modal" />
    <Drawer.Content
      className="fixed bottom-0 left-0 right-0 z-modal bg-surface rounded-t-2xl
                 border-t border-border outline-none
                 md:left-auto md:right-4 md:bottom-14 md:top-auto md:w-80 md:rounded-card md:border"
    >
      {/* Drag handle — mobile only */}
      <div className="w-8 h-1 bg-border rounded-full mx-auto mt-3 mb-2 md:hidden" aria-hidden="true" />
      {/* Notification list */}
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

Key Vaul props: `open`, `onOpenChange`, `dismissible` (swipe-down to close). No `modal` prop exists — Vaul handles the overlay via `Drawer.Overlay`. On `md+` screens the `Drawer.Content` is repositioned via Tailwind classes to appear as a dropdown panel.

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/NotificationBell.tsx
git commit -m "feat(notifications): redesign bell with new tokens, Vaul sheet on mobile"
```

---

## Phase 5 — Pages

### Task 11: Dashboard Redesign

**Files:**
- Modify: `pages/Dashboard.tsx`

- [ ] **Step 1: Read Dashboard.tsx in full**

Read the entire file. Note all state, data fetching, and existing JSX structure.

- [ ] **Step 2: Update Dashboard layout**

Replace JSX layout — keep all logic/state unchanged:
- Page header: title (Figtree 700 22px) + week navigator (right-aligned, icon buttons + week label)
- Stat row: `grid grid-cols-2 lg:grid-cols-4 gap-2` using new `<StatCard>` with `icon` and `color` props
- Weekly schedule: `<Card>` with `<CardHeader>` (title + legend badges + action button) + table (existing table but with new `schedule-table` classes)
- Bottom: `grid grid-cols-1 lg:grid-cols-[7fr_5fr] gap-3` — conflicts card + RCP summary card
- Mobile conflict items: show as stacked cards (not table rows)
- Import and use `Card`, `CardHeader`, `CardTitle`, `CardBody`, `Badge`, `Button` from `../components/ui`
- Replace any remaining `bg-slate-*` or `text-slate-*` classes with token equivalents

- [ ] **Step 3: Verify no TypeScript errors + visual check**

```bash
npx tsc --noEmit && npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add pages/Dashboard.tsx
git commit -m "feat(dashboard): redesign layout with token-based design system"
```

---

### Task 12: Planning Global Redesign

**Files:**
- Modify: `pages/Planning.tsx`

- [ ] **Step 1: Read Planning.tsx in full**

Note: grid structure, week navigation, how slots are rendered, validated week logic.

- [ ] **Step 2: Update Planning layout — mobile dual-axis scroll**

Key changes:
- Page wrapper: `flex flex-col h-[calc(100dvh-var(--header-height,56px)-var(--bottom-nav-height,64px))] lg:h-auto lg:overflow-visible` on mobile
- Grid container: `overflow-hidden flex-1`
- Grid scroll wrapper: `overflow-x-auto overflow-y-auto overscroll-contain h-full` with `style={{ touchAction: 'pan-x pan-y' }}`
- First column (doctor names): `sticky left-0 z-sticky bg-surface` with `min-w-[80px] max-w-[80px]`
- Header row: `sticky top-0 z-[11] bg-app-bg`
- Row height: `h-11` (44px) on all breakpoints
- Min column width: `min-w-[72px]`
- Replace all `slate-*` classes with token classes
- Slot badges: use `<Badge>` component

- [ ] **Step 3: Verify no TypeScript errors + visual check on mobile size (375px)**

Resize browser to 375px width. Verify: dual-axis scroll works, sticky column/header visible, no horizontal overflow outside the grid container.

- [ ] **Step 4: Commit**

```bash
git add pages/Planning.tsx
git commit -m "feat(planning): responsive grid with dual-axis mobile scroll"
```

---

### Task 13: Mon Planning — Agenda Mobile View

**Files:**
- Modify: `pages/MonPlanning.tsx`

- [ ] **Step 1: Read MonPlanning.tsx in full**

Note: how slots are fetched and what data is available per slot.

- [ ] **Step 2: Add responsive view switching**

Add a `isMobile` helper (using a `useMediaQuery` hook or `window.innerWidth < 768`) to switch between:
- **Desktop:** existing week grid (redestyled with token classes)
- **Mobile:** new agenda timeline view

Agenda timeline JSX structure:
```tsx
// Mobile agenda view
<div className="space-y-4">
  <WeekSelector /> {/* prev/next buttons + week label */}
  {weekDays.map(day => (
    <div key={day.toISOString()}>
      <h3 className="text-[11px] font-heading font-semibold uppercase tracking-wider text-text-muted py-1">
        {formatDay(day)}
      </h3>
      {slotsForDay(day).map(slot => (
        <button
          key={slot.id}
          onClick={() => openSlotDetail(slot)}
          className="w-full bg-surface border border-border rounded-card p-3 flex items-center gap-3 mb-2
                     hover:shadow-card-hover transition-shadow text-left"
        >
          <span className="font-heading font-semibold text-[12px] text-text-muted w-14 flex-shrink-0">
            {slot.period === 'AM' ? '08h00' : '14h00'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{slot.label}</p>
            <p className="text-[11px] text-text-muted">{slot.subLabel}</p>
          </div>
          <Badge variant={slotVariant(slot)} />
          <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" aria-hidden="true" />
        </button>
      ))}
      {slotsForDay(day).length === 0 && (
        <p className="text-sm text-text-muted py-2 px-1">Aucun créneau</p>
      )}
    </div>
  ))}
</div>
```

- [ ] **Step 3: Verify no TypeScript errors + test on mobile width**

- [ ] **Step 4: Commit**

```bash
git add pages/MonPlanning.tsx
git commit -m "feat(mon-planning): agenda timeline view on mobile"
```

---

### Task 14: Activities Page Redesign

**Files:**
- Modify: `pages/Activities.tsx`

- [ ] **Step 1: Read Activities.tsx**

- [ ] **Step 2: Update layout**

- Desktop: 2-column `grid lg:grid-cols-[320px_1fr] gap-4`
- Mobile: single column list; tapping an item opens a Vaul bottom sheet for detail/edit
- Import `{ Drawer }` from `'vaul'` for the mobile detail sheet
- Replace all `slate-*` classes with token classes
- Use `<Card>`, `<Button>`, `<Badge>` from UI library
- Empty state: `<EmptyState>` component

- [ ] **Step 3: Verify + commit**

```bash
git add pages/Activities.tsx
git commit -m "feat(activities): redesign with 2-col desktop, sheet on mobile"
```

---

### Task 15: Profile Page Redesign

**Files:**
- Modify: `pages/Profile.tsx`

- [ ] **Step 1: Read Profile.tsx**

- [ ] **Step 2: Update layout**

- Desktop: 2-column `grid lg:grid-cols-[320px_1fr] gap-4`
- Mobile: stacked — info card → agenda → admin collapsible
- Admin collapsible (mobile only, admin users):

```tsx
import { Users, Shield, Database } from 'lucide-react';

const adminLinks = [
  { to: '/admin/team',  icon: Users,     label: "Gestion d'équipe" },
  { to: '/admin/roles', icon: Shield,    label: 'Gestion des rôles' },
  { to: '/data',        icon: Database,  label: 'Données' },
];

const [adminOpen, setAdminOpen] = React.useState(false);

// Inside mobile layout:
{hasPermission('manage_users') && (
  <div className="lg:hidden">
    <button
      onClick={() => setAdminOpen(v => !v)}
      aria-expanded={adminOpen}
      className="w-full flex items-center justify-between px-4 h-11 bg-surface border border-border rounded-card font-heading font-semibold text-sm text-text-muted"
    >
      Administration
      <ChevronDown className={`w-4 h-4 transition-transform ${adminOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    {adminOpen && (
      <div className="mt-1 bg-surface border border-border rounded-card overflow-hidden">
        {adminLinks.map(link => (
          <NavLink key={link.to} to={link.to} className="flex items-center gap-3 px-4 h-11 hover:bg-muted border-b border-border last:border-0 text-sm font-medium">
            <link.icon className="w-4 h-4 text-text-muted" aria-hidden="true" />
            {link.label}
          </NavLink>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Verify + commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(profile): redesign with admin collapsible on mobile"
```

---

### Task 16: Configuration Page Redesign

**Files:**
- Modify: `pages/Configuration.tsx`

- [ ] **Step 1: Read Configuration.tsx**

- [ ] **Step 2: Update layout**

- Scrollable tab bar: `flex overflow-x-auto gap-0 border-b border-border bg-surface -webkit-overflow-scrolling-touch scrollbar-none`
- Each tab: `px-4 h-10 font-heading font-medium text-sm whitespace-nowrap border-b-2 transition-colors`, active: `border-primary text-primary`, inactive: `border-transparent text-text-muted hover:text-text-base`
- Form inputs: apply new input classes from spec (Section 4.10) — `h-10 md:h-10 h-12` on mobile inputs
- Multi-column forms: `grid grid-cols-1 md:grid-cols-2 gap-3`
- Replace all `slate-*` with token classes

- [ ] **Step 3: Verify + commit**

```bash
git add pages/Configuration.tsx
git commit -m "feat(configuration): redesign tabs and form inputs"
```

---

### Task 17: Admin Pages Redesign

**Files:**
- Modify: `pages/DataAdministration.tsx`
- Modify: `pages/admin/TeamManagement.tsx`
- Modify: `pages/admin/RoleManagement.tsx`

- [ ] **Step 1: Read all three files**

- [ ] **Step 2: Update each page**

For each:
- Desktop: filter bar + sortable table using new token classes
- Mobile: table rows become cards with `<Card>` component + overflow `⋯` menu (use Vaul sheet for actions)
- Replace all `slate-*` classes
- Use `<EmptyState>` for empty tables
- Table headers: `sticky top-0 bg-app-bg text-[11px] font-medium uppercase tracking-wider text-text-muted`

- [ ] **Step 3: Verify + commit**

```bash
git add pages/DataAdministration.tsx pages/admin/TeamManagement.tsx pages/admin/RoleManagement.tsx
git commit -m "feat(admin): redesign data tables with card fallback on mobile"
```

---

## Phase 6 — Modal Audit

### Task 18: Migrate All Modals to New Pattern

**Files:**
- Modify: `components/SlotDetailsModal.tsx`
- Modify: `components/ConflictResolverModal.tsx`
- Modify: `components/RcpExceptionModal.tsx`
- Modify: `components/AbsenceConflictsModal.tsx`

- [ ] **Step 1: Read all four modal files**

- [ ] **Step 2: Apply consistent modal pattern to each**

For each modal:
- Backdrop: `fixed inset-0 bg-black/40 backdrop-blur-sm z-modal flex items-end md:items-center justify-center p-0 md:p-4`
- Desktop container: `bg-surface rounded-card shadow-modal w-full max-w-[540px] mx-auto`
- Mobile container: `bg-surface rounded-t-[16px] w-full` (bottom sheet)
- Add drag handle on mobile: `<div className="w-8 h-1 bg-border rounded-full mx-auto mt-3 mb-1 md:hidden" aria-hidden="true" />`
- Header: `px-4 py-3 border-b border-border flex items-center justify-between`
- Title: `font-heading font-semibold text-base`
- Close button: `w-11 h-11 flex items-center justify-center rounded-btn hover:bg-muted -mr-2` with `aria-label="Fermer"`
- Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` to the container
- Replace all `slate-*` classes

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/SlotDetailsModal.tsx components/ConflictResolverModal.tsx components/RcpExceptionModal.tsx components/AbsenceConflictsModal.tsx
git commit -m "feat(modals): migrate all modals to new sheet/dialog pattern with ARIA"
```

---

## Phase 7 — Final Polish

### Task 19: Final Audit & Cleanup

**Files:**
- Any remaining files with `slate-*` or old dark classes

- [ ] **Step 1: Search for any remaining old classes**

```bash
grep -rn "slate-900\|slate-800\|slate-700\|bg-gray-900\|bg-gray-800" --include="*.tsx" .
```

Fix any remaining instances.

- [ ] **Step 2: Accessibility check**

Verify in browser:
- Tab through the sidebar — all items focusable with visible ring
- Tab through bottom nav on mobile — all tabs focusable
- All modals: Escape closes, focus trapped inside
- All form inputs: labels visible and associated

- [ ] **Step 3: Responsive check**

Test at 375px, 768px, 1024px, 1440px:
- No horizontal scroll at any breakpoint
- Bottom nav visible < 768px, hidden ≥ 768px
- Sidebar visible ≥ 768px (icon-only), full ≥ 1024px
- Top bar visible < 1024px

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(redesign): final polish, remove remaining legacy dark classes"
```

---

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-03-23-ui-ux-redesign.md`.

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
