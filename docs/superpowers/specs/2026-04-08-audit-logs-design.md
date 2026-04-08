# Design Spec — Audit Logs (Journal d'activité)

**Date :** 2026-04-08
**Statut :** Approuvé
**Approche :** Option A — Extension directe de l'infrastructure existante

---

## Contexte

RadioPlan dispose déjà d'un `activityLogService.ts` qui logue les actions de la page Activités vers Supabase (table `activity_logs`) avec fallback localStorage. Un panel log existe dans Activities.tsx mais est limité (filtre semaine/tout, pas de filtres avancés, pas accessible depuis la sidebar).

**Objectif :** Étendre ce système pour couvrir toute l'application et créer une page dédiée accessible aux admins depuis la barre latérale.

---

## Accès

- **Admin uniquement** — la page `/logs` est visible dans la sidebar uniquement si `isAdmin === true`
- Redirection vers `/` si accès non autorisé
- Les médecins ne voient pas leurs propres logs

---

## Section 1 : Architecture & données

### Évolution du schéma Supabase

Deux colonnes ajoutées à la table `activity_logs` :

```sql
ALTER TABLE activity_logs
  ADD COLUMN category TEXT,
  ADD COLUMN target_date TEXT;

CREATE INDEX idx_activity_logs_category_timestamp
  ON activity_logs (category, timestamp DESC);
```

- `category` : groupe d'action (`ACTIVITES`, `RCP`, `ABSENCE`, `REMPLACEMENT`, `PLANNING`, `PROFIL`, `CONFIG`)
- `target_date` : date YYYY-MM-DD concernée par l'action (nullable pour les actions sans date précise)

### Évolution de `ActivityLogEntry` (types + service)

```ts
interface ActivityLogEntry {
  // ... champs existants ...
  category?: string;    // Nouveau
  targetDate?: string;  // Nouveau
}
```

### Nouveaux types d'actions

| Catégorie | Codes d'action |
|---|---|
| `ACTIVITES` | `MANUAL_ASSIGN`, `AUTO_RECALCULATE`, `VALIDATE_WEEK`, `UNVALIDATE_WEEK`, `CLEAR_CHOICES`, `WEEKLY_ASSIGN`, `CREATE_ACTIVITY`, `DELETE_ACTIVITY`, `EDIT_ACTIVITY` *(existants)* |
| `RCP` | `RCP_PRESENT`, `RCP_ABSENT`, `RCP_CANCEL`, `RCP_EXCEPTION` |
| `ABSENCE` | `ABSENCE_DECLARE`, `ABSENCE_DELETE` |
| `REMPLACEMENT` | `REPLACEMENT_REQUEST`, `REPLACEMENT_ACCEPT`, `REPLACEMENT_REJECT` |
| `PLANNING` | `PLANNING_ASSIGN`, `CONSULT_MODIFY`, `ACTIVITY_MODIFY`, `SLOT_CLOSE`, `CONFLICT_RESOLVE` |
| `PROFIL` | `PROFILE_UPDATE`, `AVATAR_UPDATE`, `NOTIF_PREFS_UPDATE` |
| `CONFIG` | `DOCTOR_CREATE`, `DOCTOR_UPDATE`, `DOCTOR_DELETE`, `TEMPLATE_UPDATE`, `SETTINGS_UPDATE` |

### Purge automatique (6 mois)

Nouvelle méthode dans `activityLogService.ts` :
```ts
async purgeOldLogs(): Promise<void>
```
Appelée au montage de la page `/logs`. Supprime les entrées dont `timestamp < now - 6 months`.

### Évolution de `getLogs()`

Nouveaux paramètres de filtre :
```ts
getLogs(filters: {
  weekKey?: string;
  doctorName?: string;
  category?: string;
  dateFrom?: string;  // YYYY-MM-DD
  dateTo?: string;    // YYYY-MM-DD
  limit?: number;
}): Promise<ActivityLogEntry[]>
```

---

## Section 2 : Page Logs (`/logs`)

