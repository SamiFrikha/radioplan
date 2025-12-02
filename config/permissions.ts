
import { PermissionItem } from "../types";

// The Keys used in code
export const PERMISSION_KEYS = {
    // --- GLOBAL ACCESS ---
    VIEW_DASHBOARD: 'view_dashboard',
    VIEW_ADMIN_PANEL: 'view_admin_panel',
    MANAGE_ROLES: 'manage_roles',
    MANAGE_SYSTEM: 'manage_system', // Days off, algo settings

    // --- TEAM MANAGEMENT ---
    MANAGE_DOCTORS: 'manage_doctors', // View list
    CREATE_DELETE_DOCTORS: 'create_delete_doctors', // Add/Remove
    EDIT_OTHERS_PROFILE: 'edit_others_profile', // Edit details of others

    // --- SCHEDULE & RULES ---
    MANAGE_SCHEDULE: 'manage_schedule', // Global Planning (Consultations/Postes)
    MANAGE_RULES: 'manage_rules', // Configuration Template
    MANAGE_RCP: 'manage_rcp', // Create/Edit RCP Rules
    DELETE_RCP: 'delete_rcp', // Delete RCP
    FORCE_ASSIGNMENT: 'force_assignment', // Override conflicts

    // --- PERSONAL & OPERATIONAL ---
    VIEW_OWN_PROFILE: 'view_own_profile',
    MANAGE_OWN_AVAILABILITY: 'manage_own_availability', // Declare absences
    CHOOSE_RCP_PRESENCE: 'choose_rcp_presence', // Vote present/absent
    MANAGE_ALERTS: 'manage_alerts', // Interact with alerts dashboard
};

// The Dictionary for UI generation with Categories
export const AVAILABLE_PERMISSIONS: (PermissionItem & { category: string })[] = [
    // ADMINISTRATION
    { key: PERMISSION_KEYS.VIEW_ADMIN_PANEL, label: "Accès Panel Admin", description: "Accès global au module d'administration", category: "Administration" },
    { key: PERMISSION_KEYS.MANAGE_ROLES, label: "Gestion des Rôles", description: "Modifier les permissions des autres rôles", category: "Administration" },
    { key: PERMISSION_KEYS.MANAGE_SYSTEM, label: "Paramètres Système", description: "Gérer les jours fériés et l'algorithme", category: "Administration" },

    // GESTION ÉQUIPE
    { key: PERMISSION_KEYS.MANAGE_DOCTORS, label: "Voir l'équipe", description: "Accès à la liste des médecins", category: "Gestion Équipe" },
    { key: PERMISSION_KEYS.CREATE_DELETE_DOCTORS, label: "Ajout/Suppression", description: "Créer ou supprimer des comptes médecins", category: "Gestion Équipe" },
    { key: PERMISSION_KEYS.EDIT_OTHERS_PROFILE, label: "Modifier Tiers", description: "Modifier le profil d'un autre médecin", category: "Gestion Équipe" },

    // PLANIFICATION & RÈGLES
    { key: PERMISSION_KEYS.MANAGE_RULES, label: "Configurer Règles", description: "Modifier la semaine type et les postes", category: "Planification" },
    { key: PERMISSION_KEYS.MANAGE_RCP, label: "Gérer les RCP", description: "Créer et modifier les définitions RCP", category: "Planification" },
    { key: PERMISSION_KEYS.DELETE_RCP, label: "Supprimer RCP", description: "Droit de suppression définitive", category: "Planification" },
    { key: PERMISSION_KEYS.MANAGE_SCHEDULE, label: "Éditer Planning", description: "Modifier le planning global manuellement", category: "Planification" },
    { key: PERMISSION_KEYS.FORCE_ASSIGNMENT, label: "Forcer Affectation", description: "Outrepasser les conflits", category: "Planification" },

    // QUOTIDIEN & PERSONNEL
    { key: PERMISSION_KEYS.VIEW_DASHBOARD, label: "Tableau de Bord", description: "Accès à la vue d'ensemble", category: "Opérationnel" },
    { key: PERMISSION_KEYS.VIEW_OWN_PROFILE, label: "Mon Profil", description: "Accès à son espace personnel", category: "Opérationnel" },
    { key: PERMISSION_KEYS.MANAGE_OWN_AVAILABILITY, label: "Déclarer Absences", description: "Poser ses congés et indisponibilités", category: "Opérationnel" },
    { key: PERMISSION_KEYS.CHOOSE_RCP_PRESENCE, label: "Présence RCP", description: "Indiquer sa présence/absence aux RCP", category: "Opérationnel" },
    { key: PERMISSION_KEYS.MANAGE_ALERTS, label: "Gérer Alertes", description: "Voir et résoudre les alertes", category: "Opérationnel" },
];
