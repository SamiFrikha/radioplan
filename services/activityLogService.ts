import { supabase } from './supabaseClient';

export type ActivityLogCategory = 'ACTIVITES' | 'RCP' | 'ABSENCE' | 'REMPLACEMENT' | 'PLANNING' | 'PROFIL' | 'CONFIG';

export interface ActivityLogEntry {
    id: string;
    timestamp: string;          // ISO date string
    userId: string;             // Profile ID of the user who made the change
    userEmail: string;          // Email of the user
    userName: string;           // Display name (email or doctor name)
    action: string;             // Type of action: 'MANUAL_ASSIGN', 'AUTO_RECALCULATE', 'VALIDATE_WEEK', 'UNVALIDATE_WEEK', 'CLEAR_CHOICES', 'WEEKLY_ASSIGN', 'CREATE_ACTIVITY', 'DELETE_ACTIVITY', 'EDIT_ACTIVITY'
    description: string;        // Human-readable description of what changed
    weekKey: string;            // Week identifier (YYYY-MM-DD of Monday)
    activityName?: string;      // Name of the activity involved
    doctorName?: string;        // Name of the doctor involved
    details?: string;           // Additional JSON details
    category?: ActivityLogCategory;  // Activity log category
    targetDate?: string;        // YYYY-MM-DD (date métier concernée, nullable)
}

const STORAGE_KEY = 'radioplan_activity_logs';

// Helpers for localStorage fallback
function getLocalLogs(): ActivityLogEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveLocalLogs(logs: ActivityLogEntry[]): void {
    // Keep only last 500 entries to avoid localStorage bloat
    const trimmed = logs.slice(-500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export const activityLogService = {

    /**
     * Add a new log entry
     */
    async addLog(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): Promise<void> {
        const logEntry: ActivityLogEntry = {
            ...entry,
            id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            timestamp: new Date().toISOString(),
        };

        // Try Supabase first
        try {
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
                    category: logEntry.category || null,
                    target_date: logEntry.targetDate || null
                });

            if (error) {
                console.warn('Supabase log insert failed, falling back to localStorage:', error.message);
                // Fallback to localStorage
                const logs = getLocalLogs();
                logs.push(logEntry);
                saveLocalLogs(logs);
            }
        } catch (err) {
            console.warn('Supabase unavailable for logs, using localStorage:', err);
            const logs = getLocalLogs();
            logs.push(logEntry);
            saveLocalLogs(logs);
        }
    },

    /**
     * Get logs with flexible filtering
     */
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

    /**
     * Purge logs older than 180 days
     */
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

    getLocalLogsFiltered(weekKey?: string, limit: number = 100): ActivityLogEntry[] {
        let logs = getLocalLogs();
        if (weekKey) {
            logs = logs.filter(l => l.weekKey === weekKey);
        }
        // Sort by timestamp descending (newest first)
        logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return logs.slice(0, limit);
    }
};
