# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet suit le [Semantic Versioning](https://semver.org/lang/fr/).

---

## [2.0.6] — 2026-05-10

### Corrigé
- **Authentification mode Token** : suppression du champ email obligatoire — l'`unique_id` est maintenant dérivé du `firebase_uid` récupéré automatiquement depuis le token ; l'email reste optionnel pour personnaliser le nom de l'entrée
- **`coordinator.py`** : le fallback `authenticate()` en cas d'échec du refresh n'est plus tenté en mode token (pas de mot de passe disponible) — évitait une exception silencieuse
- **`api.py`** : `_oauth_mode` était un attribut booléen figé à la construction du client ; converti en `@property oauth_mode` calculée dynamiquement — corrige les cas où le refresh token est restauré depuis le storage après l'init
- **`__init__.py`** : la détection d'occupant dans `set_spool_rack` comparait les mauvais champs Firestore (`level`/`position` = capacités du rack) au lieu de `spool_level`/`spool_position` — l'éjection automatique de l'occupant ne fonctionnait jamais côté Python

### Modifié
- **Traductions** : libellé "Refresh Token Firebase" renommé en "Token" dans toutes les langues ; description du step token simplifiée avec lien direct vers l'utilitaire [TigerTag-Token](https://github.com/Kenny3231/TigerTag)

---

## [2.0.5] — 2026-05-10

### Corrigé
- **`tigertag-card.js`** : clignotement au survol des bobines en mode grille — `set hass` recréait tout le DOM à chaque update HA ; remplacé par un rendu différentiel (seules les cartes dont le contenu a changé sont remplacées) + guard `_computeDataHash` pour ignorer les updates sans changement réel
- **`tigertag-card.js`** : les tags rack (nom du rack) n'apparaissaient plus sur les cartes bobines après leur déplacement — `_refreshSpoolCard` et `_refreshPanelTags` appelés immédiatement après chaque action locale
- **`tigertag-card.js`** : les racks n'étaient pas inclus dans le hash de données — la grille ne se rerenderait pas quand les racks chargeaient après les bobines

### Ajouté
- **`tigertag-card.js`** : méthode `_refreshSpoolCard(s)` — mise à jour ciblée d'une carte grille sans recréer toute la grille
- **`tigertag-card.js`** : méthode `_getSlotOccupant(rackId, level, position, excludeUid)` — détection locale de l'occupant d'un slot rack
- **`tigertag-card.js`** : indicateurs 🟢 (libre) / 🔴 (occupé) sur chaque position dans le sélecteur rack ; le slot actuel de la bobine est toujours affiché en 🔴
- **`tigertag-card.js`** : bouton "Assigner" devient "⚠️ Assigner (remplacer)" en orange si le slot cible est déjà occupé
- **`tigertag-card.js`** : affichage des niveaux en lettres (A, B, C…) et des positions en chiffres (1, 2, 3…)
- **`tigertag-card.js`** : mise à jour des indicateurs 🟢/🔴 après assignation (ancien slot → vert, nouveau → rouge)

---

## [2.0.4] — 2026-05-09