### Layout

```
┌─────────────────────────────────────────────┐
│ 📋 Logs d'activité          [Export CSV] [🔄]│
├─────────────────────────────────────────────┤
│ [Médecin ▼] [Catégorie ▼] [Du __] [Au __] [✕]│
├─────────────────────────────────────────────┤
│ 247 entrées trouvées                         │
├──────────┬────────────┬──────┬──────────────┤
│ Date/H   │ Médecin    │ Cat. │ Description  │
└──────────┴────────────┴──────┴──────────────┘
[← 1 2 3 ... →]
```

### Filtres

- **Médecin** : dropdown avec tous les médecins + "Tous"
- **Catégorie** : `Tous / Activités / RCP / Absences / Remplacements / Planning / Profil / Config`
- **Date de / Date à** : champs date (défaut : 30 derniers jours)
- **✕ Réinitialiser** : remet tous les filtres à zéro

### Tableau

- Colonnes : Date & heure | Médecin | Catégorie (badge coloré) | Description lisible
- Tri : du plus récent au plus ancien
- Pagination : 50 entrées par page
- Mobile : date + description (médecin en sous-titre, catégorie en badge)

### Export CSV

- Bouton en haut à droite
- Exporte **tous les résultats filtrés** (pas seulement la page courante)
- Colonnes : `Date,Heure,Médecin,Email,Catégorie,Action,Description,Détails`
- Nom du fichier : `radioplan-logs-YYYY-MM-DD.csv`

---

## Section 3 : Câblage par fichier

| Fichier | Actions ajoutées |
|---|---|
| `Profile.tsx` | `RCP_PRESENT`, `RCP_ABSENT`, `RCP_CANCEL`, `RCP_EXCEPTION`, `ABSENCE_DECLARE`, `ABSENCE_DELETE`, `PROFILE_UPDATE`, `AVATAR_UPDATE` |
| `ConflictResolverModal.tsx` | `REPLACEMENT_REQUEST`, `CONFLICT_RESOLVE`, `SLOT_CLOSE`, `RCP_PRESENT`, `RCP_ABSENT` |
| `Planning.tsx` | `PLANNING_ASSIGN`, `CONFLICT_RESOLVE` |
| `replacementService.ts` | `REPLACEMENT_ACCEPT`, `REPLACEMENT_REJECT` |
| `TeamManagement.tsx` | `DOCTOR_CREATE`, `DOCTOR_UPDATE`, `DOCTOR_DELETE` |
| `Configuration.tsx` | `TEMPLATE_UPDATE`, `SETTINGS_UPDATE` |
| `Activities.tsx` | Ajouter `category: 'ACTIVITES'` aux logs existants |

### Sidebar

- `Sidebar.tsx` : ajouter entrée `/logs` avec icône `ScrollText`, visible si `isAdmin`
- `BottomNav.tsx` : idem pour mobile
- `App.tsx` : ajouter la route `/logs` → `<LogsPage />`

---

## Fichiers créés / modifiés

**Créés :**
- `pages/Logs.tsx` — nouvelle page admin

**Modifiés :**
- `services/activityLogService.ts` — nouveaux filtres, purge, category/targetDate
- `types.ts` — ActivityLogEntry étendu
- `components/Sidebar.tsx` — entrée Logs
- `components/BottomNav.tsx` — entrée Logs mobile
- `App.tsx` — route /logs
- `pages/Profile.tsx` — câblage logs
- `components/ConflictResolverModal.tsx` — câblage logs
- `pages/Planning.tsx` — câblage logs
- `services/replacementService.ts` — câblage logs
- `pages/admin/TeamManagement.tsx` — câblage logs
- `pages/Configuration.tsx` — câblage logs
- `pages/Activities.tsx` — ajout category aux logs existants

---

## Non inclus (YAGNI)

- Notifications en temps réel des logs (websocket)
- Logs côté Supabase via triggers (Option C)
- Export PDF
- Rétention configurable par l'admin
