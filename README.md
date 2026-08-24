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
- Accès complet pour Administrateur, Direction et DAF/Finance (vue sur l'ensemble des projets)
- Tableau de bord : KPIs globaux, projets par phase, alertes automatiques
- Projets : fiche complète, progression en 10 étapes cliquable (navigation libre entre phases, sans ordre imposé)
- Checklist configurable par projet
- **Planning** : tâches avec dates et responsables
- **Travaux** : checklist de construction avec % d'avancement par tâche
- **Achats / Bons de commande** : création, statuts, montants HT/TTC, mise à jour automatique du montant engagé
- **Équipements** : quantités prévu/commandé/livré/installé par équipement
- **Livraisons** : suivi par équipement, BL, statuts (à venir, en transit, livré, partiel, retard)
- **Documents** : import réel de fichiers PDF, Word, Excel et photos (stockés sur Firebase Storage)
- **Risques & blocages** : criticité, responsable, échéance
- Finance par projet (budget, engagé, payé, solde, écart)
- **Recherche globale** : projets, BC, documents, équipements, fournisseurs
- **Comparaison entre projets** : tableau avancement/budget/retard côte à côte
- Fournisseurs (base centralisée par catégorie)
- Alertes automatiques
- Utilisateurs & rôles
- PWA installable

## 5. Prochaines étapes possibles
- Vue Gantt visuelle pour le planning (au-delà de la liste actuelle)
- Photos multiples par tâche de travaux/livraison (actuellement : documents projet uniquement)
- Rapports PDF/Excel exportés en un clic (au-delà de l'impression navigateur)
- Import Excel/CSV en masse
- Assistant documentaire IA (Phase 2, comme prévu au cahier des charges)
- OCR automatique sur les documents importés
