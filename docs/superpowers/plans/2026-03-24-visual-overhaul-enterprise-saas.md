# RadioPlan AI — Enterprise SaaS Mobile Visual Overhaul

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. For each implementation task, invoke `frontend-design:frontend-design` to guide aesthetic execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visual layer of RadioPlan AI with the Enterprise SaaS Mobile design system (Indigo #4F46E5 / Violet #7C3AED, Plus Jakarta Sans, colored shadows, pill buttons, floating labels) — keeping all existing logic, routing, and data untouched.

**Architecture:** All changes are confined to `.worktrees/redesign/` on `feature/redesign` branch. Token system in `tailwind.config.js` + `src/index.css` drives everything. Components receive new class names only — zero prop/logic changes.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 3, Vaul (bottom sheets), Lucide React icons, Plus Jakarta Sans (Google Fonts).

---

## Design System Reference

All tasks below implement this token spec from the ui-ux-pro-max Enterprise SaaS Mobile template:

```
Colors:
  --color-bg:        #F8FAFC   (app background)
  --color-surface:   #FFFFFF   (card/panel background)
  --color-text:      #0F172A   (primary text)
  --color-muted:     #64748B   (secondary text)
  --color-primary:   #4F46E5   (Indigo)
  --color-secondary: #7C3AED   (Violet)
  --color-success:   #10B981
  --color-warning:   #F59E0B
  --color-danger:    #DC2626
  --color-border:    #E2E8F0

Radii:
  --radius-card:   16px
  --radius-btn:    999px  (pill, primary CTAs)
  --radius-btn-sm: 8px    (secondary buttons)
  --radius-input:  8px
  --radius-badge:  999px

Shadows:
  --shadow-card:  0 1px 3px rgba(79,70,229,0.06), 0 4px 16px rgba(79,70,229,0.08)
  --shadow-modal: 0 8px 40px rgba(79,70,229,0.18)

Typography (Plus Jakarta Sans only):
  800 ExtraBold → page/screen titles
  700 Bold      → section headers
  600 SemiBold  → card titles, buttons, labels
  400 Regular   → body text, inputs
  line-height headings: 1.1–1.2
  line-height body:     1.4–1.5

Gradient:
  --gradient-primary: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)

Press animation: scale(0.97) 150ms ease-out
Skeleton pulse: Indigo/Slate tint (#EEF2FF → #E0E7FF)
```

---

## File Map

| File | Change |
|------|--------|
| `.worktrees/redesign/tailwind.config.js` | Replace all tokens with Enterprise SaaS Mobile spec + Plus Jakarta Sans |
| `.worktrees/redesign/index.html` | Replace Google Fonts link with Plus Jakarta Sans |
| `.worktrees/redesign/src/index.css` | Update CSS variables, skeleton animation, scrollbar, body reset |
| `.worktrees/redesign/src/components/ui/Button.tsx` | Pill gradient primary, 8px secondary, scale press animation |
| `.worktrees/redesign/src/components/ui/Badge.tsx` | 999px radius, updated color map |
| `.worktrees/redesign/src/components/ui/Card.tsx` | 16px radius, colored Indigo shadow |
| `.worktrees/redesign/src/components/ui/Skeleton.tsx` | Indigo tint pulse |
| `.worktrees/redesign/src/components/ui/EmptyState.tsx` | Updated spacing/typography |
| `.worktrees/redesign/components/StatCard.tsx` | ExtraBold 800 value, Indigo icon bg, colored shadow |
| `.worktrees/redesign/components/Sidebar.tsx` | Deep navy bg, Indigo→Violet gradient active item |
| `.worktrees/redesign/components/BottomNav.tsx` | Indigo active indicator + gradient active icon color |
| `.worktrees/redesign/components/TopBar.tsx` | White bg, Plus Jakarta Sans SemiBold title |
| `.worktrees/redesign/components/NotificationBell.tsx` | Updated button style |
| `.worktrees/redesign/components/DoctorBadge.tsx` | Gradient avatar initials circle |
| `.worktrees/redesign/components/PersonalAgendaMonth.tsx` | Legacy gray/slate class cleanup |
| `.worktrees/redesign/pages/Login.tsx` | Floating label inputs, pill gradient CTA |
| `.worktrees/redesign/pages/Dashboard.tsx` | ExtraBold titles, 2-col stat grid on mobile |
| `.worktrees/redesign/pages/Planning.tsx` | Indigo today column, colored header |
| `.worktrees/redesign/components/PersonalAgendaWeek.tsx` | Indigo timeline markers |
| `.worktrees/redesign/pages/Activities.tsx` | Colored left-border indicators on cards |
| `.worktrees/redesign/pages/Profile.tsx` | Clean section cards, SemiBold labels |
| `.worktrees/redesign/pages/Configuration.tsx` | Indigo underline tabs, pill toggles |
| `.worktrees/redesign/pages/DataAdministration.tsx` | Badge-heavy table, card fallback on mobile |
| `.worktrees/redesign/pages/admin/TeamManagement.tsx` | Same as DataAdministration |
| `.worktrees/redesign/pages/admin/RoleManagement.tsx` | Same as DataAdministration |
| `.worktrees/redesign/pages/MonPlanning.tsx` | Legacy gray/slate token cleanup + typography update |
| `.worktrees/redesign/components/SlotDetailsModal.tsx` | Gradient header strip, pill confirm |
| `.worktrees/redesign/components/ConflictResolverModal.tsx` | Same as SlotDetailsModal |
| `.worktrees/redesign/components/RcpExceptionModal.tsx` | Same as SlotDetailsModal |
| `.worktrees/redesign/components/AbsenceConflictsModal.tsx` | Same as SlotDetailsModal |

---

## Tasks

### Task 1: Design Tokens — tailwind.config.js + index.css + index.html

**Files:**
- Modify: `.worktrees/redesign/tailwind.config.js`
- Modify: `.worktrees/redesign/src/index.css`
- Modify: `.worktrees/redesign/index.html`

> **INVOKE frontend-design skill before implementing this task** for aesthetic execution guidance on the token system.

- [ ] **Step 1: Update tailwind.config.js**

Replace the entire `extend` block with:

```js
extend: {
  colors: {
    primary:   { DEFAULT: '#4F46E5', hover: '#4338CA', light: '#EEF2FF' },
    secondary: { DEFAULT: '#7C3AED', hover: '#6D28D9' },
    success:   { DEFAULT: '#10B981', light: '#D1FAE5' },
    warning:   { DEFAULT: '#F59E0B', light: '#FEF3C7' },
    danger:    { DEFAULT: '#DC2626', light: '#FEE2E2' },
    'app-bg':  '#F8FAFC',
    surface:   '#FFFFFF',
    border:    '#E2E8F0',
    muted:     '#F8FAFC',
    'text-base': '#0F172A',
    'text-muted': '#64748B',
  },
  fontFamily: {
    sans:    ['"Plus Jakarta Sans"', 'sans-serif'],
    heading: ['"Plus Jakarta Sans"', 'sans-serif'],
    body:    ['"Plus Jakarta Sans"', 'sans-serif'],
  },
  spacing: {
    sidebar:           '240px',
    'sidebar-collapsed': '64px',
    'top-bar':         '56px',
    'bottom-nav':      '64px',
  },
  borderRadius: {
    card:    '16px',
    btn:     '999px',
    'btn-sm': '8px',
    input:   '8px',
    badge:   '999px',
    modal:   '20px',
  },
  boxShadow: {
    card:       '0 1px 3px rgba(79,70,229,0.06), 0 4px 16px rgba(79,70,229,0.08)',
    'card-hover': '0 4px 24px rgba(79,70,229,0.14)',
    modal:      '0 8px 40px rgba(79,70,229,0.18)',
  },
  zIndex: {
    sticky:        '10',
    'table-header':'11',  // above sticky left column (z-sticky:10) during dual-axis scroll
    sidebar:       '20',
    topbar:        '30',
    bottomnav:     '40',
    modal:         '50',
    toast:         '60',
  },
  backgroundImage: {
    'gradient-primary': 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
    'gradient-primary-r': 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
  },
},
```

- [ ] **Step 2: Update src/index.css**

Replace `:root` variables and add skeleton animation:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-primary:   #4F46E5;
  --color-secondary: #7C3AED;
  --color-success:   #10B981;
  --color-warning:   #F59E0B;
  --color-danger:    #DC2626;
  --color-bg:        #F8FAFC;
  --color-surface:   #FFFFFF;
  --color-border:    #E2E8F0;
  --color-text:      #0F172A;
  --color-muted-fg:  #64748B;
  --header-height:   56px;
  --bottom-nav-height: 64px;
  --gradient-primary: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
}

