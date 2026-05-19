# tigertag-home-assistant-third-party — Intégration Home Assistant

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![GitHub release](https://img.shields.io/github/release/Kenny3231/TigerTag.svg)](https://github.com/Kenny3231/tigertag-home-assistant-third-party/releases)
![Maintenance](https://img.shields.io/maintenance/yes/2026.svg)

> **⚠️ Avertissement** : Cette intégration est un projet communautaire **non officiel et non affilié** à TigerTag Project. Elle utilise l'API publique de TigerTag et n'est pas endorsée, soutenue ou maintenue par TigerTag Project.

---

## À propos

Cette intégration Home Assistant permet de synchroniser votre inventaire de bobines de filament [TigerTag](https://tigertag.io) directement dans Home Assistant.

Elle inclut :
- Une **intégration HA** (sensors, entités number) pour chaque bobine
- Une **carte Lovelace custom** (`tigertag-card`) pour gérer visuellement votre stock

---

## Fonctionnalités

- 📦 **Inventaire synchronisé** — toutes vos bobines TigerTag dans HA (rafraîchissement toutes les 5 min + bouton manuel)
- ⚖️ **Modification du poids** — modifiez le poids restant directement depuis la carte ou via service HA
- 🔗 **Twin Tag** — déduplication automatique des bobines avec 2 puces RFID, propagation rack/poids sur les deux UIDs
- 🖼️ **Images produit** — photo officielle pour les TigerTag+, SVG coloré dynamique pour les TigerTag classiques
- 🗄️ **Racks de stockage** — assignez chaque bobine à un rack, un niveau (A, B, C…) et une position (1, 2, 3…)
- 🏭 **Intégration Bambu Lab** — envoi de la configuration filament vers l'AMS de votre imprimante
- 📊 **Sensor statistiques** — nombre de bobines, poids total, stock faible, bobines dans l'AMS, grille des racks
- 🌡️ **Paramètres d'impression** — températures buse/plateau, séchage exposés comme attributs
- 🗑️ **Nettoyage automatique** — les bobines supprimées dans l'app TigerTag disparaissent de HA
- 🌍 **Traductions** — Français, English, Español, Deutsch, Nederlands

---

## Prérequis

- Home Assistant 2024.1 ou supérieur
- Compte TigerTag
- [HACS](https://hacs.xyz) installé

### Optionnel
- Intégration [ha-bambulab](https://github.com/greghesp/ha-bambulab) pour l'envoi vers l'AMS Bambu Lab

---

## Installation via HACS

### Méthode recommandée (HACS)

1. Ouvrez HACS dans Home Assistant
2. Cliquez sur le menu ⋮ → **Dépôts personnalisés**
3. Ajoutez l'URL : `https://github.com/Kenny3231/TigerTag`
4. Catégorie : **Intégration**
5. Cliquez sur **TigerTag** → **Télécharger**
6. Redémarrez Home Assistant

### Installation manuelle

1. Copiez le dossier `custom_components/tigertag/` dans votre dossier `config/custom_components/`
2. Redémarrez Home Assistant

---

## Configuration

### 1. Ajouter l'intégration

**Paramètres → Appareils et services → Ajouter une intégration → TigerTag**

Choisissez votre mode d'authentification :

#### Mode Email / Mot de passe
Renseignez votre adresse e-mail et mot de passe TigerTag.

#### Mode Token
Collez le refresh token Firebase obtenu via l'application [TigerTag-Token 1.0.0.exe](https://github.com/Kenny3231/TigerTag) disponible sur GitHub. L'adresse e-mail est optionnelle dans ce mode.

### 2. Ajouter la ressource Lovelace (mode YAML uniquement)

Si votre Lovelace est en **mode YAML**, ajoutez dans `configuration.yaml` :

```yaml
lovelace:
  resources:
    - url: /local/tigertag-card.js
      type: module
```

En **mode UI**, la ressource est enregistrée automatiquement.

### 3. Ajouter la carte au dashboard

```yaml
type: custom:tigertag-card
grid_options:
  columns: 48
  rows: auto
```

---

## Entités créées

Pour chaque bobine TigerTag :

| Entité | Type | Description |
|--------|------|-------------|
| `sensor.tigertag_{uid}` | Sensor | Poids disponible + tous les attributs |
| `number.tigertag_{uid}` | Number | Poids modifiable |

### Sensor global

| Entité | Description |
|--------|-------------|
| `sensor.tigertag_statistiques` | Statistiques globales + données des racks |

### Attributs du sensor bobine

| Attribut | Description |
|----------|-------------|
| `uid` | Identifiant unique de la puce RFID |
| `brand` | Marque |
| `material` | Matériau (PLA, PETG, ABS…) |
| `color_name` | Nom de la couleur |
| `color_hex` | Couleur en hexadécimal (#rrggbb) |
| `img_url` | URL de l'image produit (TigerTag+) |
| `nozzle_temp_min/max` | Températures de buse recommandées |
| `bed_temp_min/max` | Températures plateau recommandées |
| `dry_temp` | Température de séchage |
| `dry_time_hours` | Durée de séchage |
| `ams_location` | Emplacement AMS Bambu Lab (ex: `sensor.p2s_ams_1_emplacement_1`) |
| `rack_id` | Identifiant Firestore du rack |
| `rack_level` | Niveau dans le rack (index 0-based, affiché A/B/C dans la carte) |
| `rack_position` | Position dans le niveau (index 0-based, affiché 1/2/3 dans la carte) |
| `has_twin` | `true` si la bobine a 2 puces RFID |
| `twin_uid` | UID de la puce jumelle |
| `is_plus` | `true` si TigerTag+ (image officielle disponible) |
| `container_weight` | Tare officielle (g) |
| `link_msds/tds/rohs/reach` | Liens vers les fiches techniques |

### Attributs du sensor statistiques

| Attribut | Description |
|----------|-------------|
| `count_unique` | Nombre de bobines uniques |
| `total_weight_kg` | Poids total du stock (kg) |
| `count_low_stock` | Bobines en stock faible (< 250 g) |
| `racks` | Grille complète des racks avec position de chaque bobine |

---

## Services disponibles

### `tigertag.update_spool_weight`
Met à jour le poids d'une bobine. Gère automatiquement les Twin Tags.

```yaml
service: tigertag.update_spool_weight
data:
  uid: "1D01FDF60D1080"
  weight: 750
  container_weight: 0  # tare déjà soustraite par la carte
```

### `tigertag.set_spool_rack`
Assigne une bobine à un rack, un niveau et une position. Propagé automatiquement au Twin Tag. Libère l'occupant précédent du slot si conflit.

```yaml
service: tigertag.set_spool_rack
data:
  uid: "1D01FDF60D1080"
  rack_id: "s532byruI7MAwacTHus0"
  level: 0      # 0 = niveau A
  position: 2   # 0-based
```

Pour retirer une bobine du rack :
```yaml
service: tigertag.set_spool_rack
data:
  uid: "1D01FDF60D1080"
  rack_id: null
```

### `tigertag.set_bambu_ams_filament`
Envoie la configuration filament vers un emplacement AMS Bambu Lab. Retire automatiquement la bobine de son rack.

```yaml
service: tigertag.set_bambu_ams_filament
data:
  uid: "1D01FDF60D1080"
  tray_entity_id: "sensor.p2s_ams_1_emplacement_1"
```

### `tigertag.set_spool_tare`
Définit une tare personnalisée (masterspool non officiel).

```yaml
service: tigertag.set_spool_tare
data:
  uid: "1D01FDF60D1080"
  tare: 180
```

### `tigertag.refresh`
Force un rafraîchissement immédiat de l'inventaire.

```yaml
service: tigertag.refresh
```

---

## Règles métier importantes

- **Rack ↔ AMS exclusifs** : assigner un rack efface l'emplacement AMS, et vice versa
- **Un seul occupant par slot** : assigner une bobine à un slot occupé éjecte automatiquement l'occupant
- **Firebase prioritaire** : en cas de désynchronisation, les données Firestore ont toujours raison au prochain refresh
- **Twin Tag** : toutes les opérations rack et poids sont propagées aux deux UIDs simultanément

---

## Exemples d'automatisations

### Alerte stock faible
```yaml
automation:
  trigger:
    platform: numeric_state
    entity_id: sensor.tigertag_statistiques
    attribute: count_low_stock
    above: 0
  action:
    service: notify.mobile_app
    data:
      message: "{{ state_attr('sensor.tigertag_statistiques', 'count_low_stock') }} bobine(s) en stock faible !"
```

---

## Carte Lovelace — tigertag-card

La carte est automatiquement disponible après installation.

### Fonctionnalités de la carte
- Grille de bobines avec image produit ou SVG coloré dynamique
- Recherche par marque, matériau, couleur, UID
- Filtres par rack, AMS, stock faible
- Panneau latéral avec détail complet, modification du poids, gestion emplacement
- Sélection rack avec indicateurs 🟢 libre / 🔴 occupé par niveau (A/B/C) et position (1/2/3…)
- Détection automatique des imprimantes Bambu Lab et leurs trays AMS
- Déduplication automatique des Twin Tags
- Mise à jour différentielle de l'affichage (pas de clignotement au survol)

### Configuration YAML
```yaml
type: custom:tigertag-card
title: Mon stock de filaments
```

---

## Débogage

Activez les logs détaillés dans `configuration.yaml` :

```yaml
logger:
  default: warning
  logs:
    custom_components.tigertag: debug
```

---

## Contributions

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

### Structure du projet

```
custom_components/tigertag/
├── __init__.py          # Setup, services, enregistrement carte Lovelace
├── api.py               # Client Firebase REST (auth, Firestore, racks)
├── bambu.py             # Traduction TigerTag → protocole AMS Bambu Lab
├── config_flow.py       # Interface de configuration HA (email/password ou token)
├── const.py             # Constantes
├── coordinator.py       # DataUpdateCoordinator
├── helpers.py           # Fonctions partagées
├── number.py            # Entités poids modifiables
├── sensor.py            # Entités sensors + statistiques
├── storage.py           # Persistance locale (AMS, tares, tokens, références)
├── tigertag-card.js     # Carte Lovelace custom
├── services.yaml        # Déclaration des services
├── manifest.json        # Manifeste HACS
└── translations/        # Traductions FR/EN/DE/ES/NL
    ├── fr.json
    ├── en.json
    ├── de.json
    ├── es.json
    └── nl.json
```

---

## Licence

Ce projet est sous licence **MIT**. Voir [LICENSE](LICENSE).

---

## Clause de non-responsabilité

Ce projet est **indépendant et non affilié** à TigerTag Project. Les marques TigerTag, TigerTag+ et TigerTag Studio sont la propriété de leurs détenteurs respectifs. L'utilisation de cette intégration se fait aux risques et périls de l'utilisateur. L'auteur décline toute responsabilité en cas de perte de données ou de dysfonctionnement.

Cette intégration utilise l'API publique de TigerTag. Son fonctionnement peut être affecté par des changements de l'API sans préavis.

---

## Remerciements

- [TigerTag Project](https://tigertag.io) pour leur système de gestion de filaments
- [greghesp/ha-bambulab](https://github.com/greghesp/ha-bambulab) pour l'intégration Bambu Lab
- La communauté Home Assistant
