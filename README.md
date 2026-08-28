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

## 9. Modifier et supprimer — réservé à Administrateur / Direction / DAF
Le bouton 🗑️ apparaît maintenant partout (documents, fournisseurs, bons de commande, factures, pro forma, garanties, équipements, livraisons, risques, planning, utilisateurs) mais **uniquement pour les comptes à accès complet**. Chaque suppression demande une confirmation et est tracée dans l'Historique.

**Étapes du projet entièrement personnalisables** : dans l'onglet Checklist, l'administrateur peut désormais :
- Ajouter un point à n'importe quelle étape (bouton "+ Ajouter un point")
- Supprimer un point existant (🗑️ sur chaque ligne)
- Créer une étape entièrement personnalisée propre à un projet (bouton "+ Étape" à côté du sélecteur de phases, marquée ★) avec sa propre checklist, et la supprimer ensuite si besoin

Les 8 étapes standard (Études, Travaux préparatoires…) restent le socle commun à tous les projets — c'est ce qui permet la comparaison et les statistiques du tableau de bord — mais leur contenu (les points de checklist) est entièrement modifiable, et tu peux ajouter autant d'étapes personnalisées que nécessaire par projet.

**Dates antidatables** : les champs de date (besoins, bons de commande, documents, points de checklist) acceptent désormais n'importe quelle date passée — utile pour enregistrer des tâches déjà réalisées il y a plusieurs semaines ou mois.

## 10. Import de documents (PDF) — Bons de commande, Pro forma, Factures
Le bouton **"📄 Depuis un PDF"** (Achats → Bons de commande / Pro forma / Factures) lance une analyse structurelle du document :
- **Type détecté automatiquement** (Bon de commande, Facture, Pro forma, Devis, Reçu) par reconnaissance de mots-clés
- **Colonnes du tableau détectées dynamiquement** à partir de la ligne d'en-tête réelle du document (Désignation, Qté, P.U., Montant… peu importe l'ordre ou les intitulés exacts) — pas un modèle figé sur un seul type de bon de commande
- **Champs généraux** recherchés dans le texte : numéro, dates, fournisseur, client, objet (déduit automatiquement des désignations si absent), montants HT/TVA/TTC, échéance

Un **écran de relecture** s'ouvre ensuite avec tout pré-rempli mais **entièrement modifiable** : chaque champ général, et un tableau éditable ligne par ligne (ajout/suppression de lignes) reprenant les colonnes détectées dans le document d'origine. Rien n'est enregistré tant que tu n'as pas validé.

Une fois enregistré, chaque BC/facture/pro forma affiche l'objet et un détail dépliable des articles ; le bouton ✎ permet de rouvrir et corriger n'importe quel enregistrement (importé ou saisi manuellement) à tout moment.

⚠️ **Honnêteté technique** : ce n'est pas une IA qui "comprend" le document — c'est une analyse de la **position du texte** dans le PDF (regroupement en lignes/colonnes à partir des coordonnées), donc générique à n'importe quel fournisseur/modèle, mais pas infaillible. Ça fonctionne uniquement sur un PDF texte (généré par ordinateur) — pas sur un scan/photo, où il faudra saisir manuellement. L'écran de relecture existe précisément pour corriger les rares erreurs d'extraction.

## 11. Documents PDF — téléchargement direct
Tout rapport (projet individuel, tous les projets, comparaison, budget, dépenses, responsables & travaux, fournisseurs, stock) se **télécharge immédiatement en PDF** dès que tu appuies sur le bouton — plus de boîte d'impression, plus d'attente. Chaque PDF reprend le même papier en-tête (logo) et le même bandeau de pied de page (site web, e-mail, téléphone, RCCM, NUI) que tes documents officiels.

Dans l'onglet **Rapports**, une carte "Rapports transversaux" te donne un accès direct à : Budget, Dépenses, Responsables & Travaux, Fournisseurs, Stock — en plus du rapport détaillé par projet et du rapport consolidé (un ou tous les projets).

La fonctionnalité d'import de rapports Word/PDF/Excel a été retirée (elle n'était pas nécessaire) — importe plutôt tes documents directement dans l'onglet Documents de chaque projet, ils apparaîtront aussi dans le module Documentation.

## 12. Nouveaux modules
- **Documentation** : vue centralisée de tous les documents de tous les projets (documents, besoins, BC, factures, pro forma, rapports), filtrable par catégorie.
- **Stock** : suivi du magasin (groupes électrogènes, extincteurs, matériel divers) — quantités, entrées/sorties avec historique, alerte automatique en cas de stock bas.
- **Historique supprimable** : chaque entrée peut être supprimée individuellement, ou l'historique vidé entièrement (Administrateur/Direction/DAF).
- **Budget** : possibilité d'ajouter des catégories personnalisées dans la ventilation, en plus des catégories standard.
- **Construction (Travaux)** : ajout et suppression de tâches, en plus de la mise à jour du statut et de l'avancement.
