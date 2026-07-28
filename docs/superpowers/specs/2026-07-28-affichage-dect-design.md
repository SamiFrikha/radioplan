# Numéro DECT et affichage — conception

Date : 2026-07-28

## Objectif

Permettre de renseigner un numéro de téléphone DECT interne (5 chiffres) sur chaque
profil médecin, et de choisir depuis Gestion d'Équipe où ce numéro s'affiche devant
le nom du médecin.

## Modèle de données

### `doctors.dect`

Colonne `TEXT` nullable, contrainte `CHECK (dect IS NULL OR dect ~ '^[0-9]{5}$')`.
La chaîne vide est normalisée en `NULL` à l'écriture : un médecin sans numéro n'a
pas de valeur, pas une valeur vide.

### `app_settings.dect_display`

`JSONB DEFAULT '{}'::jsonb` sur la ligne singleton `id = 1`.

```ts
interface DectDisplaySettings {
  planningGlobal: boolean;    // Planning global à l'écran (vues Lieu + Médecin)
  planningGlobalPdf: boolean; // Export PDF du planning global (2 vues)
  monPlanning: boolean;       // Agenda personnel
  dashboard: boolean;         // Listes de médecins du tableau de bord
  position: 'before' | 'after';
  style: 'brackets' | 'parentheses' | 'plain' | 'dot' | 'dash' | 'label';
}
```

Les clés de format absentes retombent sur `before` / `brackets`, ce qui reproduit
le comportement d'origine pour un réglage enregistré avant leur ajout.

Réglage **global**, pas par utilisateur : l'onglet vit dans Gestion d'Équipe, réservée
aux admins. Les RLS de la migration 26 conviennent déjà — lecture pour tout compte
authentifié, écriture admin uniquement.

Une clé absente vaut `false`. Le défaut `{}` signifie donc « n'afficher nulle part » :
l'installation d'une base existante ne change pas d'apparence tant que rien n'est coché.

## Format

Un seul endroit décide du format : `services/dectDisplay.ts`.

```
withDect(doctor, settings, surface) → "[12345] Dr Dupont"
```

`withDect` combine les deux décisions — la surface est-elle activée, et sous quelle
forme rendre le numéro — pour qu'aucun appelant n'ait à les tenir séparément.

Position × style donne 12 combinaisons :

| Style | Avant | Après |
|---|---|---|
| `brackets` | `[12345] Dr Dupont` | `Dr Dupont [12345]` |
| `parentheses` | `(12345) Dr Dupont` | `Dr Dupont (12345)` |
| `plain` | `12345 Dr Dupont` | `Dr Dupont 12345` |
| `dot` | `12345 · Dr Dupont` | `Dr Dupont · 12345` |
| `dash` | `12345 — Dr Dupont` | `Dr Dupont — 12345` |
| `label` | `Tél. 12345 Dr Dupont` | `Dr Dupont Tél. 12345` |

Un médecin sans numéro valide garde son nom seul — jamais de crochets vides.

### Pourquoi pas d'icône ☎

Les polices standard de jsPDF encodent en WinAnsi, qui ne contient pas `U+260E`. Un
symbole téléphone s'afficherait correctement à l'écran mais serait absent ou corrompu
dans le PDF. Le style `label` (« Tél. ») remplit le même rôle et rend à l'identique
partout. Le point médian et le tiret cadratin, eux, sont dans WinAnsi et passent.

## Points d'application

| Surface | Emplacements |
|---|---|
| `planningGlobal` | vue Lieu : nom principal, ligne « + secondaires », ligne Congés ; vue Médecin : en-tête de ligne |
| `planningGlobalPdf` | vue Lieu : nom en cellule ; vue Médecin : libellé de ligne ; ligne Congés — la troncature jsPDF existante mesure la chaîne préfixée |
| `monPlanning` | noms de remplaçants (`PersonalAgendaWeek`, `PersonalAgendaMonth`), médecin absent et remplaçant dans la modale de détail |
| `dashboard` | référents et présents RCP, médecin assigné, conflits, absents, médecins non postés |

### Non couvert, volontairement

Les cellules compactes (8–9 px) qui passent déjà les noms par `shortName()` ou ne
gardent que le prénom — grilles de synthèse du Dashboard, pastilles de présence RCP
de l'agenda personnel. Un préfixe de 8 caractères y ferait disparaître le nom sous la
troncature. Les initiales des pastilles rondes colorées restent inchangées partout.

## Gestion d'erreur

`settingsService.update` renvoie désormais un booléen. `setDectDisplay` applique le
changement de façon optimiste puis restaure l'état précédent si l'écriture est
rejetée, et l'onglet affiche une erreur au lieu d'un faux message de succès.

La validation du format DECT est appliquée deux fois : à la saisie (filtrage des
caractères non numériques, 5 max), et avant enregistrement (vide ou exactement 5
chiffres) — cette dernière reflète la contrainte `CHECK` de la base.

## Migration

`supabase/migrations/27_add_dect_display.sql` — idempotente, à exécuter sur la base
avant déploiement. Sans elle, l'onglet Profils Médecins ne peut pas charger sa liste
(le `select` nomme explicitement `dect`).
