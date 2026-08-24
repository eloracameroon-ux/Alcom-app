# Alcom Petroleum — Pilotage des projets stations-service

## 1. Configurer Firebase (5 min)

1. Va sur https://console.firebase.google.com → **Créer un projet** → nomme-le par ex. `alcom-petroleum`.
2. Dans le projet : **Authentication** → onglet **Sign-in method** → active **E-mail/Mot de passe**.
3. **Firestore Database** → **Créer une base** → mode **production** → choisis une région (ex. `eur3`).
4. Va dans **Paramètres du projet** (roue crantée) → section **Vos applications** → **Ajouter une application** → icône **Web (</>)** → nomme-la `alcom-app`.
5. Copie l'objet `firebaseConfig` qui s'affiche.
6. Ouvre le fichier **`app.js`**, remplace les 6 valeurs `"REPLACE_ME"` par les tiennes (lignes en haut du fichier).

### Règles Firestore (à coller dans Firestore → Règles)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
(Règle simple pour démarrer : tout utilisateur connecté peut lire/écrire. On affinera par rôle plus tard si besoin.)

### Premier compte administrateur
Le tout premier compte qui se connecte (via "Se connecter" avec un e-mail/mot de passe que tu auras créé dans Firebase Console → Authentication → Users → Add user) devient automatiquement **Administrateur**. Crée ce premier compte dans la console Firebase, puis connecte-toi avec dans l'appli — les comptes suivants pourront être créés directement depuis Paramètres.

## 2. Déployer sur GitHub + Vercel

1. Crée un dépôt GitHub, pousse ce dossier tel quel (aucune étape de build, fichiers statiques).
2. Sur https://vercel.com → **Add New Project** → importe le dépôt → laisse les réglages par défaut (pas de framework, dossier racine) → **Deploy**.
3. L'app est en ligne sur `https://ton-projet.vercel.app`.

## 3. Installer le logo sur l'écran d'accueil / bureau
Une fois déployée, ouvre le lien sur mobile → menu du navigateur → **Ajouter à l'écran d'accueil**. Le logo Alcom Petroleum s'affiche comme icône (grâce à `manifest.json`).

## 4. Ce qui est livré (Phase 1 — Fondations)
- Connexion sécurisée (Firebase Auth) avec logo sur l'écran de login
- Tableau de bord : KPIs globaux, projets par phase, alertes automatiques
- Gestion des projets : création, fiche complète, progression visuelle (10 étapes), changement de phase
- Checklist configurable par projet (terrain, environnement, techniques, achats, construction, mise en service)
- Suivi financier par projet (budget, engagé, payé, solde, écart)
- Documents par projet (liste + statut)
- Fournisseurs (base centralisée par catégorie)
- Alertes automatiques (retards, échéances proches, soldes impayés, étapes bloquées)
- Utilisateurs & rôles (Administrateur, Direction, DAF, Responsable projet, Achats, Responsable travaux, Consultation)
- PWA installable avec logo Alcom Petroleum

## 5. Prochaines étapes (à construire module par module)
- Bons de commande détaillés + processus achats complet (devis → BC → signature → livraison)
- Suivi des livraisons (statuts, BL, retards automatiques)
- Gestion détaillée des équipements (cuves, pompes… quantités prévu/commandé/livré/installé)
- Suivi de construction (checklist chantier avec % avancement, photos)
- Planning (vue calendrier + Gantt)
- Comparaison entre projets, filtres avancés
- Recherche globale
- Rapports PDF/Excel réels (au-delà de l'impression navigateur actuelle)
- Import Excel/CSV
- Assistant documentaire IA (Phase 2, comme prévu au cahier des charges)
