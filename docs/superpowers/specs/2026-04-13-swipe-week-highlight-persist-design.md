# Design: Swipe semaine + Persistance surbrillance

**Date:** 2026-04-13
**Statut:** Approuvé

---

## Feature 1 — Swipe horizontal pour naviguer entre semaines (mobile)

### Contexte

`PersonalAgendaWeek.tsx` affiche la vue semaine du planning. La navigation entre semaines se fait uniquement via des boutons chevron gauche/droite. Ce composant est utilisé par `MonPlanning.tsx` (vue personnelle) et `Planning.tsx` (planning global). Sur mobile, le swipe est le geste naturel attendu.

### Solution

Créer un hook `useSwipe(ref, { onSwipeLeft, onSwipeRight })` dans `hooks/useSwipe.ts`.

**Mécanisme :**
- Écoute `touchstart`, `touchmove`, `touchend` sur le `ref` fourni
- Seuil de déclenchement : déplacement horizontal >= 50px ET ratio horizontal/vertical > 1.5 (évite les conflits avec le scroll vertical)
- `touchmove` avec `passive: true` pour ne pas bloquer le scroll natif
- Aucune lib externe

**Intégration :**
- Dans `PersonalAgendaWeek.tsx` : wrapper `ref` sur le conteneur de la grille jours
- `onSwipeLeft` → `onOffsetChange(weekOffset + 1)` (semaine suivante)
- `onSwipeRight` → `onOffsetChange(weekOffset - 1)` (semaine précédente)
- Actif uniquement quand `isMobile` est `true` (détection déjà en place via `window.innerWidth < 768`)
- Pas d'animation de transition — le contenu se recharge comme avec les boutons

**Fichiers impactés :**
- `hooks/useSwipe.ts` (nouveau)
- `components/PersonalAgendaWeek.tsx` (ajout ref + appel hook)

---

## Feature 2 — Persistance de la surbrillance (ui_prefs)

### Contexte

Le toggle "Me mettre en surbrillance" dans `Planning.tsx` (ligne 100) utilise `useState(false)`. L'état est perdu à chaque refresh ou changement de page. Le pattern de persistance existe déjà pour `density` via `profiles.ui_prefs` (champ JSONB).

### Solution

Suivre le pattern exact de `handleDensityChange` :

**Lecture au chargement :**
- `Planning.tsx` lit déjà `ui_prefs` pour `density` (via `useEffect` existant)
- Ajouter la lecture de `ui_prefs.planning_highlight_me` dans le même `useEffect`
- Initialiser `highlightMe` avec la valeur lue (défaut `false`)

**Écriture au toggle :**
- Au clic sur le bouton de surbrillance, sauvegarder dans Supabase :
  ```
  profiles.ui_prefs = { ...existing, planning_highlight_me: newValue }
  ```
- Mise à jour optimiste (setState immédiat, persist async)

**Clé JSONB :** `planning_highlight_me` (cohérent avec `planning_density`)

**Aucun changement de schema** — `ui_prefs` est un JSONB libre.

**Fichiers impactés :**
- `pages/Planning.tsx` (lecture + écriture `planning_highlight_me`)

---

## Hors périmètre

- Animation de swipe (slide/fade entre semaines)
- Persistance des autres préférences du panel settings (view mode, color mode)
- Swipe sur la vue mois
