# Audit Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer une page `/logs` admin avec filtres avancés, export CSV et couverture exhaustive des actions de toute l'app.

**Architecture:** Extension de l'infrastructure `activityLogService.ts` existante (Supabase + localStorage fallback). Ajout de `category` et `targetDate` à `ActivityLogEntry`. Câblage de `addLog()` dans 10 fichiers. Nouvelle page `pages/Logs.tsx` admin-only accessible depuis la sidebar.

**Tech Stack:** React 19, TypeScript, Supabase (table `activity_logs`), TailwindCSS, lucide-react, HashRouter (react-router-dom v6)

> ⚠️ **Pas de framework de tests dans ce projet.** Les étapes de vérification sont manuelles (console, UI).

---

## File Map

| Fichier | Action | Responsabilité |
|---|---|---|
| `services/activityLogService.ts` | Modifier | Étendre `ActivityLogEntry` (category, targetDate), nouveaux filtres dans `getLogs()`, méthode `purgeOldLogs()`, écriture `category`/`target_date` en base |
| `pages/Logs.tsx` | Créer | Page admin — filtres, tableau paginé, export CSV, bouton purge |
| `App.tsx` | Modifier | Route `/logs` avec guard admin |
| `components/Sidebar.tsx` | Modifier | Entrée "Logs" dans `adminItems` |
| `components/BottomNav.tsx` | Modifier | Entrée "Logs" mobile |
| `pages/Activities.tsx` | Modifier | Ajouter `category: 'ACTIVITES'` aux 9 `addLog()` existants |
| `pages/Profile.tsx` | Modifier | Câbler RCP, absences, profil, notifications |
| `components/ConflictResolverModal.tsx` | Modifier | Câbler remplacements, conflits, RCP via modal |
| `pages/Planning.tsx` | Modifier | Câbler assignations et résolutions |
| `pages/MonPlanning.tsx` | Modifier | Câbler CONSULT_MODIFY et ACTIVITY_MODIFY |
| `components/NotificationBell.tsx` | Modifier | Câbler REPLACEMENT_REJECT (accept/reject depuis notif) |
| `pages/admin/TeamManagement.tsx` | Modifier | Câbler DOCTOR_CREATE/UPDATE/DELETE |
| `pages/Configuration.tsx` | Modifier | Câbler TEMPLATE_UPDATE, SETTINGS_UPDATE |

---

## Task 1 : Étendre `ActivityLogEntry` dans `activityLogService.ts`

**Files:**
- Modify: `services/activityLogService.ts`

- [ ] **Step 1.1 — Ajouter les champs `category` et `targetDate` à l'interface**

Dans `types.ts`, trouver l'interface `ActivityLogEntry` (autour de la ligne 3 de `activityLogService.ts` — définie dans ce service, pas dans types.ts). Vérifier sa localisation exacte :

```bash
grep -n "ActivityLogEntry" C:/Users/jaste/OneDrive/Bureau/radioplan/services/activityLogService.ts
```

L'interface est dans `activityLogService.ts`. Ajouter les deux champs :

```ts
export interface ActivityLogEntry {
    id: string;
    timestamp: string;
    userId: string;
    userEmail: string;
    userName: string;
    action: string;
    description: string;
    weekKey: string;
    activityName?: string;
    doctorName?: string;
    details?: string;
    category?: string;    // ← NOUVEAU : 'ACTIVITES' | 'RCP' | 'ABSENCE' | 'REMPLACEMENT' | 'PLANNING' | 'PROFIL' | 'CONFIG'
    targetDate?: string;  // ← NOUVEAU : YYYY-MM-DD (date métier concernée, nullable)
}
```

- [ ] **Step 1.2 — Vérifier qu'il n'y a pas d'erreur TS**

