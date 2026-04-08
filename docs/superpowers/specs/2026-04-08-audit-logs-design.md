# Design Spec — Audit Logs (Journal d'activité)

**Date :** 2026-04-08
**Statut :** Approuvé
**Approche :** Option A — Extension directe de l'infrastructure existante

---

## Contexte

RadioPlan dispose déjà d'un `activityLogService.ts` qui logue les actions de la page Activités vers Supabase (table `activity_logs`) avec fallback localStorage. Un panel log existe dans Activities.tsx mais est limité (filtre semaine/tout, pas de filtres avancés, pas accessible depuis la sidebar).

**Objectif :** Étendre ce système pour couvrir toute l'application et créer une page dédiée accessible aux admins depuis la barre latérale.

---

## Accès & Sécurité

- **Admin uniquement** — la page `/logs` est visible dans la sidebar uniquement si `isAdmin === true`
- Redirection vers `/` si accès non autorisé (guard côté frontend)
- **RLS Supabase — lecture :** la table `activity_logs` n'est lisible que par les profils admin (`role = 'admin'` ou `role_name = 'Admin'`)
- **RLS Supabase — écriture :** tout utilisateur authentifié peut insérer des logs, à condition que `user_id = auth.uid()` — empêche l'usurpation d'identité dans les logs
- **RLS Supabase — suppression :** réservée aux admins uniquement (pour la purge)
- La page `/logs` lit **uniquement depuis Supabase** — pas de fallback localStorage. L'infra localStorage existante (Activities.tsx) reste inchangée pour l'écriture des logs.

---

## Section 1 : Architecture & données

### Évolution du schéma Supabase

Colonnes ajoutées à la table `activity_logs` (migration appliquée) :

```sql
ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS target_date TEXT;

CREATE INDEX IF NOT EXISTS idx_activity_logs_category_timestamp
  ON activity_logs (category, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_doctor_timestamp
  ON activity_logs (user_name, timestamp DESC);
```

- `category` : groupe d'action (`ACTIVITES`, `RCP`, `ABSENCE`, `REMPLACEMENT`, `PLANNING`, `PROFIL`, `CONFIG`)
- `target_date` : date YYYY-MM-DD concernée par l'action (nullable)

### Évolution de `ActivityLogEntry`

```ts
interface ActivityLogEntry {
  // ... champs existants (id, timestamp, userId, userEmail, userName, action, description, weekKey, activityName, doctorName, details) ...
  category?: string;    // Nouveau — groupe d'action
  targetDate?: string;  // Nouveau — date YYYY-MM-DD concernée (nullable)
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

### Purge (6 mois)

Nouvelle méthode dans `activityLogService.ts` :
```ts
async purgeOldLogs(): Promise<void>
```
- **Déclenchement :** action explicite de l'admin uniquement — bouton "Purger les logs anciens" dans la page `/logs`, avec dialog de confirmation : *"Supprimer tous les logs de plus de 6 mois (180 jours) ? Cette action est irréversible."*
- **Définition "6 mois"** : 180 jours calendaires (`timestamp < now() - interval '180 days'`)
- **Gestion d'erreur :** toast d'erreur si échec, toast de succès avec nombre de lignes supprimées si OK
- Pas de purge automatique au chargement de la page

### Évolution de `getLogs()`

```ts
getLogs(filters: {
  doctorName?: string;
  category?: string;
  dateFrom?: string;   // YYYY-MM-DD — filtre sur la colonne `timestamp` (date de l'événement), défaut = today - 30j
  dateTo?: string;     // YYYY-MM-DD — filtre sur la colonne `timestamp`, défaut = today (inclus jusqu'à 23:59:59)
  limit?: number;      // défaut = 1000
}): Promise<ActivityLogEntry[]>
```
`target_date` n'est pas filtrable en v1 — c'est une métadonnée métier affichable mais non requêtée.

**Stratégie de pagination v1 :** `getLogs()` retourne jusqu'à 1000 entrées filtrées. La pagination (50/page) est gérée côté client. Le volume attendu sur 30 jours pour un service de radiothérapie (≈10 médecins) est estimé à < 500 entrées — acceptable.

**Export CSV :** appelle `getLogs()` avec `limit: 10000`. Si le résultat dépasse 10 000 entrées, un toast avertit l'utilisateur : *"Export limité à 10 000 entrées — affinez vos filtres."*

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

- **Médecin** : dropdown alimenté par la liste `doctors` du contexte `AppContext` (médecins actifs uniquement — pas depuis les logs, pour éviter les fantômes) + "Tous"
- **Catégorie** : `Tous / Activités / RCP / Absences / Remplacements / Planning / Profil / Config`
- **Date de / Date à** : champs date (défaut : 30 derniers jours)
- **✕ Réinitialiser** : remet les filtres à leurs valeurs par défaut (Tous les médecins, Toutes catégories, dates = 30 derniers jours)

### Tableau

- Colonnes : Date & heure | Médecin | Catégorie (badge coloré) | Description lisible
- Tri : du plus récent au plus ancien
- Pagination : 50 entrées par page (client-side)
- Mobile : date + description (médecin en sous-titre, catégorie en badge)

### Export CSV

- Bouton en haut à droite
- Exporte tous les résultats filtrés (pas seulement la page courante)
- Limité à 10 000 lignes — toast d'avertissement si dépassé : *"Export limité à 10 000 entrées — affinez vos filtres."*
- Encodage : **UTF-8 BOM** (`\uFEFF`) pour compatibilité Excel avec les caractères accentués
- Séparateur : virgule `,` — les champs contenant des virgules ou guillemets sont entourés de `"`
- Colonnes : `Date,Heure,Médecin,Email,Catégorie,Action,Description,Détails`
- Nom du fichier : `radioplan-logs-YYYY-MM-DD.csv`

