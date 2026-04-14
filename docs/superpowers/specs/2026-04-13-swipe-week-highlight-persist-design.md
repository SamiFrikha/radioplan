# Design: Swipe semaine + Persistance surbrillance

**Date:** 2026-04-13
**Statut:** Approuvé (v2 — post spec-review)

---

## Feature 1 — Swipe horizontal pour naviguer entre semaines (mobile)

### Contexte

Deux composants affichent une vue semaine avec navigation par boutons chevron :

1. **`PersonalAgendaWeek.tsx`** — utilisé par `MonPlanning.tsx` (vue personnelle). Prop `onOffsetChange(weekOffset)`.
2. **`Planning.tsx`** — planning global, grille semaine propre avec `handleWeekChange(direction: 'prev' | 'next')`. **Note :** Planning.tsx n'a pas de détection `isMobile` — il faudra l'ajouter.

Ce sont deux implémentations indépendantes. Le swipe doit être intégré dans les deux.

### Solution

Créer un hook réutilisable `useSwipe(ref, callbacks)` dans `hooks/useSwipe.ts`.

**Mécanisme du hook :**
- Écoute `touchstart`, `touchmove`, `touchend` sur le `ref` fourni
- Tous les listeners en `{ passive: true }` (pas besoin de `preventDefault`)
- Seuil : déplacement horizontal >= 50px ET ratio horizontal/vertical > 1.5
- **Cooldown de 300ms** après chaque swipe déclenché pour éviter les sauts de plusieurs semaines en cas de gestes rapides
- Nettoyage automatique des listeners dans le cleanup du `useEffect`

**Intégration PersonalAgendaWeek.tsx :**
- Ajouter un `<div ref={swipeRef}>` wrapper autour des cartes jours (la map `days.map(...)`) — ce wrapper n'existe pas actuellement, les cartes sont enfants directs du `<div className="space-y-4">`. Ne PAS inclure la barre de navigation chevrons dans ce wrapper.
- `onSwipeLeft` → `onOffsetChange(weekOffset + 1)`
- `onSwipeRight` → `onOffsetChange(weekOffset - 1)`
- Hook appelé uniquement quand `isMobile === true` (détection existante via `window.innerWidth < 768`)

**Intégration Planning.tsx :**
- `ref` placé sur le conteneur de la grille planning mobile
- `onSwipeLeft` → `handleWeekChange('next')`
- `onSwipeRight` → `handleWeekChange('prev')`
- Ajouter une détection `isMobile` (state + resize listener, même pattern que `PersonalAgendaWeek.tsx` lignes 230-235). Hook appelé uniquement quand `isMobile === true`.

**Pas d'animation de transition** — le contenu se recharge comme avec les boutons existants.

**Fichiers impactés :**
- `hooks/useSwipe.ts` (nouveau)
- `components/PersonalAgendaWeek.tsx` (ajout ref + appel hook)
- `pages/Planning.tsx` (ajout ref + appel hook sur la vue mobile)

---

## Feature 2 — Persistance de la surbrillance (ui_prefs)

### Contexte

Le toggle "Me mettre en surbrillance" dans `Planning.tsx` (state `highlightMe` déclaré ligne ~100, bouton UI ligne ~899) utilise `useState(false)`. L'état est perdu au refresh. Le pattern de persistance existe déjà pour `density` via `profiles.ui_prefs` (JSONB).

### Solution

Suivre le pattern exact de `handleDensityChange` :

**Lecture au chargement :**
- `Planning.tsx` lit déjà `ui_prefs` pour `density` (via `useEffect` existant)
- Ajouter la lecture de `ui_prefs.planning_highlight_me` dans le même `useEffect`
- Initialiser `highlightMe` avec la valeur lue (défaut `false`)
- **Guard :** vérifier `user?.id` avant la requête (comme pour density)

**Écriture au toggle :**
- Au clic, `setState` immédiat (optimiste), puis persist async :
  ```
  profiles.ui_prefs = { ...existing, planning_highlight_me: newValue }
  ```
- **Guard :** `if (!user?.id) return` (comme `handleDensityChange`)
- **En cas d'erreur Supabase :** `console.error` sans rollback (comportement identique au pattern existant de `handleDensityChange`)

**Clé JSONB :** `planning_highlight_me` (cohérent avec `planning_density`)

**Aucun changement de schema** — `ui_prefs` est un JSONB libre.

**Fichiers impactés :**
- `pages/Planning.tsx` (lecture + écriture `planning_highlight_me`)

---

## Hors périmètre

- Animation de swipe (slide/fade entre semaines)
- Persistance des autres préférences du panel settings (view mode, color mode)
- Swipe sur la vue mois
- Swipe sur tablettes/laptops tactiles (> 768px) — le hook est conditionné à `isMobile`
