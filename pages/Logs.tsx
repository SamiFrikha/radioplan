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
    ACTIVITES: 'bg-blue-100 text-blue-700 border-blue-200',
    RCP: 'bg-purple-100 text-purple-700 border-purple-200',
    ABSENCE: 'bg-orange-100 text-orange-700 border-orange-200',
    REMPLACEMENT: 'bg-green-100 text-green-700 border-green-200',
    PLANNING: 'bg-teal-100 text-teal-700 border-teal-200',
    PROFIL: 'bg-gray-100 text-gray-600 border-gray-200',
    CONFIG: 'bg-red-100 text-red-700 border-red-200',
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

const fmtDate = (dateStr: string) => {
    // dateStr est au format YYYY-MM-DD
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
};

const LogsPage: React.FC = () => {
    const navigate = useNavigate();
    const { isAdmin } = useAuth();
    const { doctors } = useContext(AppContext);

    useEffect(() => { if (!isAdmin) navigate('/'); }, [isAdmin, navigate]);

    const [filterDoctor, setFilterDoctor] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterFrom, setFilterFrom] = useState(thirtyDaysAgo());
    const [filterTo, setFilterTo] = useState(today());

    const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
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
            setError('Impossible de charger les logs.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (isAdmin) void loadLogs(); }, [filterDoctor, filterCategory, filterFrom, filterTo, isAdmin]);

    const resetFilters = () => {
        setFilterDoctor(''); setFilterCategory('');
        setFilterFrom(thirtyDaysAgo()); setFilterTo(today());
    };

    const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    const paginated = useMemo(() =>
        entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [entries, page]
    );

    const exportCsv = async () => {
        const all = await activityLogService.getLogs({
            doctorName: filterDoctor || undefined,
            category: filterCategory || undefined,
            dateFrom: filterFrom || undefined,
            dateTo: filterTo || undefined,
            limit: 10000,
        });
        if (all.length >= 10000) {
            alert('Export limité à 10 000 entrées — affinez vos filtres.');
        }
        const BOM = '\uFEFF';
        const header = 'Date log,Heure log,Date événement,Médecin,Email,Catégorie,Action,Description,Détails';
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
                e.targetDate ? fmtDate(e.targetDate) : '',
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

    const handlePurge = async () => {
        if (!window.confirm('Supprimer tous les logs de plus de 6 mois (180 jours) ? Cette action est irréversible.')) return;
        setPurging(true);
        try {
            const count = await activityLogService.purgeOldLogs();
            alert(`${count} log(s) supprimé(s).`);
            void loadLogs();
        } catch (e: unknown) {
            alert(`Erreur lors de la purge : ${e instanceof Error ? e.message : 'Erreur inconnue'}`);
        } finally {
            setPurging(false);
        }
    };

    if (!isAdmin) return null;

    return (
        <div className="pb-20 lg:pb-6 px-4 lg:px-6 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h1 className="text-2xl font-extrabold text-text-base tracking-tight flex items-center gap-2">
                    <ScrollText className="w-6 h-6 text-primary" />
                    Logs d'activité
                </h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => void exportCsv()}
                        className="flex items-center gap-2 px-3 py-2 rounded-btn text-sm font-medium bg-surface border border-border text-text-base hover:bg-muted transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Export CSV
                    </button>
                    <button
                        onClick={() => void loadLogs()}
                        className="p-2 rounded-btn bg-surface border border-border text-text-muted hover:bg-muted transition-colors"
                        title="Actualiser"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={() => void handlePurge()}
                        disabled={purging}
                        className="flex items-center gap-2 px-3 py-2 rounded-btn text-sm font-medium bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                        title="Purger les logs de plus de 180 jours"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Purger</span>
                    </button>
                </div>
            </div>

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

            <p className="text-xs text-text-muted mb-2 pl-1">
                {loading ? 'Chargement…' : `${entries.length} entrée${entries.length !== 1 ? 's' : ''} trouvée${entries.length !== 1 ? 's' : ''}`}
            </p>

            {error ? (
                <div className="bg-red-50 border border-red-200 rounded-card p-4 text-center">
                    <p className="text-red-700 text-sm mb-2">{error}</p>
                    <button onClick={() => void loadLogs()} className="text-xs underline text-red-700">Réessayer</button>
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
                        <table className="w-full text-sm hidden md:table">
                            <thead>
                                <tr className="border-b border-border bg-muted/50">
                                    <th className="text-left px-3 py-2 text-xs font-bold text-text-muted uppercase tracking-wider w-36">Date & Heure</th>
                                    <th className="text-left px-3 py-2 text-xs font-bold text-text-muted uppercase tracking-wider w-28">Date événement</th>
                                    <th className="text-left px-3 py-2 text-xs font-bold text-text-muted uppercase tracking-wider w-40">Médecin</th>
                                    <th className="text-left px-3 py-2 text-xs font-bold text-text-muted uppercase tracking-wider w-32">Catégorie</th>
                                    <th className="text-left px-3 py-2 text-xs font-bold text-text-muted uppercase tracking-wider">Description</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {paginated.map(entry => (
                                    <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-3 py-2.5 text-xs text-text-muted whitespace-nowrap">{fmtDateTime(entry.timestamp)}</td>
                                        <td className="px-3 py-2.5 text-xs text-text-muted whitespace-nowrap">
                                            {entry.targetDate ? fmtDate(entry.targetDate) : <span className="opacity-30">—</span>}
                                        </td>
                                        <td className="px-3 py-2.5 text-xs font-medium text-text-base truncate max-w-[160px]">{entry.userName}</td>
                                        <td className="px-3 py-2.5">
                                            {entry.category ? (
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${BADGE_COLORS[entry.category] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                    {CATEGORIES.find(c => c.value === entry.category)?.label ?? entry.category}
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

                        <div className="md:hidden divide-y divide-border">
                            {paginated.map(entry => (
                                <div key={entry.id} className="p-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] text-text-muted">{fmtDateTime(entry.timestamp)}</span>
                                        {entry.category && (
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${BADGE_COLORS[entry.category] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                {CATEGORIES.find(c => c.value === entry.category)?.label ?? entry.category}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-text-base mb-0.5">{entry.description}</p>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        <p className="text-[11px] text-text-muted">{entry.userName}</p>
                                        {entry.targetDate && (
                                            <p className="text-[10px] text-text-muted/70">
                                                📅 {fmtDate(entry.targetDate)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-1 mt-4">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="px-2 py-1 rounded text-xs border border-border disabled:opacity-40 hover:bg-muted">←</button>
                            {(() => {
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
