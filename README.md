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
- Tableau de bord : KPIs globaux (dont documents manquants, commandes en attente, livraisons attendues/en retard), projets par phase, alertes automatiques
- **8 phases** alignées sur le cahier des charges (Études → Travaux préparatoires → Achats de matériels → Construction → Installation → Tests → Réception → Mise en service). Cliquer sur une étape ouvre directement le module concerné — **Achats de matériels**, **Construction** et **Installation** renvoient vers leurs onglets fonctionnels (Achats, Travaux, Équipements) pour éviter toute redondance ; les autres étapes ont leur propre checklist.
- **Checklist "Études"** (fusion Administration + Études techniques) : suivi Document requis/disponible/validé/expiré (Oui/Non). Tant qu'un document n'est pas validé, un responsable et des dates prévue/réelle peuvent être renseignés (utile en cas de lenteur administrative) ; une fois validé, ces champs se masquent.
- **Achats — cycle complet lié aux fournisseurs** : Demandes de besoin → Pro forma → Bons de commande → Factures → Garanties
- Planning, Travaux (checklist chantier avec %), Équipements (avec coût total et dates de livraison), Livraisons, Risques & blocages
- **Documents** : import réel PDF, Word, Excel et photos (max ~700 Ko, stockés dans Firestore), date d'expiration, utilisateur ayant importé, **galerie photos** dédiée
- **Budget** : vue globale tous projets + ventilation par catégorie (Études, Construction, Cuves, Électricité…) par projet
- **Responsables & travaux** : vue transversale de tous les responsables et fournisseurs actifs, tous projets confondus
- **Historique** : journal de traçabilité (qui a fait quoi, quand, ancienne → nouvelle valeur) sur les actions clés
- **Import / Export Excel** : export de la comparaison et des fournisseurs en `.xlsx` ; import de fournisseurs et d'équipements depuis un fichier Excel/CSV, avec détection de doublons
- **Assistant documentaire** : répond à des questions simples (documents manquants, montants de BC, livraisons, avancement) en s'appuyant uniquement sur les données déjà saisies dans l'app, avec la source citée
- **Rapports** : rapport complet par projet (infos générales, avancement par phase, planning, travaux, finance, fournisseurs, bons de commande, livraisons, documents manquants, documents, **photos**, alertes, risques) avec le **papier en-tête Alcom Petroleum**, imprimable/exportable en PDF. Import de documents de rapport possible.
- Recherche globale, comparaison entre projets avec filtres (pays, ville, statut) et export Excel
- Fournisseurs (base centralisée par catégorie)
- Alertes enrichies : retards, documents expirants/expirés, BC non signés, factures en retard, livraisons partielles/en retard, dépassement budgétaire
- Utilisateurs & rôles, PWA installable

### ⚠️ Limites honnêtes à connaître
- **L'Assistant documentaire n'est pas une IA générative** : il répond par recherche structurée dans les données déjà saisies (pas d'invention, réponses toujours sourcées), mais ne "comprend" pas le langage naturel comme ChatGPT. C'est volontaire et conforme à l'esprit du cahier ("les réponses doivent s'appuyer uniquement sur les données disponibles").
- **Pas de véritable OCR** (lecture automatique de texte dans les PDF/photos scannées) : cela nécessiterait un service payant externe non configuré. Les documents s'importent et se consultent normalement, juste sans extraction automatique du texte.
- **Pas de vue Gantt visuelle** pour le planning (liste avec dates/responsables/statuts uniquement).

## 5. Comment exporter un rapport en PDF sur iPhone
Dans l'onglet **Rapports**, clique sur **Générer le rapport** d'un projet → la boîte de dialogue d'impression Safari s'ouvre → choisis **Enregistrer au format PDF**.

## 6. Nouvelle collection Firestore
Le journal d'historique et l'annuaire des contacts utilisent deux nouvelles collections (`activityLogs`, `contacts`), couvertes par les mêmes règles Firestore que ci-dessus (aucune action supplémentaire nécessaire).

## 7. Permissions par module
Depuis **Paramètres → Utilisateurs**, tu peux maintenant choisir précisément quels modules chaque utilisateur voit (bouton ✎ à côté de son nom). **Administrateur, Direction et DAF ont toujours accès à tout**, sans configuration possible — ce sont les seuls comptes "pleins pouvoirs".

⚠️ **Important à savoir** : cette restriction se fait côté affichage (l'utilisateur ne voit pas les modules non autorisés dans l'application). Ce n'est **pas** une sécurité au niveau de la base de données elle-même — un utilisateur techniquement averti pourrait théoriquement contourner l'interface. Pour une vraie étanchéité des données par rôle, il faudrait des règles Firestore plus poussées (hors du périmètre actuel, faisable plus tard si besoin).

## 8. Appel et WhatsApp direct
Fournisseurs et responsables ont maintenant un numéro de téléphone cliquable (📞 appelle directement, 💬 ouvre WhatsApp avec un message pré-rempli). Pour les responsables, ajoute leur numéro une fois depuis **Responsables & travaux** — il sera ensuite réutilisé partout, y compris pour les alertes.
