# Swipe semaine + Persistance surbrillance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter le swipe horizontal pour naviguer entre semaines sur mobile (PersonalAgendaWeek + Planning) et persister l'option de surbrillance dans `profiles.ui_prefs`.

**Architecture:** Hook `useSwipe` réutilisable (stable-ref pattern pour éviter le churn de listeners) attaché sur des zones de swipe dédiées ; persistance surbrillance suit le pattern existant `handleDensityChange` (lecture au mount + écriture optimiste au toggle).

**Tech Stack:** React 19, TypeScript, Supabase (JSONB `ui_prefs`), Tailwind CSS — aucune lib externe.

---

## File Map

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `hooks/useSwipe.ts` | Créer | Hook générique touchstart/touchend avec stable-ref pattern et cooldown 300ms |
| `components/PersonalAgendaWeek.tsx` | Modifier | Ajouter ref sur grille jours + appel useSwipe |
| `pages/Planning.tsx` | Modifier | Ajouter isMobile + zone swipe full-width + useSwipe + persistance surbrillance |

---

## Task 1 : Hook `useSwipe`

**Files:**
- Create: `hooks/useSwipe.ts`

- [ ] **Créer `hooks/useSwipe.ts`**

Notes d'implémentation :
- **Type React 19** : `React.RefObject<HTMLElement>` (sans `| null` — React 19 le gère en interne)
- **Stable-ref pattern** : stocker les callbacks dans des refs pour éviter que le `useEffect` se réinstalle à chaque render (les callbacks inline comme `() => onOffsetChange(weekOffset + 1)` sont recréés à chaque render)

```typescript
import React, { useEffect, useRef } from 'react';

interface SwipeCallbacks {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

/**
 * Détecte un swipe horizontal sur l'élément ref fourni.
 * Seuil : >= 50px horizontal ET ratio horizontal/vertical > 1.5
 * Cooldown 300ms pour éviter sauts multiples en cas de gestes rapides.
 * Stable-ref pattern : les listeners ne sont pas réinstallés à chaque render.
 * Tous les listeners sont passive:true.
 * N'installe les listeners que si `enabled` est true.
 */
export function useSwipe(
  ref: React.RefObject<HTMLElement>,
  { onSwipeLeft, onSwipeRight }: SwipeCallbacks,
  enabled: boolean = true
) {
  // Stable refs pour les callbacks — évite le teardown/reinstall des listeners
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  onSwipeLeftRef.current = onSwipeLeft;
  onSwipeRightRef.current = onSwipeRight;

  const startX = useRef(0);
  const startY = useRef(0);
  const cooldown = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (cooldown.current) return;
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx < 50) return;
      if (absDx / (absDy || 1) < 1.5) return;

      cooldown.current = true;
      setTimeout(() => { cooldown.current = false; }, 300);

      if (dx < 0) onSwipeLeftRef.current?.();
      else onSwipeRightRef.current?.();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  // Seuls `enabled` et `ref` redéclenchent le setup des listeners
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ref]);
}
```

- [ ] **Commit**

```bash
git add hooks/useSwipe.ts
git commit -m "feat: add useSwipe hook — stable-ref pattern, 300ms cooldown"
```

---

## Task 2 : Swipe dans `PersonalAgendaWeek.tsx`

**Files:**
- Modify: `components/PersonalAgendaWeek.tsx`

Le composant a déjà `isMobile` (ligne 230). La grille des jours (mobile) commence à la ligne 462 :
```tsx
<div className="grid grid-cols-5 gap-2">
  {days.map(...)}
</div>
```
On ajoute un `swipeRef` autour de cette grille (nouveau `<div>` wrapper), **en dessous** de la barre nav chevrons (ligne 421).

**Note :** Le ref est sur un bloc conditionnel (`hasAnyActivity || weeklyActivities.length > 0`). Sur une semaine vide, `ref.current` sera `null` et le swipe sera silencieusement désactivé (le hook gère ce cas). Comportement acceptable — une semaine sans activité n'a pas besoin de navigation par swipe.

- [ ] **Ajouter l'import du hook et des hooks React dans PersonalAgendaWeek.tsx**