### Corrigé
- **`api.py`** : `set_spool_rack` écrivait les champs plats `level`/`position` à la racine du document Firestore (= capacités du rack) au lieu de l'objet imbriqué `rack: {id, level, position}` — les modifications de position n'étaient jamais persistées dans Firebase
- **`api.py`** : `get_inventory` lisait `d.get("level")` et `d.get("position")` (capacités du rack) au lieu de `rack.level`/`rack.position` (vraie position de la bobine) — corrigé avec normalisation en `spool_level`/`spool_position`
- **`api.py`** : `rack_id` plat pouvait être `null` dans Firestore même si `rack.id` était renseigné (coexistence des deux formats selon la version de l'app) — `rack.id` est maintenant prioritaire
- **`api.py`** : synchronisation twin rack en mémoire + correction Firestore différée si un tag a son rack et pas son twin

### Modifié
- **`api.py`** : les champs `rack_id`, `_rackId`, `_rackLevel`, `_rackPos` plats sont ignorés en lecture — seul l'objet imbriqué `rack: {id, level, position}` fait foi
- **`sensor.py`** : `rack_name`, `rack_order`, `rack_level_count`, `rack_position_count` retirés des attributs du sensor bobine — ces informations appartiennent au rack, pas à la bobine
- **`sensor.py`** : `StatsSensor` enrichi avec la grille complète des racks (`racks[rack_id].spools`)
- **`tigertag-card.js`** : `rack_name`/`rack_order`/`rack_level_count`/`rack_position_count` résolus dynamiquement depuis `_getRacks()` au lieu des attributs du sensor bobine

---

## [2.0.3] — 2026-05-09

### Corrigé
- **`sensor.py`** : filtre des attributs `extra_state_attributes` — les valeurs `0` et `False` étaient incorrectement exclues (priorité des opérateurs `and`/`or`) ; `rack_level=0` et `rack_position=0` n'étaient jamais exposés
- **`sensor.py`** : `rack_name`, `rack_order`, `rack_level_count`, `rack_position_count` retirés des attributs bobine au profit du `StatsSensor`

### Ajouté
- **`tigertag-card.js`** : règle métier "Firebase prioritaire" dans le mapping spool — si `rack_id` est présent dans Firestore, `ams_entity` est forcé à `null` au refresh
- **`tigertag-card.js`** : éjection locale de l'occupant AMS/rack lors de l'assignation depuis la carte
- **`tigertag-card.js`** : propagation twin dans `_setRack` et `_setAms`

---

## [2.0.2] — 2026-05-08

### Corrigé
- **`config_flow.py`** : `async_step_user` redirigeait directement vers `async_step_password` sans afficher le choix du mode d'authentification — le mode Token était inaccessible depuis l'UI
- **`config_flow.py`** : mode token ne stockait pas `CONF_PASSWORD` dans `entry.data` — `KeyError` possible au rechargement
- **Traductions** (`en/fr/de/es/nl.json`) : fichiers entièrement réécrits — décrivaient un ancien flow avec `api_key` et `locations` inexistants ; HA affichait des clés brutes
- **`manifest.json`** : suppression de la dépendance `mqtt` inutile — bloquait le chargement sans MQTT configuré

### Ajouté
- **`config_flow.py`** : step `user` avec sélecteur de mode (Email/Password ou Token) utilisant les `selector` HA natifs
- **`api.py`** : `set_weight` persiste maintenant `container_weight` dans Firestore (champ ignoré précédemment)
- **Traductions** : ajout DE (Deutsch) et NL (Nederlands)

---

## [2.0.1] — 2026-05-07

### Corrigé
- Erreur d'import `CONF_API_KEY` au démarrage — résidu d'une ancienne version de `const.py`

---

## [2.0.0] — 2026-05-01

### Première version publique

#### Fonctionnalités
- Synchronisation de l'inventaire TigerTag dans Home Assistant via Firebase/Firestore REST
- Authentification Email/Password avec refresh automatique du token toutes les 55 min
- Sensor par bobine avec tous les attributs (poids, couleur, températures, liens)
- Entité number pour modification du poids directement depuis HA
- Gestion des Twin Tags (bobines avec 2 puces RFID) — déduplication automatique
- Image produit officielle pour TigerTag+ ou SVG coloré dynamique pour TigerTag classiques
- Sensor de statistiques globales (count_unique, total_weight_kg, count_low_stock…)
- Tare masterspool personnalisable par bobine
- Intégration Bambu Lab — envoi configuration filament vers AMS via `bambu_lab.set_filament`
- Rafraîchissement automatique (5 min) + service `refresh` pour forçage immédiat
- Nettoyage automatique des bobines supprimées (`deleted: true`) et des entités orphelines
- Carte Lovelace custom `tigertag-card` avec grille, recherche, filtres et panneau détail
- Traductions FR, EN, ES
- Enregistrement automatique de la carte Lovelace (mode UI) ou instruction pour mode YAML

#### Services HA
- `tigertag.update_spool_weight` — mise à jour poids (Twin Tag géré automatiquement)
- `tigertag.set_spool_rack` — assignation rack + niveau + position
- `tigertag.set_spool_tare` — tare custom masterspool
- `tigertag.set_bambu_ams_filament` — envoi vers AMS Bambu Lab
- `tigertag.fetch_bambu_profiles` — récupération profils filament Bambu
- `tigertag.refresh` — rafraîchissement forcé

#### Technique
- Client Firebase REST pur (pas de SDK) — aiohttp + async
- Filtrage `deleted: true` à la source dans l'API
- `entity_id` forcés avec préfixe `tigertag_` indépendamment du nom de l'appareil
- Cache local des tables de référence (24h) avec fallback hors ligne
- Persistance locale des emplacements AMS, tares et tokens entre les redémarrages
- `has_entity_name = False` sur toutes les entités

---

## À venir

- Widget grille 2D visuelle des racks dans la carte Lovelace
- Support multi-imprimantes (A1, X1, P1…)
- Support des bobines multicolores (gradient, conique)
- Packaging HACS officiel
