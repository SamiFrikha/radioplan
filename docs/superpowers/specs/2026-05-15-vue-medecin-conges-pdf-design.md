# Design : Vue par Médecin — Congés + PDF adaptatif

**Date :** 2026-05-15  
**Fichier principal :** `pages/Planning.tsx`  
**Approche retenue :** A — Inline dans les composants existants

---

## Contexte

Le planning global dispose d'une vue par médecin (`viewMode === 'DOCTOR'`) qui affiche les créneaux assignés à chaque médecin par jour et période. Cette vue ne montre pas actuellement les congés/indisponibilités des médecins. De plus, le téléchargement PDF génère toujours la vue par poste, quelle que soit la vue active.

---

## Fonctionnalité 1 : Affichage des congés dans la vue par médecin

### Données disponibles

- `unavailabilities: Unavailability[]` — déjà dans le contexte Planning (ligne 18)
- `isAbsent(doctor, dateStr, period, unavailabilities)` — déjà dans `scheduleService.ts`
- `Unavailability.reason` — texte libre décrivant le motif (congé, maladie, formation…)
- `Unavailability.period` — `'ALL_DAY' | 'Matin' | 'Après-midi'`

### Logique

Dans `renderDoctorCell(doc, day, period)` (`pages/Planning.tsx`, ~ligne 726) :

1. Appeler `isAbsent(doc, day.dateStr, period, unavailabilities)`.
2. Si `true` → trouver l'entrée `Unavailability` correspondante pour récupérer `reason`.
3. Retourner une cellule de remplacement ; sinon continuer le rendu normal.

**Recherche de l'entrée Unavailability :**
```ts
const unaNav = unavailabilities.find(u =>
  u.doctorId === doc.id &&
  day.dateStr >= u.startDate &&
  day.dateStr <= u.endDate &&
  (u.period === 'ALL_DAY' || u.period === period)
);
```

### Apparence de la cellule absente

| Propriété | Valeur |
|---|---|
| Fond | `#FEF2F2` (Tailwind `bg-red-50`) |
| Bordure | `border border-red-200` |
| Texte | `reason` tronqué à 20 caractères, `text-red-600 text-xs font-semibold` |
| Hauteur | Identique aux cellules normales |
| Portée | Uniquement la période concernée (`Matin` ou `Après-midi`) ; si `ALL_DAY` → les deux |

### Comportement ALL_DAY

`isAbsent()` gère déjà `ALL_DAY` correctement — aucune logique supplémentaire nécessaire côté rendu, les deux appels (Matin + Après-midi) retourneront `true` individuellement.

---

## Fonctionnalité 2 : PDF adaptatif selon la vue active

### Dispatch

Au début de `handleDownloadPDF()` (`pages/Planning.tsx`, ~ligne 220) :

```ts
if (viewMode === 'DOCTOR') {
  generateDoctorViewPDF();
  return;
}
// ... code existant vue par poste inchangé
```

### Fonction `generateDoctorViewPDF()`

Définie juste avant `handleDownloadPDF()`, fermeture sur les mêmes variables du composant (`doctors`, `schedule`, `days`, `unavailabilities`, `weekStart`…).

#### Setup jsPDF

Identique à la vue poste :
- Orientation : landscape A4
- Unité : `pt`
- PW = 841.89, PH = 595.28, M = 20

#### Colonnes

| Colonne | Largeur |
|---|---|
| `Médecin` | 70 pt |
| `Créneau` | 32 pt |
| Chaque jour (×5) | `(PW - 2*M - 70 - 32) / 5` |

#### En-tête

- Titre : `PLANNING RADIOTHÉRAPIE — VUE PAR MÉDECIN` (même style bleu `#1E3A5F`)
- Sous-titre : semaine + dates, identique vue poste
- En-têtes colonnes : noms des jours + dates (jours fériés en rouge, même logique)

#### Lignes de données

Pour chaque médecin, 2 lignes (Matin + Après-midi) :

**Colonne gauche (Médecin) :**
- Ligne Matin : disque coloré (couleur médecin) + nom du médecin (font bold 8pt)
- Ligne Après-midi : vide (pas de doublon du nom)

**Colonne Créneau :** `Matin` / `Après-midi` (6pt, gris)

**Cellules jour :**

| État | Fond | Texte |
|---|---|---|
| Absent | `#FEE2E2` | Raison en `#DC2626`, 7pt, centré |
| Slot présent | Même palette que vue poste (`slotBg()`) | Abréviation type + lieu, 7pt |
| Vide | `#F8FAFC` | — |

**Logique cellule absent (PDF) :**
```ts
const absent = isAbsent(doc, day.dateStr, period, unavailabilities);
if (absent) {
  const u = unavailabilities.find(...); // même logique que UI
  // draw red cell with u.reason
}
```

#### Légende bas de page

Même légende que vue poste + entrée supplémentaire :
- `■ Absent / Congé` en `#DC2626`

#### Nommage fichier

`Planning_Medecins_${weekStart}.pdf`

---

## Fichiers modifiés

| Fichier | Modification |
|---|---|
| `pages/Planning.tsx` | `renderDoctorCell()` : ajout détection absence + cellule rouge ; `handleDownloadPDF()` : dispatch + nouvelle `generateDoctorViewPDF()` |

## Fichiers non modifiés

- `scheduleService.ts` — `isAbsent()` réutilisée telle quelle
- `types.ts` — aucun nouveau type nécessaire
- Tous les autres composants

---

## Non-objectifs (hors scope)

- Modifier la vue par poste (comportement PDF inchangé)
- Ajouter des congés à la vue par poste
- Refactoriser `handleDownloadPDF` en fichier séparé