En haut du fichier, modifier la ligne d'import React pour ajouter `useRef` :
```typescript
// Avant
import React, { useMemo, useContext } from 'react';
// Après
import React, { useMemo, useContext, useRef } from 'react';
```

Puis ajouter l'import du hook :
```typescript
import { useSwipe } from '../hooks/useSwipe';
```

- [ ] **Ajouter le ref et appel du hook après la détection isMobile (ligne ~235)**

```typescript
const swipeRef = useRef<HTMLDivElement>(null);
useSwipe(
  swipeRef as React.RefObject<HTMLElement>,
  {
    onSwipeLeft:  () => onOffsetChange(weekOffset + 1),
    onSwipeRight: () => onOffsetChange(weekOffset - 1),
  },
  isMobile
);
```

- [ ] **Wrapper la grille jours dans un div avec le ref**

Trouver (ligne ~461-462) :
```tsx
{(hasAnyActivity || weeklyActivities.length > 0) && (
  <div className="grid grid-cols-5 gap-2">
    {days.map(...)}
  </div>
)}
```

Remplacer par :
```tsx
{(hasAnyActivity || weeklyActivities.length > 0) && (
  <div ref={swipeRef}>
    <div className="grid grid-cols-5 gap-2">
      {days.map(...)}
    </div>
  </div>
)}
```

- [ ] **Vérifier TypeScript**

```bash
cd "C:\Users\jaste\OneDrive\Bureau\radioplan"
npx tsc --noEmit 2>&1 | head -20
```
Attendu : 0 erreurs.

- [ ] **Commit**

```bash
git add components/PersonalAgendaWeek.tsx
git commit -m "feat: swipe horizontal pour naviguer entre semaines dans MonPlanning"
```

---

## Task 3 : Swipe dans `Planning.tsx`

**Files:**
- Modify: `pages/Planning.tsx`

**Problème** : La table de planning (ligne 975) a `touchAction: pan-x pan-y` pour permettre le scroll horizontal — y attacher le swipe créerait des conflits. La barre nav (ligne 936) est trop étroite (~40px).

**Solution** : Ajouter une zone swipe transparente **full-width** entre la barre de navigation et la grille (`<div ref={swipeRef} className="absolute inset-x-0 h-16 top-0" />` dans un conteneur relatif), ou plus simplement, ajouter un wrapper `div ref` autour du `<Card>` entier (la carte planning) — le card a déjà `flex-1 min-h-0` et occupe toute la hauteur disponible, la zone de swipe sera donc large.

Implémentation retenue : `swipeRef` sur le `<Card>` entier (ligne 973). Le seuil ratio 1.5 empêche les conflits avec le scroll vertical du tableau. Le scroll horizontal interne de la table reste intact car `touchAction: pan-x pan-y` est sur le conteneur scroll interne.

- [ ] **Ajouter import et état isMobile dans Planning.tsx**

Après les imports existants, ajouter :
```typescript
import { useSwipe } from '../hooks/useSwipe';
```

Après la déclaration `showSettings` (ligne ~99), ajouter :
```typescript
const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
useEffect(() => {
  const handler = () => setIsMobile(window.innerWidth < 768);
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);

const weekNavRef = useRef<HTMLDivElement>(null);
useSwipe(
  weekNavRef as React.RefObject<HTMLElement>,
  {
    onSwipeLeft:  () => handleWeekChange('next'),
    onSwipeRight: () => handleWeekChange('prev'),
  },
  isMobile
);
```

Note : `useRef` est déjà importé dans `Planning.tsx`. Vérifier la ligne d'import et ajouter `useState` si pas présent (il l'est déjà).

- [ ] **Ajouter le ref sur le Card du planning (ligne ~973)**

Trouver :
```tsx
{/* Planning grid card */}
<Card className="flex-1 min-h-0 flex flex-col">
```

Remplacer par — vérifier d'abord si `Card` expose un `ref` via `forwardRef` dans `src/components/ui/Card.tsx` :

**Option A — Card n'a pas de forwardRef (wrapper div) :**
```tsx
{/* Planning grid card — swipe zone */}
<div ref={weekNavRef} className="flex-1 min-h-0 flex flex-col">
  <Card className="flex-1 min-h-0 flex flex-col">
    {/* ...contenu existant... */}
  </Card>
</div>
```

