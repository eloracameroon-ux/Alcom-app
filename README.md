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
(Règle simple pour démarrer : tout utilisateur connecté peut lire/écrire — Direction, DAF et toutes les équipes voient l'ensemble des projets et de leurs détails.)

### Documents et photos
Les fichiers joints (PDF, Word, Excel, photos) sont stockés **directement dans Firestore**, pas besoin de Firebase Storage ni du forfait payant Blaze. Limite : ~700 Ko par fichier — largement suffisant pour la plupart des documents et des photos compressées.

### Premier compte administrateur
Le tout premier compte qui se connecte devient automatiquement **Administrateur**. Crée-le dans Firebase Console → Authentication → Users → Add user, puis connecte-toi avec dans l'appli.

## 2. Déployer sur GitHub + Vercel

1. Crée un dépôt GitHub, pousse ce dossier tel quel (aucune étape de build, fichiers statiques).
2. Sur https://vercel.com → **Add New Project** → importe le dépôt → laisse les réglages par défaut (pas de framework, dossier racine) → **Deploy**.
3. L'app est en ligne sur `https://ton-projet.vercel.app`.

## 3. Installer le logo sur l'écran d'accueil / bureau
Une fois déployée, ouvre le lien sur mobile → menu du navigateur → **Ajouter à l'écran d'accueil**. Le logo Alcom Petroleum s'affiche comme icône (grâce à `manifest.json`).

## 4. Ce qui est livré
- Connexion sécurisée (Firebase Auth), thème sombre aux couleurs Alcom Petroleum (rouge/or)
- Accès complet pour Administrateur, Direction et DAF/Finance
- Tableau de bord : KPIs globaux, projets par phase, alertes automatiques
- **Checklist par phase** : clique sur n'importe quelle étape du parcours (Préparation, Études, Autorisations, Conception, Achats, Construction, Installation, Tests, Réception, Mise en service) pour ouvrir son interface dédiée, avec la liste réelle des points à respecter (études géotechniques, autorisations réglementaires, gros œuvre, équipements pétroliers…), responsable, statut, % d'avancement et dates par point. Navigation libre entre les phases.
- **Achats — cycle complet lié aux fournisseurs** : Demandes de besoin → Pro forma → Bons de commande → Factures → Garanties, chaque sous-module avec ses propres statuts
- Planning, Travaux (checklist chantier avec %), Équipements, Livraisons, Risques & blocages
- **Documents** : import réel PDF, Word, Excel et photos (max ~700 Ko, stockés dans Firestore)
- **Rapports** : génération d'un rapport complet par projet (informations générales, avancement par phase, finance, bons de commande, documents, risques) avec le **papier en-tête Alcom Petroleum** (logo + coordonnées légales), imprimable et exportable en PDF directement depuis le navigateur. Import de documents de rapport (Word/PDF/Excel) possible également.
- Recherche globale, comparaison entre projets
- Fournisseurs (base centralisée par catégorie)
- Utilisateurs & rôles, PWA installable

## 5. Comment exporter un rapport en PDF sur iPhone
Dans l'onglet **Rapports**, clique sur **Générer le rapport** d'un projet → la boîte de dialogue d'impression Safari s'ouvre → choisis **Enregistrer au format PDF** (icône de partage → Imprimer → pincer l'aperçu pour l'agrandir → partager/enregistrer).

## 6. Prochaines étapes possibles
- Vue Gantt visuelle pour le planning (au-delà de la liste actuelle)
- Photos multiples par tâche de travaux/livraison (actuellement : documents projet uniquement)
- Rapports PDF/Excel exportés en un clic (au-delà de l'impression navigateur)
- Import Excel/CSV en masse
- Assistant documentaire IA (Phase 2, comme prévu au cahier des charges)
- OCR automatique sur les documents importés
