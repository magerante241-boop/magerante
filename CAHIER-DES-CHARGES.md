# MAGERANTE — Cahier des charges (version fusionnée)

## 0. Contexte de départ
L'application existe déjà (repo `magerante241-boop/magerante`). Ce n'est **pas un projet from scratch** : on transforme progressivement une calculatrice existante en application SaaS de gestion des ventes.

**Déjà en place :**
- Inscription propriétaire + statut de validation
- Numpad stylisé (chrome coloré, effets lumineux)
- Modale scrollable
- Menu latéral avec renommage d'établissement

**En cours :** authentification — connexion anonyme avant inscription propriétaire.

**Règle d'or pour la suite du dev :** ne pas détruire l'existant. Avant toute modification d'une fonctionnalité déjà fonctionnelle, expliquer brièvement ce qui va changer et pourquoi.

---

## 1. Objectif final
Une application SaaS légère de gestion des ventes pour propriétaires d'établissements au Gabon (bars, snacks, clubs, restaurants, débits de boissons), avec une interface de saisie ultra-simple pour les gérants.

**Concept central :**
```
PROPRIÉTAIRE → crée et contrôle l'établissement
      → invite le(s) gérant(s) via lien WhatsApp
            → le gérant enregistre les ventes (interface type calculatrice)
                  → les données remontent automatiquement au propriétaire
```

Doit être : simple, rapide, moderne, mobile-first, sécurisé, dynamique, adapté au marché gabonais, accessible à un utilisateur peu à l'aise avec le numérique.

---

## 2. Les deux interfaces (séparation stricte des droits)

| | Propriétaire / Admin | Gérant(e) |
|---|---|---|
| Accès | Paramètres établissement, produits, prix, gérants, ventes, statistiques, historique, données financières, rapports, gestion des accès | Catalogue autorisé, prix nécessaires aux ventes, calculatrice, création de ventes, factures/reçus, historique limité de ses propres opérations |
| Interdits | — | Modifier données financières globales, modifier paramètres propriétaire, voir stats globales sans autorisation, voir données d'autres établissements, créer un admin, modifier les droits du propriétaire |

---

## 3. Interface Propriétaire

### 3.1 Inscription
Champs : nom, prénom, téléphone, email, mot de passe, nom de l'établissement, type d'établissement (Bar / Snack / Club / Restaurant / Autre), localisation, autres infos utiles.

Après inscription → **compte établissement soumis à validation**. Tant que non validé, certaines fonctionnalités restent bloquées.

### 3.2 Invitation du gérant
Une fois l'établissement validé :
- Le propriétaire crée/invite un ou plusieurs gérants
- Le système génère un **lien d'accès unique et sécurisé** par gérant, associé à l'établissement
- Le propriétaire envoie ce lien via WhatsApp
- Le lien est **révocable** depuis l'espace propriétaire

```
Compte établissement validé
   → Génération du lien gérant
      → Envoi via WhatsApp
         → Le gérant clique → accès direct à son interface de travail
```

### 3.3 Tableau de bord
**Vue générale :** CA du jour / semaine / mois, nombre de ventes, produit le plus vendu, produit le moins vendu, état des stocks (si activé).

**Graphiques :** ventes par jour/semaine/mois, produits les plus vendus, comparaison de périodes.

**Historique détaillé :** date, heure, produit, quantité, prix, montant, gérant, mode de paiement.

**Statistiques accessibles :** total des ventes, nombre de ventes, produits vendus, quantités, chiffre d'affaires, ventes par jour/période/gérant, modes de paiement, produits les plus vendus, évolution des ventes.

Le gérant n'a pas accès à ces statistiques globales, sauf permission explicite du propriétaire.

---

## 4. Interface Gérant(e)

Interface volontairement simple, rapide, pensée mobile — pas de tableau de bord complet, pas de formulaires longs.