Localiser la fermeture `</Card>` correspondante (chercher la ligne `</Card>` dans le return principal) et ajouter `</div>` juste après.

**Option B — Card expose un forwardRef :**
```tsx
<Card ref={weekNavRef} className="flex-1 min-h-0 flex flex-col">
```

- [ ] **Vérifier TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Attendu : 0 erreurs.

- [ ] **Commit**

```bash
git add pages/Planning.tsx
git commit -m "feat: swipe horizontal sur le planning global (mobile) — navigate between weeks"
```

---

## Task 4 : Persistance surbrillance dans `Planning.tsx`

**Files:**
- Modify: `pages/Planning.tsx`

Pattern : `handleDensityChange` (ligne 754) + `loadDensity` useEffect (ligne 81-97).

- [ ] **Fusionner `loadDensity` en `loadPrefs` pour lire aussi `planning_highlight_me`**

Trouver le bloc useEffect (lignes ~81-97) :
```typescript
useEffect(() => {
  if (!user?.id) return;
  const loadDensity = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('ui_prefs')
        .eq('id', user.id)
        .single();
      if (data?.ui_prefs?.planning_density) {
        setDensity(data.ui_prefs.planning_density as 'COMPACT' | 'COMFORTABLE');
      }
    } catch (err) {
      console.error(err);
    }
  };
  loadDensity();
}, [user?.id]);
```

Remplacer par :
```typescript
useEffect(() => {
  if (!user?.id) return;
  const loadPrefs = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('ui_prefs')
        .eq('id', user.id)
        .single();
      if (data?.ui_prefs?.planning_density) {
        setDensity(data.ui_prefs.planning_density as 'COMPACT' | 'COMFORTABLE');
      }
      if (typeof data?.ui_prefs?.planning_highlight_me === 'boolean') {
        setHighlightMe(data.ui_prefs.planning_highlight_me);
      }
    } catch (err) {
      console.error(err);
    }
  };
  loadPrefs();
}, [user?.id]);
```

- [ ] **Ajouter `handleHighlightToggle` après `handleDensityChange` (ligne ~768)**

```typescript
const handleHighlightToggle = async () => {
  const newValue = !highlightMe;
  setHighlightMe(newValue);                   // optimiste
  if (!user?.id) return;
  try {
    const { data, error: fetchError } = await supabase
      .from('profiles').select('ui_prefs').eq('id', user.id).single();
    if (fetchError) throw fetchError;
    const existing = data?.ui_prefs ?? {};
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ ui_prefs: { ...existing, planning_highlight_me: newValue } })
      .eq('id', user.id);
    if (updateError) throw updateError;
  } catch (err) {
    console.error('Failed to persist highlight preference:', err);
  }
};
```

- [ ] **Remplacer le `setHighlightMe` inline par l'appel à `handleHighlightToggle`**

Trouver (ligne ~899) :
```tsx
onClick={() => setHighlightMe(h => !h)}
```

Remplacer par (sans `void` — aligné sur le pattern `handleDensityChange` existant) :
```tsx
onClick={() => handleHighlightToggle()}
```

- [ ] **Vérifier TypeScript + build**

```bash
npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -10
```
Attendu : 0 erreurs TypeScript, build réussi.

- [ ] **Commit**

```bash
git add pages/Planning.tsx
git commit -m "feat: persist highlight-me preference to profiles.ui_prefs (planning_highlight_me)"
```

---

## Task 5 : Push final

- [ ] **Push dans main**

```bash
git push origin main
```

---

## Tests manuels

Après déploiement, vérifier sur mobile (ou DevTools mobile) :

1. **Swipe MonPlanning** : Mon Planning → vue semaine → swiper gauche/droite sur les cartes jours → semaine change
2. **Swipe Planning Global** : Planning → swiper gauche/droite sur la zone carte → semaine change
3. **Cooldown** : swipe répété rapide → change d'1 seule semaine par geste
4. **Surbrillance persistée** : activer surbrillance → fermer l'onglet → rouvrir → toujours active
5. **Surbrillance partagée** : activer sur un appareil → ouvrir sur un autre → toujours active (Supabase)
