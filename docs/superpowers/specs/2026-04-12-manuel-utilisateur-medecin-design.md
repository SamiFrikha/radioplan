# Design Spec — Manuel Utilisateur RadioPlan AI (Médecin)

**Date :** 2026-04-12  
**Auteur :** Jaster86  
**Statut :** Approuvé  

---

## Contexte

RadioPlan AI est une application web de gestion de planning pour le **Service de Radiothérapie de l'Hôpital Henri Mondor**. Elle permet d'organiser les consultations, RCP, activités (astreintes, Unity, workflow) et absences des médecins.

Ce manuel est destiné exclusivement aux **utilisateurs médecins** (rôle `doctor`). Les fonctionnalités d'administration (gestion d'équipe, configuration des règles, données, logs) ne sont pas couvertes.

---

## Objectif du document produit

Produire un **fichier Word (.docx)** de 15-20 pages servant de manuel d'utilisation complet pour les médecins du service. Il doit :

- Expliquer toutes les fonctionnalités accessibles au rôle médecin
- Détailler la logique de répartition automatique des activités
- Être accessible et direct (pas de jargon technique)
- Pouvoir être exporté en PDF pour distribution

---

## Paramètres du document

| Paramètre | Valeur |
|-----------|--------|
| Format | Word .docx (A4) |
| Longueur cible | 15–20 pages |
| Langue | Français |
| Ton | Accessible et direct, phrases courtes, tutoiement possible |
| Police | Arial 11pt (corps), 16pt (H1), 13pt (H2) |
| Établissement | Hôpital Henri Mondor — Service Radiothérapie |
| Version | v1.0 — Avril 2026 |
| En-tête | "RadioPlan AI — Hôpital Henri Mondor, Service Radiothérapie" |
| Pied de page | "Manuel Utilisateur — Médecin — v1.0 — 2026" + numéro de page |

---

## Structure du document

### Page de couverture
- Titre : **RadioPlan AI**
- Sous-titre : **Manuel Utilisateur — Médecin**
- Établissement : Hôpital Henri Mondor — Service Radiothérapie
- Date : Avril 2026
- Version : v1.0

### Table des matières
- Liens internes cliquables vers chaque chapitre

---

### Chapitre 1 — Premiers pas (~2 pages)

**Objectif :** Permettre à un médecin de se connecter et de comprendre l'interface en 5 minutes.

**Contenu :**
1. **Connexion** : accéder à l'URL de l'application, saisir email + mot de passe, lien "Mot de passe oublié" → réinitialisation par email
2. **Découvrir l'interface** :
   - Sidebar (desktop) : logo RadioPlan AI + liens de navigation
   - Navigation mobile (barre du bas) : icônes des pages principales
   - Cloche de notification (coin supérieur droit sur mobile, dans la sidebar sur desktop)
3. **Les pages accessibles au médecin** : tableau récapitulatif des 5 pages + leur rôle
4. **Installer l'app sur mobile** : astuce PWA — "Ajouter à l'écran d'accueil" depuis Safari/Chrome
5. **Se déconnecter** : bouton en bas de la sidebar

---

### Chapitre 2 — Tableau de bord (~2 pages)

**Objectif :** Lire l'état de la semaine et comprendre les indicateurs clés.