**A. Calculs** : quantités, prix unitaires, total par produit, total général, remises, mode de paiement (espèces, Mobile Money, autres configurés).

**B. Factures** : enregistrer une vente, générer une facture/reçu, ajouter plusieurs produits à une même vente, modifier une quantité, supprimer un produit avant validation, valider.

**C. Intégration des données** : chaque vente est automatiquement enregistrée dans la base de l'établissement et synchronisée avec le compte propriétaire, sans manipulation supplémentaire du gérant.

**D. Vue journalière du gérant** : produits disponibles, quantités, prix, ventes de son service, total de ses ventes, historique récent de ses propres opérations.

**Flux type d'une vente :**
```
Clic catégorie (ex: BIÈRES) → Clic produit → Sélection quantité → VALIDER → Vente enregistrée
```

---

## 5. Catalogue produits — adapté au marché gabonais (Libreville)

Pas de liste générique occidentale : catégories et produits réellement populaires à Libreville.

**Catégories de base :** Bières, Vins, Champagnes, Liqueurs, Whisky, Vodka, Gin, Rhum, Cognac, Boissons gazeuses, Jus, Eau, Boissons énergétiques, Cocktails, Autres.

**Règles :**
- Produits 100% configurables (ajout, modification nom/prix, désactivation, suppression)
- Création de nouvelles catégories, réordonnancement des boutons
- **Aucun prix codé en dur**

### Adaptation automatique selon le type d'établissement
- **Bar** : bières, vins, liqueurs, whisky, vodka, gin, rhum, cognac, boissons sans alcool
- **Snack** : plats, sandwichs, burgers, frites, boissons, eau, jus, desserts
- **Club** : bières, spiritueux, champagnes, cocktails, énergisantes, softs, eau
- **Restaurant** : entrées, plats, accompagnements, desserts, boissons
- Toujours prévoir une catégorie **Personnalisée**

---

## 6. Architecture des données

```
Utilisateur Propriétaire
   → Établissement
      → Gérant(s)
         → Produits
            → Ventes
               → Factures
                  → Statistiques
```

Chaque établissement a ses données **isolées** (multi-établissement natif).

Chaque vente est rattachée à : établissement, produit, quantité, prix, date, heure, gérant, mode de paiement, ID de transaction.

### Synchronisation
Sync automatique gérant → propriétaire. Prévoir stockage local temporaire + sync différée en cas de connexion instable.

### Notifications (configurables)
Nouvelle vente, CA atteint, stock faible, fin de journée / rapport quotidien, activité inhabituelle.

---

## 7. Sécurité
- Séparation stricte des permissions propriétaire / gérant (voir section 2)
- Lien gérant unique, sécurisé, révocable
- Le gérant ne voit jamais les données d'un autre établissement ni les données financières globales sans autorisation

---

## 8. Roadmap suggérée (à ajuster ensemble)

1. **Auth** — finaliser connexion anonyme → inscription propriétaire (EN COURS)
2. **Fiche établissement** — formulaire complet + statut de validation
3. **Modèle de données Firestore** — structure établissement / gérant / produits / ventes
4. **Génération + gestion du lien d'invitation gérant** (WhatsApp)
5. **Interface gérant** — calculatrice de vente + facture, branchée sur Firestore
6. **Catalogue produits** — catégories par défaut Gabon + configuration propriétaire
7. **Dashboard propriétaire** — stats de base puis graphiques
8. **Sync offline** + notifications

---

## Note pour Claude (instruction de travail)
- Analyser l'architecture actuelle avant toute modification
- Conserver les fonctionnalités existantes qui marchent
- Transformer progressivement, pas de refonte brutale
- Toujours séparer strictement propriétaire / gérant
- Prévoir le multi-établissement dès la structure de données
- Optimiser mobile en priorité
- En cas de choix technique non précisé : privilégier robustesse, sécurité, simplicité de maintenance
- Expliquer brièvement tout changement important avant de l'appliquer
