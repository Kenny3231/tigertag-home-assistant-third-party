"""Entités Sensor TigerTag — inventaire de bobines + statistiques globales."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfMass
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import TigerTagDataUpdateCoordinator
from .helpers import (
    clean_value,
    resolve_reference,
    resolve_spool,
    spool_color_hex,
    spool_display_name,
)

_LOGGER = logging.getLogger(__name__)


# ── Setup ────────────────────────────────────────────────────────────────────

async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """
    Configure les entités Sensor avec détection dynamique des nouvelles bobines.
    Une nouvelle bobine dans l'inventaire crée automatiquement une entité,
    sans redémarrage de Home Assistant.
    """
    coordinator: TigerTagDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    known_uids: set[str] = set()

    # Sensor de statistiques globales (unique par entrée)
    async_add_entities([TigerTagStatsSensor(coordinator, entry)])

    @callback
    def _add_new_spools() -> None:
        data = coordinator.data
        if not data or not isinstance(data.get("inventory"), dict):
            return
        new: list[TigerTagSpoolSensor] = []
        for key, spool in data["inventory"].items():
            uid = str(spool.get("uid", key))
            if uid and uid not in known_uids:
                known_uids.add(uid)
                new.append(TigerTagSpoolSensor(coordinator, entry, uid))
        if new:
            _LOGGER.debug("%d nouveau(x) sensor(s) bobine ajouté(s).", len(new))
            async_add_entities(new)

    entry.async_on_unload(coordinator.async_add_listener(_add_new_spools))
    _add_new_spools()


# ── Sensor bobine ─────────────────────────────────────────────────────────────

class TigerTagSpoolSensor(CoordinatorEntity[TigerTagDataUpdateCoordinator], SensorEntity):
    """
    Entité Sensor représentant une bobine de filament TigerTag.

    Valeur principale : poids disponible en grammes.
    Attributs : toutes les métadonnées utiles (couleur, matériau, rack, AMS…).

    Règles fixes :
    - has_entity_name = False → entity_id stable basé sur unique_id uniquement
    - entity_id forcé : sensor.tigertag_{uid_lowercase}
    - UID hex UPPERCASE dans les attributs, lowercase dans l'entity_id
    """

    _attr_has_entity_name            = False
    _attr_state_class                = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = UnitOfMass.GRAMS
    _attr_icon                       = "mdi:printer-3d-nozzle"

    def __init__(
        self,
        coordinator: TigerTagDataUpdateCoordinator,
        entry: ConfigEntry,
        uid: str,
    ) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._uid   = uid
        self._attr_unique_id = f"tigertag_sensor_{uid}"
        self.entity_id       = f"sensor.tigertag_{uid.lower()}"

    # ── Suppression automatique si la bobine disparaît de l'inventaire ──────

    @callback
    def _handle_coordinator_update(self) -> None:
        data      = self.coordinator.data or {}
        inventory = data.get("inventory", {})
        current   = {str(v.get("uid", k)) for k, v in inventory.items()}

        if self._uid not in current:
            _LOGGER.debug(
                "Bobine %s absente de l'inventaire — suppression du sensor.", self._uid
            )
            entity_registry = er.async_get(self.hass)
            if entity_registry.async_get(self.entity_id):
                entity_registry.async_remove(self.entity_id)
            else:
                self.hass.async_create_task(self.async_remove(force_remove=True))
            return

        super()._handle_coordinator_update()

    # ── Device ───────────────────────────────────────────────────────────────

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.entry_id)},
            name="TigerTag Studio",
            manufacturer="TigerTag Project",
            model="Inventory Manager",
            sw_version="2.0",
            configuration_url="https://app.tigertag.io",
        )

    # ── Helpers privés ───────────────────────────────────────────────────────

    @property
    def _spool(self) -> dict[str, Any]:
        return resolve_spool(self.coordinator, self._uid) or {}

    def _ref(self, ref_type: str, item_id: Any) -> str:
        return resolve_reference(self.coordinator, ref_type, item_id)

    def _get_rack(self, rack_id: str | None) -> dict[str, Any] | None:
        """Retourne le dict complet du rack, ou None si rack_id absent/inconnu."""
        if not rack_id:
            return None
        return (self.coordinator.data or {}).get("racks", {}).get(rack_id)

    # ── Propriétés principales ───────────────────────────────────────────────

    @property
    def name(self) -> str:
        brand = self._ref("brand", self._spool.get("id_brand"))
        return spool_display_name(self._spool, brand, self._uid)

    @property
    def native_value(self) -> float | None:
        d   = self._spool
        raw = d.get("weight_available") or d.get("weight") or d.get("measure_gr")
        try:
            return float(raw) if raw is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def entity_picture(self) -> str | None:
        """
        Image de la bobine :
        - TigerTag+ : URL officielle du produit (url_img)
        - TigerTag classique : SVG inline coloré généré depuis les composantes RGB
        """
        d       = self._spool
        img_url = d.get("url_img")

        if img_url and img_url not in ("", "--"):
            return img_url

        # SVG bobine coloré (style Spoolman) — encodage URL minimal
        try:
            r = int(d.get("color_r", 0))
            g = int(d.get("color_g", 0))
            b = int(d.get("color_b", 0))
        except (TypeError, ValueError):
            r = g = b = 128

        cc = f"#{r:02x}{g:02x}{b:02x}".replace("#", "%23")
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-140 -60 515 620"'
            f' preserveAspectRatio="xMidYMid meet">'
            f'<path fill="%23343434" d="M0-63C35-63 63-35 63 0 63 35 35 63 0'
            f' 63-35 63-63 35-63 0-63-35-35-63 0-63z"'
            f' transform="matrix(.588,0,0,3.948,197,250)"/>'
            f'<path fill="{cc}" d="M0-63C35-63 63-35 63 0 63 35 35 63 0'
            f' 63-35 63-63 35-63 0-63-35-35-63 0-63z"'
            f' transform="matrix(.382,0,0,3.462,197,250)"/>'
            f'<path fill="{cc}" d="M-38-65H38V65H-38z"'
            f' transform="matrix(2.074,0,0,3.358,117,250)"/>'
            f'<path fill="%23343434" d="M0-63C35-63 63-35 63 0 63 35 35 63 0'
            f' 63-35 63-63 35-63 0-63-35-35-63 0-63z"'
            f' transform="matrix(.588,0,0,3.948,37,250)"/>'
            f'<path fill="%23111111" d="M0-63C35-63 63-35 63 0 63 35 35 63 0'
            f' 63-35 63-63 35-63 0-63-35-35-63 0-63z"'
            f' transform="matrix(.244,0,0,1.636,37,250)"/>'
            f'</svg>'
        )
        return f"data:image/svg+xml,{svg}"

    # ── Attributs ────────────────────────────────────────────────────────────

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        d     = self._spool
        coord = self.coordinator

        # ── Tare : custom override > valeur officielle TigerTag ─────────────
        tare_custom    = coord.get_tare(self._uid)
        tare_official  = d.get("container_weight")
        tare_effective = tare_custom if tare_custom is not None else tare_official

        # ── Couleurs primaires ───────────────────────────────────────────────
        try:
            r, g, b = (
                int(d.get("color_r", 0)),
                int(d.get("color_g", 0)),
                int(d.get("color_b", 0)),
            )
        except (TypeError, ValueError):
            r = g = b = 0

        # ── Rack : uniquement l'emplacement de la bobine ────────────────────
        # rack_name/level_count/position_count → StatsSensor uniquement
        rack_id = d.get("rack_id") or None

        # La position réelle est normalisée par get_inventory() dans
        # spool_level / spool_position (depuis rack.level / rack.position)
        # Les champs plats "level"/"position" sont les capacités du rack.
        raw_level    = d.get("spool_level")
        raw_position = d.get("spool_position")
        spool_level    = int(raw_level)    if raw_level    is not None else None
        spool_position = int(raw_position) if raw_position is not None else None

        # ── Construction des attributs ───────────────────────────────────────
        attrs: dict[str, Any] = {
            # Identification
            "uid":          self._uid,
            # Matériau / marque
            "brand":        self._ref("brand",    d.get("id_brand")),
            "material":     self._ref("material", d.get("id_material")),
            "type":         self._ref("type",     d.get("id_type")),
            "tag_type":     self._ref("version",  d.get("id_tigertag") or d.get("id_version")),
            "is_plus":      bool(d.get("url_img") and d.get("url_img") not in ("", "--")),
            "has_twin":     bool(d.get("twin_tag_uid")),
            "twin_uid":     clean_value(d.get("twin_tag_uid")),
            # Apparence
            "series":       clean_value(d.get("series")),
            "product_name": clean_value(d.get("name") or d.get("color_name")),
            "color_name":   clean_value(
                d.get("color_name") or d.get("name") or d.get("message")
            ),
            "color_hex":    f"#{r:02x}{g:02x}{b:02x}",
            # Couleurs secondaires (bicolor, tricolor)
            "color_hex2": (
                f"#{int(d.get('color_r2', 0)):02x}"
                f"{int(d.get('color_g2', 0)):02x}"
                f"{int(d.get('color_b2', 0)):02x}"
                if d.get("color_r2") else None
            ),
            "color_hex3": (
                f"#{int(d.get('color_r3', 0)):02x}"
                f"{int(d.get('color_g3', 0)):02x}"
                f"{int(d.get('color_b3', 0)):02x}"
                if d.get("color_r3") else None
            ),
            "aspect1":      self._ref("aspect", d.get("id_aspect1") or d.get("id_aspect")),
            "aspect2":      self._ref("aspect", d.get("id_aspect2")),
            # Spécifications
            "diameter":          self._ref("diameter", d.get("data1")),
            "capacity_gr":       d.get("measure_gr") or d.get("measure"),
            "container_weight":           tare_official,
            "container_weight_custom":    tare_custom,
            "container_weight_effective": tare_effective,
            "container_id":      clean_value(d.get("container_id")),
            # Paramètres d'impression
            "nozzle_temp_min": d.get("data2"),
            "nozzle_temp_max": d.get("data3"),
            "dry_temp":        d.get("data4"),
            "dry_time_hours":  d.get("data5"),
            "bed_temp_min":    d.get("data6"),
            "bed_temp_max":    d.get("data7"),
            # Flags
            "is_refill":   bool(d.get("info1")),
            "is_recycled": bool(d.get("info2")),
            "is_filled":   bool(d.get("info3")),
            # Produit
            "sku":     clean_value(d.get("sku")),
            "barcode": clean_value(d.get("barcode")),
            # Image
            "img_url": self.entity_picture,
            # Liens
            "link_youtube": clean_value(d.get("LinkYoutube")),
            "link_msds":    clean_value(d.get("LinkMSDS")),
            "link_tds":     clean_value(d.get("LinkTDS")),
            "link_rohs":    clean_value(d.get("LinkROHS")),
            "link_reach":   clean_value(d.get("LinkREACH")),
            "link_food":    clean_value(d.get("LinkFOOD")),
            # Couleurs étendues (multicolor)
            "online_color_list": d.get("online_color_list") or [],
            "online_color_type": d.get("online_color_type"),
            # Profil filament Bambu persisté
            "bambu_profile_idx": coord.get_spool_profile(self._uid),
            # Dates
            "updated_at":  d.get("updated_at"),
            "last_update": d.get("last_update"),
            # ── Emplacement AMS ──────────────────────────────────────────────
            "ams_location": coord.get_location(self._uid),
            # ── Rack : emplacement de la bobine ──────────────────────────────
            "rack_id":       rack_id,       # ID Firestore du rack (None si pas de rack)
            "rack_level":    spool_level,   # étage (0-based, 0 est valide)
            "rack_position": spool_position, # position dans l'étage (0-based, 0 est valide)
        }

        # Filtre : exclure None et les dicts bruts.
        # IMPORTANT : 0 et False sont des valeurs valides (rack_level=0, etc.)
        def _keep(v):
            if v is None:              return False
            if isinstance(v, dict):    return False
            if isinstance(v, list):    return all(not isinstance(i, dict) for i in v)
            return True

        return {k: v for k, v in attrs.items() if _keep(v)}


# ── Sensor statistiques ───────────────────────────────────────────────────────

class TigerTagStatsSensor(CoordinatorEntity[TigerTagDataUpdateCoordinator], SensorEntity):
    """
    Sensor de statistiques globales TigerTag.

    Valeur principale : nombre de bobines uniques (twins dédupliqués).
    Attributs : métriques d'inventaire + racks complets pour la carte JS.

    entity_id : sensor.tigertag_statistiques
    """

    _attr_has_entity_name = False
    _attr_icon            = "mdi:printer-3d-nozzle"
    _attr_state_class     = SensorStateClass.MEASUREMENT

    def __init__(
        self,
        coordinator: TigerTagDataUpdateCoordinator,
        entry: ConfigEntry,
    ) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._attr_unique_id = f"tigertag_stats_{entry.entry_id}"
        self.entity_id       = "sensor.tigertag_statistiques"

    @property
    def device_info(self) -> DeviceInfo:
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.entry_id)},
            name="TigerTag Studio",
            manufacturer="TigerTag Project",
            model="Inventory Manager",
            sw_version="2.0",
            configuration_url="https://app.tigertag.io",
        )

    @property
    def name(self) -> str:
        return "Statistiques"

    def _compute_stats(self) -> dict[str, Any]:
        """
        Calcule les statistiques globales en une passe sur l'inventaire.

        Déduplication twin : le premier UID d'une paire est compté,
        son twin est marqué comme "vu" pour ne pas être recompté.
        """
        data      = self.coordinator.data or {}
        inventory = data.get("inventory", {})
        thr       = 250  # seuil stock faible (grammes)

        seen:        set[str] = set()
        count_unique = 0
        count_ams    = 0
        count_no_loc = 0
        count_low    = 0
        count_refill = 0
        twin_pairs   = 0
        total_weight = 0.0

        for key, spool in inventory.items():
            uid      = str(spool.get("uid", key))
            twin_uid = str(spool["twin_tag_uid"]) if spool.get("twin_tag_uid") else None

            if uid in seen:
                continue

            count_unique += 1
            seen.add(uid)

            if twin_uid:
                seen.add(twin_uid)
                twin_pairs += 1

            w = float(spool.get("weight_available") or spool.get("weight") or 0)
            total_weight += w

            if self.coordinator.get_location(uid):
                count_ams += 1
            elif not spool.get("rack_id"):
                count_no_loc += 1

            if 0 < w < thr:
                count_low += 1

            if spool.get("info1"):
                count_refill += 1

        return {
            "count_unique":      count_unique,
            "count_total_tags":  len(inventory),
            "count_twin_pairs":  twin_pairs,
            "count_in_ams":      count_ams,
            "count_no_location": count_no_loc,
            "count_low_stock":   count_low,
            "count_refill":      count_refill,
            "total_weight_g":    round(total_weight, 1),
            "total_weight_kg":   round(total_weight / 1000, 3),
        }

    @property
    def native_value(self) -> int:
        return self._compute_stats()["count_unique"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        stats = self._compute_stats()

        # Racks complets pour la carte JS (nom, capacité, ordre)
        racks = (self.coordinator.data or {}).get("racks", {})
        if racks:
            stats["racks"] = racks

        # Profils Bambu mis en cache par fetch_bambu_profiles
        bambu_profiles = (self.coordinator.data or {}).get("bambu_profiles", {})
        if bambu_profiles:
            stats["bambu_profiles"] = bambu_profiles

        return stats