@layer base {
  body {
    @apply bg-app-bg text-text-base font-sans antialiased;
    font-family: 'Plus Jakarta Sans', sans-serif;
  }
  *:focus-visible {
    outline: 2px solid #4F46E5;
    outline-offset: 2px;
  }
}

@layer utilities {
  .gradient-primary {
    background: var(--gradient-primary);
  }
  .text-gradient-primary {
    background: var(--gradient-primary);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .press-scale {
    transition: transform 150ms ease-out;
  }
  .press-scale:active {
    transform: scale(0.97);
  }
}

/* Skeleton shimmer — Indigo tint */
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #EEF2FF 25%, #E0E7FF 50%, #EEF2FF 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

/* Scrollbar */
::-webkit-scrollbar       { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #F8FAFC; }
::-webkit-scrollbar-thumb { background: #C7D2FE; border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: #4F46E5; }

/* Floating label input */
.float-label-wrapper { @apply relative; }
.float-label-input {
  @apply w-full h-14 px-4 pt-5 pb-1 rounded-input border border-border bg-surface
         text-text-base text-sm focus:outline-none focus:border-primary
         transition-colors duration-150;
}
.float-label-text {
  @apply absolute left-4 text-text-muted pointer-events-none
         transition-all duration-150;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.875rem;
}
.float-label-input:focus ~ .float-label-text,
.float-label-input:not(:placeholder-shown) ~ .float-label-text {
  top: 0.5rem;
  transform: translateY(0);
  font-size: 0.65rem;
  @apply text-primary font-semibold;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; background: #EEF2FF; }
  .press-scale:active { transform: none; }
}

@media print {
  .print\\:hidden { display: none !important; }
}
```

- [ ] **Step 3: Update index.html fonts**

Replace the Google Fonts `<link>` with:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
```

- [ ] **Step 4: Commit**

```bash
cd .worktrees/redesign
git add tailwind.config.js src/index.css index.html
git commit -m "feat(tokens): Enterprise SaaS Mobile design system — Indigo/Violet + Plus Jakarta Sans"
```

---

### Task 2: UI Primitives — Button + Badge

**Files:**
- Modify: `.worktrees/redesign/src/components/ui/Button.tsx`
- Modify: `.worktrees/redesign/src/components/ui/Badge.tsx`

> **INVOKE frontend-design skill before implementing this task.**

- [ ] **Step 1: Rewrite Button.tsx**

```tsx
import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
}

const variants: Record<string, string> = {
  primary:   'bg-gradient-primary text-white shadow-card hover:shadow-card-hover',
  secondary: 'bg-surface text-primary border border-primary/30 hover:bg-primary/5',
  ghost:     'bg-transparent text-text-muted hover:bg-muted hover:text-text-base',
  danger:    'bg-danger text-white hover:bg-red-700',
};

const sizes: Record<string, string> = {
  sm: 'h-8  px-4  text-xs  font-semibold rounded-btn-sm',
  md: 'h-11 px-6  text-sm  font-semibold rounded-btn',
  lg: 'h-14 px-8  text-base font-semibold rounded-btn',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      {...props}
      disabled={isDisabled}
      aria-busy={loading}
      className={[
        'inline-flex items-center justify-center gap-2 cursor-pointer',
        'transition-all duration-150 press-scale',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      ].join(' ')}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Rewrite Badge.tsx**

```tsx
import React from 'react';

type BadgeVariant = 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'gray';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  green:  'bg-success/10 text-emerald-700 ring-1 ring-success/20',
  red:    'bg-danger/10  text-red-700     ring-1 ring-danger/20',
  amber:  'bg-warning/10 text-amber-700   ring-1 ring-warning/20',
  blue:   'bg-primary/10 text-indigo-700  ring-1 ring-primary/20',
  violet: 'bg-secondary/10 text-violet-700 ring-1 ring-secondary/20',
  gray:   'bg-border     text-text-muted  ring-1 ring-border',
};

const dots: Record<BadgeVariant, string> = {
  green: 'bg-success', red: 'bg-danger', amber: 'bg-warning',
  blue: 'bg-primary', violet: 'bg-secondary', gray: 'bg-text-muted',
};

export function Badge({ variant = 'gray', children, dot = false, className = '' }: BadgeProps) {
  return (
    <span className={[
      'inline-flex items-center gap-1.5 px-2.5 py-0.5',
      'text-xs font-semibold rounded-badge',
      variants[variant],
      className,
    ].join(' ')}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dots[variant]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd .worktrees/redesign
git add src/components/ui/Button.tsx src/components/ui/Badge.tsx
git commit -m "feat(ui): pill gradient Button + ring Badge with Indigo/Violet tokens"
```

---

### Task 3: UI Primitives — Card + Skeleton + EmptyState

**Files:**
- Modify: `.worktrees/redesign/src/components/ui/Card.tsx`
- Modify: `.worktrees/redesign/src/components/ui/Skeleton.tsx`
- Modify: `.worktrees/redesign/src/components/ui/EmptyState.tsx`

> **INVOKE frontend-design skill before implementing this task.**

- [ ] **Step 1: Rewrite Card.tsx**

```tsx
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}
interface CardHeaderProps { children: React.ReactNode; className?: string; }
interface CardTitleProps  { children: React.ReactNode; as?: 'h2'|'h3'|'h4'; className?: string; }
interface CardBodyProps   { children: React.ReactNode; className?: string; }

export function Card({ children, className = '', hover = false, onClick }: CardProps) {
  const interactive = hover || !!onClick;
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); } : undefined}
      className={[
        'bg-surface rounded-card shadow-card border border-border/40',
        interactive ? 'cursor-pointer hover:shadow-card-hover press-scale transition-shadow' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`px-5 pt-5 pb-0 flex items-center justify-between ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, as: Tag = 'h3', className = '' }: CardTitleProps) {
  return (
    <Tag className={`text-sm font-bold text-text-base tracking-tight ${className}`}>
      {children}
    </Tag>
  );
}

export function CardBody({ children, className = '' }: CardBodyProps) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}
```

- [ ] **Step 2: Rewrite Skeleton.tsx**

```tsx
import React from 'react';

interface SkeletonProps {
  className?: string;
  rounded?: boolean;
}

export function Skeleton({ className = '', rounded = false }: SkeletonProps) {
  return (
    <div
      className={['skeleton', rounded ? 'rounded-full' : 'rounded-btn-sm', className].join(' ')}
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 3: Rewrite EmptyState.tsx**

```tsx
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-card bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-primary" aria-hidden="true" />
      </div>
      <p className="text-base font-bold text-text-base mb-1">{title}</p>
      {description && <p className="text-sm text-text-muted max-w-xs mb-5">{description}</p>}
      {action && (
        <Button size="sm" onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd .worktrees/redesign
git add src/components/ui/Card.tsx src/components/ui/Skeleton.tsx src/components/ui/EmptyState.tsx
git commit -m "feat(ui): Card colored shadow 16px, Skeleton Indigo pulse, EmptyState updated"
```

---

### Task 4: StatCard

**Files:**
- Modify: `.worktrees/redesign/components/StatCard.tsx`

> **INVOKE frontend-design skill before implementing this task.**

- [ ] **Step 1: Rewrite StatCard.tsx**

```tsx
import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  color?: 'blue' | 'violet' | 'green' | 'amber' | 'red';
  trend?: { value: number; label: string };
}

const colorMap = {
  blue:   { bg: 'bg-primary/10',   icon: 'text-primary',   ring: 'ring-primary/20' },
  violet: { bg: 'bg-secondary/10', icon: 'text-secondary',  ring: 'ring-secondary/20' },
  green:  { bg: 'bg-success/10',   icon: 'text-success',    ring: 'ring-success/20' },
  amber:  { bg: 'bg-warning/10',   icon: 'text-amber-600',  ring: 'ring-warning/20' },
  red:    { bg: 'bg-danger/10',    icon: 'text-danger',     ring: 'ring-danger/20' },
};

export default function StatCard({ icon: Icon, value, label, color = 'blue', trend }: StatCardProps) {
  const c = colorMap[color];
  return (
    <div className="bg-surface rounded-card shadow-card border border-border/40 p-5 flex items-start gap-4 press-scale">
      <div className={`w-11 h-11 rounded-card ${c.bg} ring-1 ${c.ring} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${c.icon}`} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-extrabold text-text-base leading-tight tracking-tight">{value}</p>
        <p className="text-xs font-medium text-text-muted mt-0.5 leading-snug">{label}</p>
        {trend && (
          <p className={`text-xs font-semibold mt-1 ${trend.value >= 0 ? 'text-success' : 'text-danger'}`}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd .worktrees/redesign
git add components/StatCard.tsx
git commit -m "feat(statcard): ExtraBold 800 value, Indigo icon ring, colored shadow"
```

---

### Task 5: Sidebar — Deep Navy + Indigo Gradient Active

**Files:**
- Modify: `.worktrees/redesign/components/Sidebar.tsx`

> **INVOKE frontend-design skill before implementing this task.** The sidebar should have a deep navy `#0F172A` background (from the B2B Service palette) with a white logo area, white icon+label navigation items, and an Indigo→Violet gradient pill on the active item. This creates the "clinical authority" distinction.

- [ ] **Step 0: Read the full Sidebar.tsx**

```bash
cat .worktrees/redesign/components/Sidebar.tsx
```

Identify where the `isActive`/NavLink conditional className logic lives. For each nav item, there will be a conditional expression like `isActive ? 'active-classes' : 'inactive-classes'`. Replace the **entire conditional block** with the snippets below — do NOT append classes to existing strings or you will get duplicate/conflicting Tailwind classes.

- [ ] **Step 1: Apply these styling rules (replacing, not appending, existing className strings):**

Active nav item:
```
className="flex items-center gap-3 px-3 py-2.5 rounded-btn-sm
           bg-gradient-primary text-white font-semibold
           shadow-[0_2px_8px_rgba(79,70,229,0.35)]"
```

Inactive nav item:
```
className="flex items-center gap-3 px-3 py-2.5 rounded-btn-sm
           text-white/60 hover:text-white hover:bg-white/10
           font-medium transition-colors duration-150"
```

Sidebar wrapper:
```
className="hidden md:flex flex-col h-full
           w-sidebar-collapsed lg:w-sidebar
           bg-[#0F172A] border-r border-white/5"
```

Logo area (top of sidebar):
```
className="flex items-center h-14 px-4 border-b border-white/10"
```
Logo text: `text-white font-extrabold text-lg`

Labels: `hidden lg:inline text-sm`

Bottom user section:
```
className="mt-auto border-t border-white/10 p-3"
```
Username: `text-white/70 text-sm font-medium hidden lg:block`

- [ ] **Step 2: Commit**

```bash
cd .worktrees/redesign
git add components/Sidebar.tsx
git commit -m "feat(sidebar): deep navy bg, Indigo gradient active item, clinical authority look"
```

---

### Task 6: BottomNav + TopBar

**Files:**
- Modify: `.worktrees/redesign/components/BottomNav.tsx`
- Modify: `.worktrees/redesign/components/TopBar.tsx`

> **INVOKE frontend-design skill before implementing this task.**

- [ ] **Step 1: Update BottomNav.tsx styling**

Wrapper:
```
className="fixed bottom-0 left-0 right-0 z-bottomnav lg:hidden print:hidden
           bg-surface border-t border-border"
style={{ height: 'calc(64px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
```

Active tab item:
```
className="flex flex-col items-center justify-center gap-0.5 flex-1 pt-2"
```
Active icon: `text-primary` with gradient icon via `style={{ color: '#4F46E5' }}`
Active label: `text-[10px] font-bold text-primary`
Active indicator: add a `<span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-primary" />` bar at top

Inactive tab:
Icon: `text-text-muted`
Label: `text-[10px] font-medium text-text-muted`

- [ ] **Step 2: Update TopBar.tsx styling**

```
className="fixed top-0 left-0 right-0 z-topbar lg:hidden print:hidden
           bg-surface border-b border-border"
style={{ height: '56px', paddingTop: 'env(safe-area-inset-top)' }}
```

Title: `text-base font-bold text-text-base` (Plus Jakarta Sans 700)
Back button: `w-9 h-9 rounded-btn-sm text-text-muted hover:bg-muted`

- [ ] **Step 3: Commit**

```bash
cd .worktrees/redesign
git add components/BottomNav.tsx components/TopBar.tsx
git commit -m "feat(nav): BottomNav Indigo active indicator, TopBar clean white"
```

---

### Task 7: Login Page — Floating Labels + Pill Gradient CTA

**Files:**
- Modify: `.worktrees/redesign/pages/Login.tsx`

> **INVOKE frontend-design skill before implementing this task.**

- [ ] **Step 1: Apply these Login.tsx changes:**

Page wrapper:
```
className="min-h-dvh bg-app-bg flex items-center justify-center p-4"
```

Card:
```
className="w-full max-w-[420px] bg-surface rounded-card shadow-modal border border-border/40 p-8"
```

Header area — logo + title:
```
Logo text: className="text-2xl font-extrabold text-gradient-primary"
Subtitle: className="text-sm text-text-muted mt-1"
```

Email input — use floating label pattern from index.css:
```tsx
<div className="float-label-wrapper">
  <input
    type="email"
    id="email"
    placeholder=" "
    className="float-label-input"
    value={email}
    onChange={e => setEmail(e.target.value)}
  />
  <label htmlFor="email" className="float-label-text">Adresse e-mail</label>
</div>
```

Password input — same pattern + show/hide toggle inside wrapper

Submit button:
```
<Button variant="primary" size="lg" loading={loading} className="w-full mt-2">
  Se connecter
</Button>
```
(Pill gradient, full-width, height 56px)

Error message: `className="text-sm text-danger font-medium bg-danger/5 px-4 py-2.5 rounded-btn-sm"`

- [ ] **Step 2: Commit**

```bash
cd .worktrees/redesign
git add pages/Login.tsx
git commit -m "feat(login): floating label inputs, pill gradient CTA, colored card shadow"
```

---

### Task 8: Dashboard — ExtraBold Headers + 2-Col Stat Grid

**Files:**
- Modify: `.worktrees/redesign/pages/Dashboard.tsx`

> **INVOKE frontend-design skill before implementing this task.**

- [ ] **Step 1: Update Dashboard.tsx page title**

```tsx
<h1 className="text-2xl font-extrabold text-text-base tracking-tight">Tableau de bord</h1>
<p className="text-sm text-text-muted mt-0.5">Bonjour, {user?.name} — {today}</p>
```

- [ ] **Step 2: Stat cards grid**

```
className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4"
```

- [ ] **Step 3: Section cards — use Card/CardHeader/CardTitle/CardBody with updated classes**

CardTitle: `className="text-sm font-bold text-text-base"`

Activity feed items — left border accent:
```
className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0"
```
Activity dot: `className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0"`

- [ ] **Step 4: Commit**

```bash
cd .worktrees/redesign
git add pages/Dashboard.tsx
git commit -m "feat(dashboard): ExtraBold 800 title, 2-col stat grid, Indigo activity dots"
```

---

### Task 9: Planning Global — Indigo Today Column + Colored Header

**Files:**
- Modify: `.worktrees/redesign/pages/Planning.tsx`

> **INVOKE frontend-design skill before implementing this task.**

- [ ] **Step 1: Update header row styles**

Sticky header row: `className="sticky top-0 z-table-header bg-[#0F172A]"` — uses the `table-header` token (value 11, defined in Task 1) to sit above the sticky left column (`z-sticky` = 10) during dual-axis scroll
Header cell default: `className="text-xs font-semibold text-white/60 uppercase tracking-wider px-3 py-3 min-w-[80px]"`
Header cell TODAY: `className="text-xs font-bold text-white uppercase tracking-wider px-3 py-3 min-w-[80px] bg-gradient-primary rounded-t-btn-sm"`

- [ ] **Step 2: Update first column sticky cell**

```
className="sticky left-0 z-sticky bg-surface border-r border-border font-semibold text-text-base text-sm px-3 py-2"
```

- [ ] **Step 3: Update slot cells background**

Occupied slot: `className="m-0.5 rounded-btn-sm text-xs font-semibold px-2 py-1.5 bg-primary/10 text-primary border border-primary/20"`
Empty slot: `className="m-0.5 rounded-btn-sm text-xs text-text-muted px-2 py-1.5 hover:bg-muted cursor-pointer"`
Conflict slot: `className="m-0.5 rounded-btn-sm text-xs font-semibold px-2 py-1.5 bg-danger/10 text-danger border border-danger/20"`

- [ ] **Step 4: Commit**

```bash
cd .worktrees/redesign
git add pages/Planning.tsx
git commit -m "feat(planning): Indigo today column gradient, navy header row, token-based slots"
```

---

### Task 10: Mon Planning — Indigo Timeline Markers

**Files:**
- Modify: `.worktrees/redesign/components/PersonalAgendaWeek.tsx`

> **INVOKE frontend-design skill before implementing this task.**

- [ ] **Step 1: Update mobile day card**

Day header (active/today): `className="text-sm font-bold text-primary"` + `<span className="w-6 h-6 rounded-full bg-gradient-primary text-white text-xs font-bold flex items-center justify-center">`

Time marker dot: `className="w-2 h-2 rounded-full bg-primary/40 flex-shrink-0 mt-1.5"`
Current time indicator: `className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5 ring-2 ring-primary/20"`

Slot button: `className="flex items-center gap-3 w-full text-left py-2.5 px-3 rounded-btn-sm hover:bg-primary/5 press-scale transition-all"`

- [ ] **Step 2: Commit**

```bash
cd .worktrees/redesign
git add components/PersonalAgendaWeek.tsx
git commit -m "feat(agenda): Indigo timeline markers, gradient today dot"
```

---

### Task 11: Activities — Colored Left-Border Cards

**Files:**
- Modify: `.worktrees/redesign/pages/Activities.tsx`

> **INVOKE frontend-design skill before implementing this task.**

- [ ] **Step 1: Update activity list item cards**

List item card base:
```
className="bg-surface rounded-card shadow-card border border-border/40 p-4 flex items-start gap-3
           press-scale cursor-pointer hover:shadow-card-hover transition-shadow"
```

Left color accent (by type):
```tsx
// Add before content:
<div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
  type === 'absence'   ? 'bg-danger' :
  type === 'rcp'       ? 'bg-secondary' :
  type === 'garde'     ? 'bg-warning' : 'bg-primary'
}`} />
```

- [ ] **Step 2: Commit**

```bash
cd .worktrees/redesign
git add pages/Activities.tsx
git commit -m "feat(activities): colored left-border cards, Indigo/Violet/Red accent by type"
```

---

### Task 12: Profile + Configuration

**Files:**
- Modify: `.worktrees/redesign/pages/Profile.tsx`
- Modify: `.worktrees/redesign/pages/Configuration.tsx`

> **INVOKE frontend-design skill before implementing this task.**

- [ ] **Step 1: Profile — section cards**

Section header: `className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3"`
Info row: `className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"`
Label: `className="text-sm font-semibold text-text-base"`
Value: `className="text-sm text-text-muted"`

- [ ] **Step 2: Configuration — Indigo underline tabs**

Tab bar: `className="flex gap-1 border-b-2 border-border overflow-x-auto scrollbar-none -mx-4 px-4"`
Active tab: `className="px-4 py-3 text-sm font-bold text-primary border-b-2 border-primary -mb-0.5 whitespace-nowrap"`
Inactive tab: `className="px-4 py-3 text-sm font-medium text-text-muted hover:text-text-base whitespace-nowrap"`

Form input (non-floating):
```
className="w-full h-11 px-3 rounded-input border border-border bg-surface
           text-text-base text-sm focus:outline-none focus:border-primary
           focus:ring-2 focus:ring-primary/20 transition-colors"
```

- [ ] **Step 3: Commit**

```bash
cd .worktrees/redesign
git add pages/Profile.tsx pages/Configuration.tsx
git commit -m "feat(profile,config): clean section cards, Indigo underline tabs, token inputs"
```

---

### Task 13: Admin Pages — Badge-Heavy Tables

**Files:**
- Modify: `.worktrees/redesign/pages/DataAdministration.tsx`
- Modify: `.worktrees/redesign/pages/admin/TeamManagement.tsx`
- Modify: `.worktrees/redesign/pages/admin/RoleManagement.tsx`

> **INVOKE frontend-design skill before implementing this task.**

- [ ] **Step 1: Table header row**

```
className="sticky top-0 bg-[#0F172A] text-white/60 text-[11px] font-semibold uppercase tracking-widest"
```
Header cell: `className="px-4 py-3 text-left"`

- [ ] **Step 2: Table body rows**

Row: `className="border-b border-border/50 hover:bg-primary/5 transition-colors"`
Cell: `className="px-4 py-3 text-sm text-text-base"`
Name cell: `className="px-4 py-3 text-sm font-semibold text-text-base"`

- [ ] **Step 3: Mobile card per row**

```
className="bg-surface rounded-card shadow-card border border-border/40 p-4 space-y-2"
```
Card title: `className="text-sm font-bold text-text-base"`
Meta row: `className="flex items-center gap-2 flex-wrap"`

- [ ] **Step 4: Commit**

```bash
cd .worktrees/redesign
git add pages/DataAdministration.tsx pages/admin/TeamManagement.tsx pages/admin/RoleManagement.tsx
git commit -m "feat(admin): navy sticky header, Indigo hover rows, card fallback mobile"
```

---

### Task 14: All Modals — Gradient Header + Pill Confirm

**Files:**
- Modify: `.worktrees/redesign/components/SlotDetailsModal.tsx`
- Modify: `.worktrees/redesign/components/ConflictResolverModal.tsx`
- Modify: `.worktrees/redesign/components/RcpExceptionModal.tsx`
- Modify: `.worktrees/redesign/components/AbsenceConflictsModal.tsx`

> **INVOKE frontend-design skill before implementing this task.**

- [ ] **Step 1: Apply to all 4 modals — header strip**

Modal container:
```
className="bg-surface rounded-t-modal md:rounded-modal shadow-modal
           border border-border/40 overflow-hidden"
role="dialog" aria-modal="true"
```

Header strip (replace current header):
```tsx
<div className="bg-gradient-primary px-5 py-4 flex items-center justify-between">
  <h2 id={titleId} className="text-base font-bold text-white">{title}</h2>
  <button
    onClick={onClose}
    aria-label="Fermer"
    className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
  >
    <X className="w-4 h-4" />
  </button>
</div>
```

- [ ] **Step 2: Confirm/submit button in all modals**

Use `<Button variant="primary" size="md">` (pill gradient, auto)
Destructive action: `<Button variant="danger" size="md">`
Cancel: `<Button variant="ghost" size="md">`

- [ ] **Step 3: Drag handle (mobile bottom sheet)**

```tsx
<div className="w-10 h-1 rounded-full bg-border mx-auto mt-3 mb-1 md:hidden" aria-hidden="true" />
```

- [ ] **Step 4: Commit**

```bash
cd .worktrees/redesign
git add components/SlotDetailsModal.tsx components/ConflictResolverModal.tsx \
        components/RcpExceptionModal.tsx components/AbsenceConflictsModal.tsx
git commit -m "feat(modals): gradient header strip, pill confirm button, rounded-modal"
```

---

### Task 15: NotificationBell + DoctorBadge + MonPlanning + Final Polish

**Files:**
- Modify: `.worktrees/redesign/components/NotificationBell.tsx`
- Modify: `.worktrees/redesign/components/DoctorBadge.tsx`
- Modify: `.worktrees/redesign/components/PersonalAgendaMonth.tsx`
- Modify: `.worktrees/redesign/pages/MonPlanning.tsx`

> **INVOKE frontend-design skill before implementing this task.**

- [ ] **Step 1: NotificationBell button**

```
className="w-9 h-9 rounded-btn-sm bg-primary/10 hover:bg-primary/15 text-primary flex items-center justify-center relative"
```
Unread badge dot: `className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-danger border-2 border-surface"`

- [ ] **Step 2: DoctorBadge — Indigo tint**

```tsx
<span
  className="inline-flex items-center justify-center w-6 h-6 rounded-full
             bg-gradient-primary text-white text-[9px] font-bold select-none flex-shrink-0"
  aria-label={`Dr ${name}`}
  title={`Dr ${name}`}
>
  {initials}
</span>
```

- [ ] **Step 3: MonPlanning.tsx — token cleanup + typography**

Read `.worktrees/redesign/pages/MonPlanning.tsx`. Apply the same legacy class replacement as Step 4 below. Additionally update any page title to:
```tsx
<h1 className="text-2xl font-extrabold text-text-base tracking-tight">Mon planning</h1>
```

- [ ] **Step 4: PersonalAgendaMonth — token cleanup**

Replace any remaining `bg-gray-*`, `text-gray-*`, `border-gray-*`, `bg-slate-*`, `text-slate-*` classes:
- `bg-gray-50` / `bg-slate-50` → `bg-muted`
- `text-gray-500` / `text-slate-500` → `text-text-muted`
- `border-gray-200` / `border-slate-200` → `border-border`
- `bg-blue-*` → `bg-primary/10` or `bg-primary`
- `text-blue-*` → `text-primary`

- [ ] **Step 5: Run global token audit in worktree**

```bash
cd .worktrees/redesign
grep -r "bg-gray\|text-gray\|border-gray\|bg-slate\|text-slate\|border-slate" \
  --include="*.tsx" --include="*.ts" --include="*.css" \
  -l 2>/dev/null
```
Expected: no output (zero legacy color classes remaining)

- [ ] **Step 6: Final commit**

```bash
cd .worktrees/redesign
git add components/NotificationBell.tsx components/DoctorBadge.tsx \
        components/PersonalAgendaMonth.tsx pages/MonPlanning.tsx
git commit -m "feat(polish): NotificationBell Indigo, DoctorBadge gradient, MonPlanning + legacy class cleanup"
```

---

## Acceptance Criteria

- [ ] Plus Jakarta Sans renders correctly at all weight levels (400/600/700/800)
- [ ] Indigo→Violet gradient visible on: sidebar active item, Login CTA, modal headers, primary buttons
- [ ] All card shadows are `rgba(79,70,229,*)` — no gray shadows remaining
- [ ] Skeleton shimmer uses Indigo tint (`#EEF2FF` → `#E0E7FF`)
- [ ] Sidebar has deep navy (`#0F172A`) background visible on md+ screens
- [ ] Today column in Planning has gradient header
- [ ] Press animation (scale 0.97) works on buttons and interactive cards
- [ ] Zero `bg-gray-*`, `bg-slate-*`, `text-gray-*`, `text-slate-*` in .tsx files
- [ ] Mobile bottom nav has Indigo active indicator bar at top of active tab
- [ ] All 4 modals have gradient header strip with white title
- [ ] Login floating labels animate correctly on focus and when filled

---

## Execution Notes

- All work in `.worktrees/redesign/` on branch `feature/redesign` — never touch main
- Read each file before editing it
- After each task: check Tailwind class names exist in config before using
- The `press-scale` utility and `float-label-*` classes are defined in `index.css` (Task 1) — they won't work until Task 1 is complete
- The `rounded-modal` token must be added to tailwind.config.js in Task 1