```bash
cd C:/Users/jaste/OneDrive/Bureau/radioplan && npx tsc --noEmit 2>&1 | grep "ActivityLogEntry"
```
Attendu : aucune sortie (pas d'erreur sur ce type).

- [ ] **Step 1.3 — Commit**

```bash
git add services/activityLogService.ts
git commit -m "feat(logs): add category and targetDate fields to ActivityLogEntry"
```

---

## Task 2 : Étendre `activityLogService.ts`

**Files:**
- Modify: `services/activityLogService.ts`

- [ ] **Step 2.1 — Mettre à jour `addLog()` pour écrire `category` et `target_date` en base**

Dans la méthode `addLog()`, mettre à jour l'insert Supabase pour inclure les nouveaux champs :

```ts
const { error } = await supabase
    .from('activity_logs')
    .insert({
        id: logEntry.id,
        timestamp: logEntry.timestamp,
        user_id: logEntry.userId,
        user_email: logEntry.userEmail,
        user_name: logEntry.userName,
        action: logEntry.action,
        description: logEntry.description,
        week_key: logEntry.weekKey,
        activity_name: logEntry.activityName || null,
        doctor_name: logEntry.doctorName || null,
        details: logEntry.details || null,
        category: logEntry.category || null,       // ← NOUVEAU
        target_date: logEntry.targetDate || null,   // ← NOUVEAU
    });
```

- [ ] **Step 2.2 — Remplacer `getLogs()` par la nouvelle signature avec filtres**

Remplacer la méthode `getLogs(weekKey?, limit?)` par :

```ts
async getLogs(filters: {
    doctorName?: string;
    category?: string;
    dateFrom?: string;   // YYYY-MM-DD
    dateTo?: string;     // YYYY-MM-DD
    limit?: number;
} = {}): Promise<ActivityLogEntry[]> {
    const { doctorName, category, dateFrom, dateTo, limit = 1000 } = filters;
    try {
        let query = supabase
            .from('activity_logs')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (doctorName) query = query.eq('user_name', doctorName);
        if (category) query = query.eq('category', category);
        if (dateFrom) query = query.gte('timestamp', `${dateFrom}T00:00:00.000Z`);
        if (dateTo) query = query.lte('timestamp', `${dateTo}T23:59:59.999Z`);

        const { data, error } = await query;

        if (error) {
            console.warn('Supabase log fetch failed:', error.message);
            return [];
        }

        return (data || []).map((row: any) => ({
            id: row.id,
            timestamp: row.timestamp,
            userId: row.user_id,
            userEmail: row.user_email,
            userName: row.user_name,
            action: row.action,
            description: row.description,
            weekKey: row.week_key,
            activityName: row.activity_name,
            doctorName: row.doctor_name,
            details: row.details,
            category: row.category,
            targetDate: row.target_date,
        }));
    } catch (err) {
        console.warn('Supabase unavailable for log fetch:', err);
        return [];
    }
},
```

- [ ] **Step 2.3 — Ajouter `purgeOldLogs()`**

Après `getLogs()`, ajouter :

```ts
async purgeOldLogs(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 180);
    const { error, count } = await supabase
        .from('activity_logs')
        .delete({ count: 'exact' })
        .lt('timestamp', cutoff.toISOString());

    if (error) throw new Error(error.message);
    return count || 0;
},
```

- [ ] **Step 2.4 — Mettre à jour `getLocalLogsFiltered()` pour la rétrocompatibilité**

La méthode `getLocalLogsFiltered(weekKey?, limit?)` reste inchangée — elle est uniquement utilisée par Activities.tsx en fallback.

- [ ] **Step 2.5 — Vérifier TS**

```bash
cd C:/Users/jaste/OneDrive/Bureau/radioplan && npx tsc --noEmit 2>&1 | grep "activityLogService"
```
Attendu : aucune erreur.

- [ ] **Step 2.6 — Commit**

```bash
git add services/activityLogService.ts
git commit -m "feat(logs): extend getLogs() with filters, add purgeOldLogs(), write category/targetDate"
```

---

## Task 3 : RLS Supabase sur `activity_logs`

**Files:**
- Supabase migration (via MCP)

- [ ] **Step 3.1 — Appliquer les politiques RLS via Supabase MCP**

Exécuter la migration suivante (project_id: `sbkwkqqrersznlqpihkg`) :

```sql
-- Activer RLS si pas déjà fait
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Lecture : admins uniquement
CREATE POLICY "logs_select_admin_only"
  ON activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'admin' OR profiles.role_name = 'Admin')
    )
  );

-- Insertion : tout utilisateur authentifié, user_id = son propre uid
CREATE POLICY "logs_insert_own"
  ON activity_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid()::text);

-- Suppression : admins uniquement (pour la purge)
CREATE POLICY "logs_delete_admin_only"
  ON activity_logs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'admin' OR profiles.role_name = 'Admin')
    )
  );
```

- [ ] **Step 3.2 — Vérifier en console Supabase** que les 3 policies apparaissent sur la table `activity_logs`.

---

## Task 4 : Page `pages/Logs.tsx`

**Files:**
- Create: `pages/Logs.tsx`

- [ ] **Step 4.1 — Créer la page avec structure de base**

```tsx
import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScrollText, RefreshCw, Download, X, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AppContext } from '../App';
import { activityLogService, ActivityLogEntry } from '../services/activityLogService';

const CATEGORIES = [
    { value: '', label: 'Toutes catégories' },
    { value: 'ACTIVITES', label: 'Activités' },
    { value: 'RCP', label: 'RCP' },
    { value: 'ABSENCE', label: 'Absences' },
    { value: 'REMPLACEMENT', label: 'Remplacements' },
    { value: 'PLANNING', label: 'Planning' },
    { value: 'PROFIL', label: 'Profil' },
    { value: 'CONFIG', label: 'Configuration' },
];

const BADGE_COLORS: Record<string, string> = {
    ACTIVITES: 'bg-primary/10 text-primary-text border-primary/20',
    RCP: 'bg-purple-100 text-purple-700 border-purple-200',
    ABSENCE: 'bg-warning/10 text-warning border-warning/20',
    REMPLACEMENT: 'bg-success/10 text-success border-success/20',
    PLANNING: 'bg-teal-100 text-teal-700 border-teal-200',
    PROFIL: 'bg-muted text-text-muted border-border',
    CONFIG: 'bg-danger/10 text-danger border-danger/20',
};

const PAGE_SIZE = 50;

const today = () => new Date().toISOString().split('T')[0];
const thirtyDaysAgo = () => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
};
const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

const LogsPage: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin } = useAuth();
    const { doctors } = useContext(AppContext);

    // Guard
    useEffect(() => { if (!isAdmin) navigate('/'); }, [isAdmin, navigate]);

    // Filters
    const [filterDoctor, setFilterDoctor] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterFrom, setFilterFrom] = useState(thirtyDaysAgo());
    const [filterTo, setFilterTo] = useState(today());

    // Data
    const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    // Purge
    const [purging, setPurging] = useState(false);

    const loadLogs = async () => {
        setLoading(true); setError(null);
        try {
            const data = await activityLogService.getLogs({
                doctorName: filterDoctor || undefined,
                category: filterCategory || undefined,
                dateFrom: filterFrom || undefined,
                dateTo: filterTo || undefined,
                limit: 1000,
            });
            setEntries(data);
            setPage(1);
        } catch {
            setError("Impossible de charger les logs.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (isAdmin) loadLogs(); }, [filterDoctor, filterCategory, filterFrom, filterTo]);

    const resetFilters = () => {
        setFilterDoctor(''); setFilterCategory('');
        setFilterFrom(thirtyDaysAgo()); setFilterTo(today());
    };

    // Pagination
    const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    const paginated = useMemo(() =>
        entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [entries, page]
    );

    // Export CSV
    const exportCsv = async () => {
        const all = await activityLogService.getLogs({
            doctorName: filterDoctor || undefined,
            category: filterCategory || undefined,
            dateFrom: filterFrom || undefined,
            dateTo: filterTo || undefined,
            limit: 10000,
        });
        if (all.length >= 10000) {
            alert("Export limité à 10 000 entrées — affinez vos filtres.");
        }
        const BOM = '\uFEFF';
        const header = 'Date,Heure,Médecin,Email,Catégorie,Action,Description,Détails';
        const escape = (v?: string) => {
            if (!v) return '';
            if (v.includes(',') || v.includes('"') || v.includes('\n'))
                return `"${v.replace(/"/g, '""')}"`;
            return v;
        };
        const rows = all.map(e => {
            const d = new Date(e.timestamp);
            return [
                d.toLocaleDateString('fr-FR'),
                d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                escape(e.userName),
                escape(e.userEmail),
                escape(e.category),
                escape(e.action),
                escape(e.description),
                escape(e.details),
            ].join(',');
        });
        const csv = BOM + [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `radioplan-logs-${today()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Purge
    const handlePurge = async () => {
        if (!window.confirm("Supprimer tous les logs de plus de 6 mois (180 jours) ? Cette action est irréversible.")) return;
        setPurging(true);
        try {
            const count = await activityLogService.purgeOldLogs();
            alert(`${count} log(s) supprimé(s).`);
            loadLogs();
        } catch (e: any) {
            alert(`Erreur lors de la purge : ${e.message}`);
        } finally {
            setPurging(false);
        }
    };

    if (!isAdmin) return null;

    return (
        <div className="pb-20 lg:pb-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h1 className="text-2xl font-extrabold text-text-base tracking-tight flex items-center gap-2">
                    <ScrollText className="w-6 h-6 text-primary" />
                    Logs d'activité
                </h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={exportCsv}
                        className="flex items-center gap-2 px-3 py-2 rounded-btn text-sm font-medium bg-surface border border-border text-text-base hover:bg-muted transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Export CSV
                    </button>
                    <button
                        onClick={loadLogs}
                        className="p-2 rounded-btn bg-surface border border-border text-text-muted hover:bg-muted transition-colors"
                        title="Actualiser"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={handlePurge}
                        disabled={purging}
                        className="flex items-center gap-2 px-3 py-2 rounded-btn text-sm font-medium bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 transition-colors"
                        title="Purger les logs de plus de 180 jours"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Purger</span>
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-surface border border-border rounded-card p-3 mb-4 flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-text-muted mb-1 block">Médecin</label>
                    <select
                        value={filterDoctor}
                        onChange={e => setFilterDoctor(e.target.value)}
                        className="w-full border border-border rounded-btn px-2 py-1.5 text-sm bg-surface text-text-base"
                    >
                        <option value="">Tous</option>
                        {doctors.map(d => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-text-muted mb-1 block">Catégorie</label>
                    <select
                        value={filterCategory}
                        onChange={e => setFilterCategory(e.target.value)}
                        className="w-full border border-border rounded-btn px-2 py-1.5 text-sm bg-surface text-text-base"
                    >
                        {CATEGORIES.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-text-muted mb-1 block">Du</label>
                    <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                        className="border border-border rounded-btn px-2 py-1.5 text-sm bg-surface text-text-base" />
                </div>
                <div>
                    <label className="text-xs text-text-muted mb-1 block">Au</label>
                    <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                        className="border border-border rounded-btn px-2 py-1.5 text-sm bg-surface text-text-base" />
                </div>
                <button onClick={resetFilters} className="p-2 text-text-muted hover:text-text-base transition-colors" title="Réinitialiser">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Count */}
            <p className="text-xs text-text-muted mb-2 pl-1">
                {loading ? 'Chargement…' : `${entries.length} entrée${entries.length !== 1 ? 's' : ''} trouvée${entries.length !== 1 ? 's' : ''}`}
            </p>

            {/* Table */}
            {error ? (
                <div className="bg-danger/10 border border-danger/20 rounded-card p-4 text-center">
                    <p className="text-danger text-sm mb-2">{error}</p>
                    <button onClick={loadLogs} className="text-xs underline text-danger">Réessayer</button>
                </div>
            ) : loading ? (
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-12 bg-muted animate-pulse rounded-card" />
                    ))}
                </div>
            ) : entries.length === 0 ? (
                <div className="bg-surface border border-border rounded-card p-8 text-center">
                    <ScrollText className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-40" />
                    <p className="text-text-muted text-sm mb-3">Aucun log trouvé pour ces filtres.</p>
                    <button onClick={resetFilters} className="text-xs underline text-primary">Réinitialiser les filtres</button>
                </div>
            ) : (
                <>
                    <div className="bg-surface border border-border rounded-card overflow-hidden shadow-sm">
                        {/* Desktop table */}
                        <table className="w-full text-sm hidden md:table">
                            <thead>
                                <tr className="border-b border-border bg-muted/50">
                                    <th className="text-left px-3 py-2 text-xs font-bold text-text-muted uppercase tracking-wider w-36">Date & Heure</th>
                                    <th className="text-left px-3 py-2 text-xs font-bold text-text-muted uppercase tracking-wider w-40">Médecin</th>
                                    <th className="text-left px-3 py-2 text-xs font-bold text-text-muted uppercase tracking-wider w-32">Catégorie</th>
                                    <th className="text-left px-3 py-2 text-xs font-bold text-text-muted uppercase tracking-wider">Description</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {paginated.map(entry => (
                                    <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-3 py-2.5 text-xs text-text-muted whitespace-nowrap">{fmtDateTime(entry.timestamp)}</td>
                                        <td className="px-3 py-2.5 text-xs font-medium text-text-base truncate max-w-[160px]">{entry.userName}</td>
                                        <td className="px-3 py-2.5">
                                            {entry.category ? (
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${BADGE_COLORS[entry.category] || 'bg-muted text-text-muted border-border'}`}>
                                                    {CATEGORIES.find(c => c.value === entry.category)?.label || entry.category}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-text-muted">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-text-base">{entry.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Mobile list */}
                        <div className="md:hidden divide-y divide-border">
                            {paginated.map(entry => (
                                <div key={entry.id} className="p-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] text-text-muted">{fmtDateTime(entry.timestamp)}</span>
                                        {entry.category && (
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${BADGE_COLORS[entry.category] || 'bg-muted text-text-muted border-border'}`}>
                                                {CATEGORIES.find(c => c.value === entry.category)?.label || entry.category}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-text-base mb-0.5">{entry.description}</p>
                                    <p className="text-[11px] text-text-muted">{entry.userName}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-1 mt-4">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="px-2 py-1 rounded text-xs border border-border disabled:opacity-40 hover:bg-muted">←</button>
                            {(() => {
                                // Sliding window: show pages around current page
                                const delta = 2;
                                const range: number[] = [];
                                for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
                                    range.push(i);
                                }
                                const pages: (number | '...')[] = [];
                                if (range[0] > 1) { pages.push(1); if (range[0] > 2) pages.push('...'); }
                                range.forEach(p => pages.push(p));
                                if (range[range.length - 1] < totalPages) {
                                    if (range[range.length - 1] < totalPages - 1) pages.push('...');
                                    pages.push(totalPages);
                                }
                                return pages.map((p, i) => p === '...'
                                    ? <span key={`ellipsis-${i}`} className="px-1 text-xs text-text-muted">…</span>
                                    : (
                                        <button key={p} onClick={() => setPage(p as number)}
                                            className={`px-2 py-1 rounded text-xs border ${page === p ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'}`}>
                                            {p}
                                        </button>
                                    )
                                );
                            })()}
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                className="px-2 py-1 rounded text-xs border border-border disabled:opacity-40 hover:bg-muted">→</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default LogsPage;
```

- [ ] **Step 4.2 — Vérifier TS**

```bash
cd C:/Users/jaste/OneDrive/Bureau/radioplan && npx tsc --noEmit 2>&1 | grep "Logs"
```
Attendu : aucune erreur.

- [ ] **Step 4.3 — Commit**

```bash
git add pages/Logs.tsx
git commit -m "feat(logs): create admin Logs page with filters, table, pagination, CSV export, purge"
```

---

## Task 5 : Routing et navigation

**Files:**
- Modify: `App.tsx`
- Modify: `components/Sidebar.tsx`
- Modify: `components/BottomNav.tsx`

- [ ] **Step 5.1 — Ajouter l'import et la route dans `App.tsx`**

Ajouter l'import en haut du fichier avec les autres imports de pages :
```ts
import LogsPage from './pages/Logs';
```

Ajouter la route dans le bloc `<Routes>`, avec les autres routes admin (après `/admin/team`). **Important :** `App.tsx` n'expose pas `isAdmin` dans le scope de `<Routes>` — utiliser le composant `RequirePermission` déjà défini dans le fichier (ligne ~54) :
```tsx
<Route path="/logs" element={
    <RequirePermission permission="manage_settings">
        <LogsPage />
    </RequirePermission>
} />
```

> `RequirePermission` redirige vers `/` si `hasPermission(permission)` est faux, ce qui correspond au comportement admin-only voulu.

- [ ] **Step 5.2 — Ajouter l'entrée dans `Sidebar.tsx`**

Dans le tableau `adminItems`, ajouter après la ligne `/data` :
```ts
{ to: '/logs', icon: ScrollText, label: 'Logs', show: hasPermission('manage_settings') },
```

Ajouter l'import de `ScrollText` dans les imports lucide-react du fichier.

- [ ] **Step 5.3 — Ajouter l'entrée dans `BottomNav.tsx`**

`BottomNav.tsx` utilise un tableau `staticTabs` + un onglet Profile séparé. Il importe déjà `{ useAuth }`. Il n'y a pas de pattern de rendu conditionnel existant — ajouter `isAdmin` et insérer un onglet conditionnel après `staticTabs` :

Ajouter l'import de `ScrollText` dans les imports lucide-react existants.

Dans le composant, après la ligne `const { profile } = useAuth();`, ajouter :
```ts
const { profile, isAdmin } = useAuth();
```

Dans le JSX, après le bloc `{staticTabs.map(...)}` et avant l'onglet Profile hardcodé, ajouter :
```tsx
{isAdmin && (
    <NavLink
        to="/logs"
        aria-label="Logs"
        className="relative flex flex-col items-center justify-center gap-0.5 flex-1 pt-1 cursor-pointer"
    >
        {({ isActive }) => (
            <>
                {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-primary" aria-hidden="true" />
                )}
                <ScrollText className={isActive ? 'w-6 h-6 text-primary' : 'w-6 h-6 text-text-muted'} aria-hidden="true" />
                <span className={isActive ? 'text-[10px] font-bold text-primary leading-none' : 'text-[10px] font-medium text-text-muted leading-none'}>
                    Logs
                </span>
                {isActive && <span className="sr-only">(page actuelle)</span>}
            </>
        )}
    </NavLink>
)}
```

- [ ] **Step 5.4 — Vérifier TS et navigation**

```bash
cd C:/Users/jaste/OneDrive/Bureau/radioplan && npx tsc --noEmit 2>&1 | grep -E "App|Sidebar|BottomNav"
```
Attendu : aucune erreur. Vérifier manuellement dans le navigateur que `/logs` s'affiche dans la sidebar admin.

- [ ] **Step 5.5 — Commit**

```bash
git add App.tsx components/Sidebar.tsx components/BottomNav.tsx
git commit -m "feat(logs): add /logs route and sidebar entry for admins"
```

---

## Task 6 : Câblage `Activities.tsx` (rétrocompatibilité)

**Files:**
- Modify: `pages/Activities.tsx`

- [ ] **Step 6.1 — Ajouter `category: 'ACTIVITES'` aux 9 appels `addLog` existants**

Dans `Activities.tsx`, trouver les 9 appels à `addLog()` (lignes ~301, ~337, ~462, ~477, ~515, ~534, ~543, ~572, ~578, ~660, ~698). Pour chacun, ajouter `category: 'ACTIVITES'` dans les options :

Exemple — avant :
```ts
addLog('AUTO_RECALCULATE', `Recalcul automatique du groupe "${groupName}"`, {
    activityName: groupName,
});
```
Après :
```ts
addLog('AUTO_RECALCULATE', `Recalcul automatique du groupe "${groupName}"`, {
    activityName: groupName,
    category: 'ACTIVITES',
});
```

Répéter pour tous les appels.

> Note : `addLog()` est défini localement dans Activities.tsx et appelle `activityLogService.addLog()`. Vérifier sa signature pour voir si `category` est passé via `opts` ou directement.

- [ ] **Step 6.2 — Vérifier que le type supporte `category` dans opts**

Vérifier la signature de `addLog` local dans Activities.tsx (ligne ~97) :
```ts
const addLog = useCallback(async (action, description, opts?) => ...
```
Si `opts` ne supporte pas `category`, ajouter le champ à sa définition inline.

- [ ] **Step 6.3 — Commit**

```bash
git add pages/Activities.tsx
git commit -m "feat(logs): add category ACTIVITES to all existing activity log calls"
```

---

## Task 7 : Câblage `Profile.tsx`

**Files:**
- Modify: `pages/Profile.tsx`

- [ ] **Step 7.1 — Créer un helper `addLog` local dans Profile.tsx**

Chercher si Profile.tsx a déjà un `addLog` local. Si non, ajouter après les imports :

```ts
import { activityLogService } from '../services/activityLogService';
```

Et créer un helper après la déclaration de `currentDoctor` et `profile` :

```ts
const profileAddLog = useCallback(async (
    action: string,
    description: string,
    opts: { category: string; targetDate?: string; doctorName?: string; details?: string }
) => {
    if (!profile) return;
    await activityLogService.addLog({
        userId: profile.id,
        userEmail: profile.email || '',
        userName: currentDoctor?.name || profile.email || '',
        action,
        description,
        weekKey: '',
        ...opts,
    });
}, [profile, currentDoctor]);
```

- [ ] **Step 7.2 — Logger les actions RCP (présence/absence)**

Trouver les deux fonctions qui gèrent l'attendance RCP dans Profile.tsx (lignes ~786 et ~812). Ajouter les logs après les upserts Supabase réussis :

```ts
// Après set PRESENT
await profileAddLog('RCP_PRESENT', `Présence confirmée au RCP du ${slotDate}`, {
    category: 'RCP', targetDate: slotDate,
});
// Après set ABSENT
await profileAddLog('RCP_ABSENT', `Absence déclarée au RCP du ${slotDate}`, {
    category: 'RCP', targetDate: slotDate,
});
// Après suppression (cancel)
await profileAddLog('RCP_CANCEL', `Présence annulée au RCP du ${slotDate}`, {
    category: 'RCP', targetDate: slotDate,
});
```

- [ ] **Step 7.3 — Logger les absences**

Trouver `handleAddUnavailability` (ligne ~826) et `removeUnavailability` (ligne ~1316). Ajouter :

```ts
// Après addUnavailability réussi
await profileAddLog('ABSENCE_DECLARE', `Absence déclarée du ${startDate} au ${endDate}`, {
    category: 'ABSENCE', targetDate: startDate,
});
// Après removeUnavailability
await profileAddLog('ABSENCE_DELETE', `Absence supprimée (${abs.startDate} → ${abs.endDate})`, {
    category: 'ABSENCE', targetDate: abs.startDate,
});
```

- [ ] **Step 7.4 — Logger la mise à jour du profil**

Trouver `handleSaveProfile` (ligne ~859). Ajouter après `updateDoctor()` réussi :
```ts
await profileAddLog('PROFILE_UPDATE', `Profil mis à jour`, { category: 'PROFIL' });
```

Trouver `handleAvatarUpload`. Ajouter après le save :
```ts
await profileAddLog('AVATAR_UPDATE', `Photo de profil mise à jour`, { category: 'PROFIL' });
```

- [ ] **Step 7.5 — Logger les préférences de notification**

Trouver où les préférences sont sauvegardées. Ajouter :
```ts
await profileAddLog('NOTIF_PREFS_UPDATE', `Préférences de notifications mises à jour`, { category: 'PROFIL' });
```

- [ ] **Step 7.6 — Vérifier TS**

```bash
npx tsc --noEmit 2>&1 | grep "Profile"
```

- [ ] **Step 7.7 — Commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(logs): cable RCP, absences, profile updates logging in Profile.tsx"
```

---

## Task 8 : Câblage `ConflictResolverModal.tsx`

**Files:**
- Modify: `components/ConflictResolverModal.tsx`

- [ ] **Step 8.1 — Créer un helper `addLog` dans le modal**

Ajouter l'import :
```ts
import { activityLogService } from '../services/activityLogService';
```

Dans le composant, après `const { profile, isAdmin, isDoctor } = useAuth();` :
```ts
const modalAddLog = useCallback(async (
    action: string, description: string,
    opts: { category: string; targetDate?: string; doctorName?: string }
) => {
    if (!profile) return;
    await activityLogService.addLog({
        userId: profile.id,
        userEmail: profile.email || '',
        userName: profile.doctor_name || profile.email || '',
        action, description, weekKey: '',
        ...opts,
    });
}, [profile]);
```

- [ ] **Step 8.2 — Logger `REPLACEMENT_REQUEST`**

Trouver `handleSendReplacementRequest` (ligne ~172). Après `sendReplacementRequest()` réussit :
```ts
await modalAddLog('REPLACEMENT_REQUEST',
    `Demande de remplacement envoyée à ${targetDoc?.name || 'médecin'}`,
    { category: 'REMPLACEMENT', targetDate: slot.date }
);
```

- [ ] **Step 8.3 — Logger `CONFLICT_RESOLVE`**

Trouver les appels à `onResolve()`. Après chaque résolution directe réussie :
```ts
await modalAddLog('CONFLICT_RESOLVE',
    `Conflit résolu — ${newDoc?.name || newDoctorId} assigné`,
    { category: 'PLANNING', targetDate: slot.date }
);
```

- [ ] **Step 8.4 — Logger `SLOT_CLOSE`**

Trouver les appels à `onCloseSlot()`. Avant l'appel :
```ts
await modalAddLog('SLOT_CLOSE',
    `Créneau fermé (${slot.location} ${slot.period})`,
    { category: 'PLANNING', targetDate: slot.date }
);
```

- [ ] **Step 8.5 — Logger `RCP_PRESENT`/`RCP_ABSENT` via modal**

Après `handleRcpDirectReplacement` et `handleRcpLeaveEmpty` :
```ts
await modalAddLog('RCP_ABSENT', `Absent au RCP du ${effectiveSlot.date} via résolution`, {
    category: 'RCP', targetDate: effectiveSlot.date
});
```

- [ ] **Step 8.6 — Commit**

```bash
git add components/ConflictResolverModal.tsx
git commit -m "feat(logs): cable replacement, conflict, slot close logging in ConflictResolverModal"
```

---

## Task 9 : Câblage `Planning.tsx` et `MonPlanning.tsx`

**Files:**
- Modify: `pages/Planning.tsx`
- Modify: `pages/MonPlanning.tsx`

- [ ] **Step 9.1 — Logger `PLANNING_ASSIGN` dans `Planning.tsx`**

Trouver `onResolve` handler dans Planning.tsx (l'endroit où un médecin est assigné manuellement depuis la grille). Ajouter un `addLog` après l'assignation :
```ts
await activityLogService.addLog({
    userId: profile?.id || '',
    userEmail: profile?.email || '',
    userName: profile?.doctor_name || '',
    action: 'PLANNING_ASSIGN',
    description: `${newDoc?.name} assigné à ${slot?.location} (${slot?.day} ${slot?.period})`,
    weekKey: currentWeekStart.toISOString().split('T')[0],
    category: 'PLANNING',
    targetDate: slot?.date,
});
```

- [ ] **Step 9.2 — Logger `CONSULT_MODIFY`/`ACTIVITY_MODIFY` dans `MonPlanning.tsx`**

Trouver `handleConsultResolve` et `handleActivityResolve` dans MonPlanning.tsx. Ajouter après chaque résolution :
```ts
// Consultation
await activityLogService.addLog({
    userId: profile?.id || '',
    userEmail: profile?.email || '',
    userName: currentDoctor?.name || '',
    action: 'CONSULT_MODIFY',
    description: `Consultation modifiée (${slot?.location})`,
    weekKey: '',
    category: 'PLANNING',
    targetDate: slot?.date,
});
// Activité
await activityLogService.addLog({ ..., action: 'ACTIVITY_MODIFY', ... });
```

- [ ] **Step 9.3 — Commit**

```bash
git add pages/Planning.tsx pages/MonPlanning.tsx
git commit -m "feat(logs): cable planning assign, consult/activity modify logging"
```

---

## Task 10 : Câblage `NotificationBell.tsx`, `TeamManagement.tsx`, `Configuration.tsx`

**Files:**
- Modify: `components/NotificationBell.tsx`
- Modify: `pages/admin/TeamManagement.tsx`
- Modify: `pages/Configuration.tsx`

- [ ] **Step 10.1 — Logger REPLACEMENT_ACCEPT et REPLACEMENT_REJECT dans `NotificationBell.tsx`**

Dans `NotificationBell.tsx`, la fonction `handle(status: 'ACCEPTED' | 'REJECTED')` (ligne ~39) gère les deux cas. Trouver le bloc `if (status === 'ACCEPTED')` (ligne ~49) et le chemin REJECTED (ligne ~99). Ajouter les imports et l'`addLog` après chaque résolution réussie :

```ts
import { activityLogService } from '../services/activityLogService';
```

Dans `handle()`, après le succès de chaque appel :
```ts
// Après succès ACCEPTED (ligne ~49)
await activityLogService.addLog({
    userId: profile?.id || '',
    userEmail: profile?.email || '',
    userName: profile?.doctor_name || '',
    action: 'REPLACEMENT_ACCEPT',
    description: `Demande de remplacement acceptée`,
    weekKey: '',
    category: 'REMPLACEMENT',
});

// Après markReplacementResolved(requestId, 'REJECTED') (ligne ~99)
await activityLogService.addLog({
    userId: profile?.id || '',
    userEmail: profile?.email || '',
    userName: profile?.doctor_name || '',
    action: 'REPLACEMENT_REJECT',
    description: `Demande de remplacement refusée`,
    weekKey: '',
    category: 'REMPLACEMENT',
});
```

- [ ] **Step 10.2 — Logger REPLACEMENT_REJECT dans `Profile.tsx`**

Dans `Profile.tsx`, l'appel `markReplacementResolved(requestId, 'REJECTED')` existe aussi (ligne ~91). Ajouter le log après ce call réussi (même pattern que ci-dessus, `action: 'REPLACEMENT_REJECT'`). S'assurer que `activityLogService` est déjà importé (fait en Task 7).

> Note : `REPLACEMENT_ACCEPT` n'est loggé que depuis `NotificationBell.tsx` car c'est l'unique chemin d'acceptation identifié dans le code.

- [ ] **Step 10.3 — Logger DOCTOR_CREATE/UPDATE/DELETE dans `TeamManagement.tsx`**

Trouver les handlers de création, mise à jour et suppression de médecins. Après chaque opération réussie :
```ts
await activityLogService.addLog({
    userId: profile?.id || '',
    userEmail: profile?.email || '',
    userName: profile?.doctor_name || '',
    action: 'DOCTOR_CREATE', // ou UPDATE / DELETE
    description: `Médecin ${doctor.name} créé / modifié / supprimé`,
    weekKey: '',
    category: 'CONFIG',
    doctorName: doctor.name,
});
```

- [ ] **Step 10.4 — Logger TEMPLATE_UPDATE/SETTINGS_UPDATE dans `Configuration.tsx`**

Trouver les handlers de sauvegarde du template et des paramètres. Ajouter le log après chaque save réussi.

- [ ] **Step 10.5 — Commit**

```bash
git add components/NotificationBell.tsx pages/admin/TeamManagement.tsx pages/Configuration.tsx
git commit -m "feat(logs): cable reject, doctor config, and settings logging"
```

---

## Task 11 : Vérification finale et push

- [ ] **Step 11.1 — Check TS complet**

```bash
cd C:/Users/jaste/OneDrive/Bureau/radioplan && npx tsc --noEmit 2>&1
```
Attendu : uniquement les 2 erreurs pré-existantes de Configuration.tsx (`countingPeriods`) — aucune nouvelle erreur.

- [ ] **Step 11.2 — Vérification manuelle (checklist)**

En tant qu'admin :
- [ ] `/logs` visible dans la sidebar
- [ ] Page charge avec le tableau et les filtres
- [ ] Filtre par médecin → résultats mis à jour
- [ ] Filtre par catégorie → résultats mis à jour
- [ ] Filtre par date → résultats mis à jour
- [ ] Bouton Réinitialiser → retour aux 30 derniers jours
- [ ] Bouton Export CSV → fichier téléchargé, Excel l'ouvre sans erreur d'encodage
- [ ] Bouton Purger → dialog de confirmation → purge réussie avec toast
- [ ] Pagination fonctionne (si > 50 entrées)
- [ ] Mobile : liste condensée lisible

Créer un log de test :
- [ ] Déclarer une absence depuis Profil → vérifier dans `/logs` que l'entrée `ABSENCE_DECLARE` apparaît

- [ ] **Step 11.3 — Push**

```bash
git push
```

---

## Couleurs des badges (référence)

| Catégorie | Classes Tailwind |
|---|---|
| `ACTIVITES` | `bg-primary/10 text-primary-text border-primary/20` |
| `RCP` | `bg-purple-100 text-purple-700 border-purple-200` |
| `ABSENCE` | `bg-warning/10 text-warning border-warning/20` |
| `REMPLACEMENT` | `bg-success/10 text-success border-success/20` |
| `PLANNING` | `bg-teal-100 text-teal-700 border-teal-200` |
| `PROFIL` | `bg-muted text-text-muted border-border` |
| `CONFIG` | `bg-danger/10 text-danger border-danger/20` |