### États de la page

- **Chargement** : skeleton sur le tableau (3-5 lignes)
- **Aucun résultat** : message centré *"Aucun log trouvé pour ces filtres."* avec bouton Réinitialiser
- **Erreur réseau** : toast d'erreur *"Impossible de charger les logs."* avec bouton Réessayer

---

## Section 3 : Câblage par fichier

| Fichier | Actions ajoutées | Contexte |
|---|---|---|
| `Profile.tsx` | `RCP_PRESENT`, `RCP_ABSENT`, `RCP_CANCEL`, `RCP_EXCEPTION`, `ABSENCE_DECLARE`, `ABSENCE_DELETE`, `PROFILE_UPDATE`, `AVATAR_UPDATE`, `NOTIF_PREFS_UPDATE` | Le médecin gère sa présence RCP et ses absences depuis son profil |
| `ConflictResolverModal.tsx` | `REPLACEMENT_REQUEST`, `CONFLICT_RESOLVE`, `SLOT_CLOSE`, `RCP_PRESENT`*, `RCP_ABSENT`* | `REPLACEMENT_REQUEST` loggé dans le modal après appel à `sendReplacementRequest()` — le service lui-même ne logue pas (pas de contexte user). `RCP_PRESENT/ABSENT`* = même code, chemin distinct de Profile.tsx. `CONFLICT_RESOLVE` ici = résolution via le modal. |
| `Planning.tsx` | `PLANNING_ASSIGN`, `CONFLICT_RESOLVE`* | `CONFLICT_RESOLVE`* = même code, déclenché depuis la grille Planning (admin assigne directement, pas via le modal) |
| `MonPlanning.tsx` | `CONSULT_MODIFY`, `ACTIVITY_MODIFY` | Modification de ses propres créneaux depuis l'agenda personnel |
| `replacementService.ts` | `REPLACEMENT_ACCEPT`, `REPLACEMENT_REJECT` | Acceptation/rejet d'une demande reçue |
| `TeamManagement.tsx` | `DOCTOR_CREATE`, `DOCTOR_UPDATE`, `DOCTOR_DELETE` | Admin uniquement |
| `Configuration.tsx` | `TEMPLATE_UPDATE`, `SETTINGS_UPDATE` | Admin uniquement |
| `Activities.tsx` | Ajouter `category: 'ACTIVITES'` aux 9 logs existants | Rétrocompatibilité — les anciens logs sans category restent visibles dans "Toutes catégories" mais n'apparaissent pas dans le filtre "Activités" |

*Même code d'action partagé entre plusieurs fichiers — intentionnel, le `description` lisible différencie le contexte.*

### Logs existants sans `category` (NULL)

Les logs écrits avant cette migration ont `category = NULL`. Comportement :
- Filtre "Toutes catégories" → inclus
- Filtre par catégorie spécifique → exclus (pas de backfill rétroactif, volume faible attendu)

### Couleurs des badges catégorie

| Catégorie | Couleur |
|---|---|
| `ACTIVITES` | Bleu (`primary`) |
| `RCP` | Violet (`purple`) |
| `ABSENCE` | Orange (`warning`) |
| `REMPLACEMENT` | Vert (`success`) |
| `PLANNING` | Cyan (`teal`) |
| `PROFIL` | Gris (`muted`) |
| `CONFIG` | Rouge (`danger`) |

### Sidebar & routing

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
- `pages/MonPlanning.tsx` — câblage logs (CONSULT_MODIFY, ACTIVITY_MODIFY)
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
- Pagination serveur (offset/cursor) — v1 client-side suffisant