**Contenu :**
1. **Vue jour vs vue semaine** : bouton bascule en haut à droite, navigation par flèches
2. **Cartes de statistiques** : nombre de médecins présents, absences, conflits détectés, activités planifiées
3. **Lire le planning du jour** : chaque slot affiché avec le médecin assigné, la période (matin/après-midi), le lieu
4. **Les conflits** : définition (un médecin assigné alors qu'il est absent), icône triangle orange, que faire → contacter l'administrateur
5. **Jours fériés** : automatiquement grisés, le système ne génère pas de slots sur les jours fériés
6. **Semaine verrouillée** : icône cadenas = la semaine a été validée par l'admin, lecture seule

---

### Chapitre 3 — Mon Planning (~3 pages)

**Objectif :** Consulter et gérer son propre agenda semaine/mois.

**Contenu :**
1. **Vue semaine** :
   - Tes slots mis en évidence (couleur de ton badge médecin)
   - Types de slots : Consultation (Box 1/2/3), RCP, Activité (Astreinte/Unity/Workflow)
   - Cliquer sur un slot → détails : lieu, période, co-médecins éventuels
2. **Vue mois** : calendrier mensuel de ses slots, navigation par mois
3. **Modifier une consultation** : si tu es assigné à un Box, tu peux demander un remplacement via le slot
4. **Confirmer sa présence à un RCP** :
   - Cliquer sur un slot RCP → modal de présence
   - Statut PRÉSENT/ABSENT → le premier PRÉSENT verrouille le slot
5. **Navigation** : flèches semaine/mois, retour à aujourd'hui

---

### Chapitre 4 — Planning Global (~2 pages)

**Objectif :** Visualiser le planning de toute l'équipe sur une semaine.

**Contenu :**
1. **Lecture du tableau** : lignes = créneaux (matin/après-midi), colonnes = jours, cellules = médecin assigné avec son badge couleur
2. **Codes couleur** : chaque médecin a une couleur unique, légende en bas de page
3. **Types de slots** (icônes) :
   - Consultation → salle Box
   - RCP → réunion pluridisciplinaire
   - Activité → astreinte / Unity / Workflow
   - Machine → poste machine
4. **Semaine verrouillée** : cadenas affiché, aucune interaction possible
5. **Export** : bouton "PDF" → génère un PDF du planning semaine ; bouton "Image" → capture PNG
6. **Accès conditionnel** : cette page n'est visible que si l'administrateur a accordé la permission `view_planning`

---

### Chapitre 5 — Activités & Répartition automatique (~3 pages)

**Objectif :** Comprendre les trois types d'activités et la logique qui décide qui fait quoi.

**Contenu :**

#### 5.1 Les trois types d'activités
| Activité | Couleur | Description |
|----------|---------|-------------|
| Astreinte | Corail 🔴 | Garde/astreinte sur site ou à distance |
| Unity | Violet 🟣 | Supervision de la machine Unity |
| Supervision Workflow | Vert 🟢 | Supervision du circuit patients/workflow |

#### 5.2 Logique de répartition automatique
Le système attribue chaque activité en suivant ces règles, dans l'ordre :

1. **Vérification des disponibilités** : un médecin absent ce jour-là est automatiquement exclu
2. **Calcul du score d'équité** :
   > Score = (nombre d'activités déjà effectuées dans le groupe) ÷ (taux de travail du médecin)
   
   Un mi-temps (50%) accumule des points deux fois moins vite qu'un plein temps — il est donc remis en lice plus rapidement.
3. **Le médecin avec le score le plus bas est désigné** — c'est lui qui a le moins fait proportionnellement.
4. **En cas d'égalité** : tirage aléatoire entre les ex-æquo.

#### 5.3 Groupes d'équité
La répartition est gérée séparément par groupe :
- **Groupe 1 — Unity + Astreinte** : ces deux activités partagent le même compteur. Faire une astreinte "compte" autant que faire une Unity.
- **Groupe 2 — Workflow** : compteur indépendant.

**Pourquoi des groupes ?** Pour éviter qu'un médecin qui fait beaucoup d'astreintes soit épargné sur les Unity, ou inversement.

#### 5.4 Semaine verrouillée
Une fois qu'un administrateur valide une semaine (cadenas), le planning des activités est figé. Plus aucun recalcul automatique n'a lieu.

#### 5.5 Que faire si tu penses qu'une attribution est incorrecte ?
Contacter l'administrateur — il peut modifier manuellement un slot avant de verrouiller la semaine.

---

### Chapitre 6 — Mon Profil & Absences (~2 pages)

**Objectif :** Gérer ses disponibilités, ses informations personnelles et ses préférences.

**Contenu :**

#### 6.1 Déclarer une absence
1. Aller dans "Mon Profil" → onglet "Absences"
2. Cliquer "Ajouter une absence"
3. Saisir la date de début, date de fin, type d'absence (congé, formation, autre)
4. Valider → l'absence est immédiatement prise en compte dans le planning

#### 6.2 Exclure des demi-journées récurrentes
- Permet de déclarer qu'on n'est jamais disponible certains créneaux (ex : mercredi matin, vendredi après-midi)
- Ces exclusions sont prioritaires sur l'attribution automatique

#### 6.3 Modifier sa photo de profil
- Bouton appareil photo sur l'avatar → choisir une image depuis l'appareil

#### 6.4 Changer de mot de passe
- Lien "Modifier le mot de passe" → email de réinitialisation envoyé

#### 6.5 Notifications push (mobile)
- Onglet "Notifications" dans le profil
- Activer/désactiver chaque type de notification individuellement
- Sur mobile : accepter la permission push du navigateur pour recevoir des alertes même quand l'app est fermée

---

### Chapitre 7 — Notifications & Remplacements (~2 pages)

**Objectif :** Comprendre les notifications reçues et savoir répondre à une demande de remplacement.

**Contenu :**

#### 7.1 La cloche de notifications
- Badge rouge = nombre de notifications non lues
- Cliquer → panneau latéral (drawer) avec la liste des notifications
- Actions globales : "Tout marquer comme lu", "Tout effacer"

#### 7.2 Types de notifications reçues
| Icône | Type | Déclencheur |
|-------|------|-------------|
| 🎲 | RCP auto-assigné | Tu as été tiré au sort pour un RCP |
| ✅ | RCP confirmé | Un autre médecin a confirmé sa présence |
| ⏰ | Rappel RCP 24h | Un RCP a lieu demain |
| ⚠️ | Rappel RCP 12h | Un RCP a lieu dans 12h |
| 🚨 | RCP sans assigné | Alerte : un RCP n'a personne |
| 🔄 | Demande de remplacement | Un collègue te demande de le remplacer |
| ✅ | Remplacement accepté | Quelqu'un a accepté ta demande |
| ❌ | Remplacement refusé | Ta demande a été refusée |

#### 7.3 Répondre à une demande de remplacement
Quand tu reçois une notification 🔄 :
1. Ouvre la cloche → clique sur la notification
2. Les détails du créneau s'affichent (date, heure, type, lieu)
3. Clique **Accepter** ou **Refuser**
4. Si tu acceptes : le planning est mis à jour automatiquement, le médecin demandeur est informé

#### 7.4 Demander un remplacement
Depuis "Mon Planning" ou le "Tableau de bord" :
1. Clique sur le slot concerné
2. Bouton "Demander un remplacement" → sélectionne le médecin cible
3. Le médecin cible reçoit une notification 🔄

---

## Contraintes techniques de génération

- Outil : bibliothèque `docx` (Node.js) — `npm install -g docx`
- Script de génération : `scripts/generate-manuel-medecin.js`
- Fichier de sortie : `docs/Manuel_Utilisateur_Medecin_RadioPlan.docx`
- Validation après génération : `python scripts/office/validate.py`
- Listes : utiliser `LevelFormat.BULLET` (jamais de bullets Unicode)
- Tableaux : `WidthType.DXA`, dual widths obligatoires
- Page size : A4 (11906 × 16838 DXA), marges 1440 DXA (1 pouce)

---

## Critères de succès

- [ ] Document s'ouvre correctement dans Word et LibreOffice
- [ ] Table des matières générée avec liens cliquables
- [ ] En-têtes et pieds de page présents sur toutes les pages
- [ ] 15–20 pages dans Word
- [ ] Toutes les sections du plan ci-dessus couvertes
- [ ] Logique de répartition expliquée avec la formule et les groupes d'équité
- [ ] Ton accessible et direct, sans jargon technique
- [ ] Aucune mention de fonctionnalités admin
