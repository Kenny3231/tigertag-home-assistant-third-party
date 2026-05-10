"""Initialisation de l'intégration TigerTag."""
from __future__ import annotations

import logging
import re
from typing import Any

import voluptuous as vol
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import TigerTagApiClient
from .bambu import build_ams_payload
from .const import (
    CONF_EMAIL,
    CONF_FIREBASE_UID,
    CONF_PASSWORD,
    DOMAIN,
    SERVICE_BAMBU_AMS,
    SERVICE_REFRESH,
    SERVICE_SET_RACK,
    SERVICE_SET_TARE,
    SERVICE_UPDATE_WEIGHT,
)
from .coordinator import TigerTagDataUpdateCoordinator
from .helpers import resolve_reference, resolve_spool

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.NUMBER, Platform.SENSOR]

# URL fixe sous laquelle la carte Lovelace est servie — NE PAS MODIFIER
_CARD_URL  = "/local/tigertag-card.js"
_CARD_PATH = "tigertag-card.js"

# ── Schémas de validation des services ─────────────────────────────────────

_UPDATE_WEIGHT_SCHEMA = vol.Schema({
    vol.Required("uid"):    cv.string,
    vol.Required("weight"): vol.All(vol.Coerce(int), vol.Range(min=0, max=99_999)),
    vol.Optional("container_weight", default=0): vol.All(
        vol.Coerce(int), vol.Range(min=0)
    ),
})

_SET_TARE_SCHEMA = vol.Schema({
    vol.Required("uid"):  cv.string,
    vol.Required("tare"): vol.All(vol.Coerce(int), vol.Range(min=0, max=2_000)),
})

_SET_RACK_SCHEMA = vol.Schema({
    vol.Required("uid"):     cv.string,
    vol.Optional("rack_id"): vol.Any(cv.string, None),
    # Position de la bobine dans le rack
    vol.Optional("level"):    vol.Any(vol.All(vol.Coerce(int), vol.Range(min=0)), None),
    vol.Optional("position"): vol.Any(vol.All(vol.Coerce(int), vol.Range(min=0)), None),
})

_BAMBU_AMS_SCHEMA = vol.Schema({
    vol.Required("uid"):            cv.string,
    vol.Required("tray_entity_id"): cv.entity_id,
    vol.Optional("tray_info_idx"):  cv.string,
    vol.Optional("profile_name"):   cv.string,
})

_FETCH_PROFILES_SCHEMA = vol.Schema({
    vol.Required("device_id"): cv.string,
    vol.Required("uid"):       cv.string,
})


# ── Helpers internes ────────────────────────────────────────────────────────

def _get_coordinator(
    hass: HomeAssistant, entry_id: str
) -> TigerTagDataUpdateCoordinator | None:
    """Récupère le coordinator depuis hass.data. Retourne None si introuvable."""
    coord = hass.data.get(DOMAIN, {}).get(entry_id)
    if coord is None:
        _LOGGER.error("Coordinator TigerTag introuvable pour entry_id=%s", entry_id)
    return coord


def _extract_ams_ids(tray_entity_id: str) -> tuple[int, int]:
    """
    Extrait ams_id et tray_id depuis un entity_id de tray Bambu Lab.

    Exemples :
        sensor.p2s_ams_1_emplacement_1  → (0, 0)
        sensor.p2s_ams_2_emplacement_3  → (1, 2)
    """
    m = re.search(r"ams_(\d+).*?emplacement_(\d+)", tray_entity_id, re.IGNORECASE)
    if m:
        return int(m.group(1)) - 1, int(m.group(2)) - 1
    _LOGGER.warning(
        "Impossible d'extraire ams_id/tray_id depuis '%s', utilisation de 0/0",
        tray_entity_id,
    )
    return 0, 0


def _extract_printer_name(entity_id: str) -> str:
    """
    Extrait le nom de l'imprimante depuis un entity_id Bambu Lab.
    Ex: 'sensor.p2s_ams_1_emplacement_1' → 'P2S'
    """
    m = re.match(
        r"^sensor\.([^_]+(?:_[^_]+)*?)(?:_ams_|_external)", entity_id, re.IGNORECASE
    )
    if m:
        return m.group(1).replace("_", " ").upper()
    return entity_id.split(".")[1].split("_")[0].upper()


# ── Handlers de services ────────────────────────────────────────────────────

def _make_update_weight_handler(hass: HomeAssistant, entry_id: str):
    """Handler du service update_spool_weight."""

    async def handle(call: ServiceCall) -> None:
        coordinator = _get_coordinator(hass, entry_id)
        if not coordinator:
            return

        uid              = str(call.data["uid"]).upper()
        weight           = int(call.data["weight"])
        container_weight = int(call.data.get("container_weight", 0))

        spool    = resolve_spool(coordinator, uid)
        twin_uid = str(spool["twin_tag_uid"]).upper() if spool and spool.get("twin_tag_uid") else None

        try:
            await coordinator.client.set_weight_with_twin(
                uid=uid,
                weight=weight,
                container_weight=container_weight,
                twin_uid=twin_uid,
            )
            await coordinator.async_request_refresh()
        except Exception as err:
            _LOGGER.error("Erreur update_spool_weight uid=%s : %s", uid, err)

    return handle


def _make_set_rack_handler(hass: HomeAssistant, entry_id: str):
    """
    Handler du service set_spool_rack.

    Comportement :
    1. Si une autre bobine occupe déjà (rack_id, level, position) → on la retire du rack
    2. On écrit rack_id + level + position sur la bobine principale
    3. Si twin_tag_uid présent → même écriture sur le twin (même rack, même slot)
    """

    async def handle(call: ServiceCall) -> None:
        coordinator = _get_coordinator(hass, entry_id)
        if not coordinator:
            return

        uid      = str(call.data["uid"]).upper()
        rack_id  = call.data.get("rack_id") or None
        level    = call.data.get("level")
        position = call.data.get("position")

        # Convertir en int si fourni, None sinon
        level    = int(level)    if level    is not None else None
        position = int(position) if position is not None else None

        inventory = (coordinator.data or {}).get("inventory", {})

        # 1. Libérer l'occupant actuel du slot (si rack_id + level + position fournis)
        if rack_id is not None and level is not None and position is not None:
            for key, sp in inventory.items():
                sp_uid = str(sp.get("uid", key))
                if sp_uid == uid:
                    continue  # c'est la bobine qu'on déplace, pas un conflit
                if (
                    sp.get("rack_id")       == rack_id
                    and sp.get("spool_level")    == level
                    and sp.get("spool_position") == position
                ):
                    _LOGGER.info(
                        "Slot (%s, étage=%d, pos=%d) occupé par %s → libération",
                        rack_id, level, position, sp_uid,
                    )
                    try:
                        await coordinator.client.set_spool_rack(
                            sp_uid, rack_id=None, level=None, position=None
                        )
                        # Si ce occupant a un twin, on le libère aussi
                        twin_of_occupant = sp.get("twin_tag_uid")
                        if twin_of_occupant:
                            await coordinator.client.set_spool_rack(
                                str(twin_of_occupant).upper(),
                                rack_id=None, level=None, position=None,
                            )
                    except Exception as err:
                        _LOGGER.warning("Libération occupant %s échouée : %s", sp_uid, err)
                    break

        # 2. Écrire sur la bobine principale
        try:
            await coordinator.client.set_spool_rack(
                uid, rack_id=rack_id, level=level, position=position
            )
            _LOGGER.debug(
                "Rack défini : uid=%s rack_id=%s level=%s position=%s",
                uid, rack_id, level, position,
            )
        except Exception as err:
            _LOGGER.error("Erreur set_spool_rack uid=%s : %s", uid, err)
            return

        # 3. Si on place dans un rack → effacer la location AMS (virtuelle) EN PREMIER
        #    La bobine reste physiquement dans le tray Bambu mais n'est plus suivie dans HA.
        if rack_id:
            spool = inventory.get(uid) or {}
            ams_location = coordinator.get_location(uid)
            if ams_location:
                _LOGGER.info(
                    "Bobine %s déplacée vers rack — suppression de l'emplacement AMS (%s)",
                    uid, ams_location,
                )
                await coordinator.async_set_location(uid, None)
            # Propager au twin si nécessaire
            twin_uid_raw = spool.get("twin_tag_uid")
            if twin_uid_raw:
                twin_uid_str = str(twin_uid_raw).upper()
                if coordinator.get_location(twin_uid_str):
                    await coordinator.async_set_location(twin_uid_str, None)

        # 4. Propager rack au twin si présent
        spool    = inventory.get(uid) or {}
        twin_uid = spool.get("twin_tag_uid")
        if twin_uid:
            twin_uid = str(twin_uid).upper()
            try:
                await coordinator.client.set_spool_rack(
                    twin_uid, rack_id=rack_id, level=level, position=position
                )
                _LOGGER.debug("Twin %s → même rack/slot que %s", twin_uid, uid)
            except Exception as err:
                _LOGGER.warning(
                    "Propagation rack twin %s échouée (non bloquant) : %s", twin_uid, err
                )

        await coordinator.async_request_refresh()

    return handle


def _make_set_tare_handler(hass: HomeAssistant, entry_id: str):
    """Handler du service set_spool_tare."""

    async def handle(call: ServiceCall) -> None:
        coordinator = _get_coordinator(hass, entry_id)
        if not coordinator:
            return

        uid    = str(call.data["uid"]).upper()
        tare_g = int(call.data["tare"])

        _LOGGER.debug("Tare custom bobine %s → %d g", uid, tare_g)
        await coordinator.async_set_tare(uid, tare_g)

        # Mise à jour immédiate sans attendre le prochain cycle
        coordinator.async_set_updated_data({
            **(coordinator.data or {}),
            "tares": coordinator.storage.tares,
        })

    return handle


def _make_bambu_ams_handler(hass: HomeAssistant, entry_id: str):
    """
    Handler du service set_bambu_ams_filament.

    Flux :
    1. Libérer l'ancien slot AMS si occupé par une autre bobine TigerTag
    2. Construire et envoyer le payload MQTT via ha-bambulab
    3. Persister l'emplacement AMS et le profil filament choisi
    """

    async def handle(call: ServiceCall) -> None:
        coordinator = _get_coordinator(hass, entry_id)
        if not coordinator:
            return

        uid            = str(call.data["uid"]).upper()
        tray_entity_id = call.data["tray_entity_id"]

        spool = resolve_spool(coordinator, uid)
        if not spool:
            _LOGGER.error("Bobine UID '%s' introuvable dans l'inventaire.", uid)
            return

        # 1. Libérer l'ancien occupant du tray (s'il y en a un différent)
        inventory = (coordinator.data or {}).get("inventory", {})
        for key, sp in inventory.items():
            sp_uid = str(sp.get("uid", key))
            if coordinator.get_location(sp_uid) == tray_entity_id and sp_uid != uid:
                _LOGGER.info(
                    "Libération du tray %s : ancienne bobine %s retirée",
                    tray_entity_id, sp_uid,
                )
                await coordinator.async_set_location(sp_uid, None)
                break

        # 2. Extraire ams_id et tray_id depuis l'entity_id
        ams_id, tray_id = _extract_ams_ids(tray_entity_id)

        # 3. Construire le payload Bambu Lab
        payload = build_ams_payload(
            coordinator=coordinator,
            spool_data=spool,
            ams_id=ams_id,
            tray_id=tray_id,
        )
        p = payload["print"]

        # Override du profil si fourni explicitement par la carte JS
        tray_info_idx_override = call.data.get("tray_info_idx")
        if tray_info_idx_override:
            p["tray_info_idx"] = tray_info_idx_override
            _LOGGER.info(
                "Profil override : %s (%s)",
                tray_info_idx_override,
                call.data.get("profile_name", ""),
            )

        _LOGGER.info(
            "Envoi filament → %s (AMS %d / Tray %d) : %s %s %d–%d°C",
            tray_entity_id, ams_id, tray_id,
            p["tray_type"], p["tray_color"],
            p["nozzle_temp_min"], p["nozzle_temp_max"],
        )

        # 4. Envoi vers Bambu Lab via ha-bambulab
        try:
            await hass.services.async_call(
                "bambu_lab",
                "set_filament",
                {
                    "tray_info_idx":   p["tray_info_idx"],
                    "tray_color":      p["tray_color"],
                    "tray_type":       p["tray_type"],
                    "nozzle_temp_min": p["nozzle_temp_min"],
                    "nozzle_temp_max": p["nozzle_temp_max"],
                },
                target={"entity_id": tray_entity_id},
            )
        except Exception as err:
            _LOGGER.error("Erreur envoi Bambu Lab pour uid=%s : %s", uid, err)
            return

        # 5. Persister l'emplacement AMS
        await coordinator.async_set_location(uid, tray_entity_id)

        # 6. Persister le profil filament choisi
        final_idx = tray_info_idx_override or p["tray_info_idx"]
        await coordinator.async_set_spool_profile(uid, final_idx)

        # 7. Mise à jour immédiate des entités
        coordinator.async_set_updated_data({
            **(coordinator.data or {}),
            "locations": coordinator.storage.locations,
        })

        printer_name = _extract_printer_name(tray_entity_id)
        _LOGGER.info(
            "Bobine %s → tray %s (imprimante '%s'), profil '%s'",
            uid, tray_entity_id, printer_name, final_idx,
        )

    return handle


def _make_fetch_profiles_handler(hass: HomeAssistant, entry_id: str):
    """
    Handler du service fetch_bambu_profiles.
    Récupère, score et stocke les profils filament Bambu pour une bobine.
    """

    async def handle(call: ServiceCall) -> None:
        import json as _json

        coordinator = _get_coordinator(hass, entry_id)
        if not coordinator:
            return

        device_id = call.data["device_id"]
        uid       = str(call.data["uid"]).upper()
        spool     = resolve_spool(coordinator, uid)

        material = ""
        series   = ""
        brand    = ""
        bambu_id = ""

        if spool:
            material = resolve_reference(coordinator, "material", spool.get("id_material", ""))
            series   = spool.get("series", "") or ""
            brand    = resolve_reference(coordinator, "brand", spool.get("id_brand", ""))

            # Chercher le bambuID dans les métadonnées de référence
            id_material = spool.get("id_material", "")
            if id_material:
                refs = (coordinator.data or {}).get("references", {}).get("material") or []
                if isinstance(refs, list):
                    mat_entry = next(
                        (m for m in refs if str(m.get("id", "")) == str(id_material)),
                        None,
                    )
                    if mat_entry:
                        bambu_id = (mat_entry.get("metadata") or {}).get("bambuID", "") or ""
                        if bambu_id:
                            _LOGGER.info("BambuID TigerTag pour %s : %s", material, bambu_id)

        # Récupérer les profils via get_filament_data (ha-bambulab)
        profiles: list[dict] = []
        try:
            resp = await hass.services.async_call(
                "bambu_lab",
                "get_filament_data",
                {"device_id": device_id},
                return_response=True,
                blocking=True,
            )
            if resp:
                raw = resp if isinstance(resp, (list, dict)) else _json.loads(str(resp))
                if isinstance(raw, dict) and raw:
                    profiles = [
                        {
                            "tray_info_idx":   idx,
                            "name":            p.get("name", idx),
                            "type":            p.get("filament_type", ""),
                            "vendor":          p.get("filament_vendor", ""),
                            "nozzle_temp_min": str(p.get("nozzle_temperature_range_low", "")),
                            "nozzle_temp_max": str(p.get("nozzle_temperature_range_high", "")),
                            "bed_temp":        str(p.get("bed_temperature", "")),
                            "drying_temp":     str(p.get("drying_temp", "")),
                            "drying_time":     str(p.get("drying_time", "")),
                        }
                        for idx, p in raw.items()
                    ]
                elif isinstance(raw, list) and raw:
                    profiles = raw
                _LOGGER.info("get_filament_data : %d profils chargés", len(profiles))
        except Exception as err:
            _LOGGER.error("get_filament_data échoué pour device_id=%s : %s", device_id, err)

        if not profiles:
            _LOGGER.warning("Aucun profil filament pour device_id=%s", device_id)
            return

        # Scorer, filtrer et dédupliquer
        raw_scored = [
            {**p, "_score": _score_profile(p, material, series, brand, bambu_id)}
            for p in profiles
        ]
        filtered = [p for p in raw_scored if p["_score"] > -9999]

        seen_idx: dict[str, dict] = {}
        for p in filtered:
            idx = p.get("tray_info_idx", "")
            if idx not in seen_idx or p["_score"] > seen_idx[idx]["_score"]:
                seen_idx[idx] = p
        deduped = sorted(seen_idx.values(), key=lambda x: -x["_score"])

        _LOGGER.info(
            "Profils %s/%s (brand=%s bambuID=%s) : %d après filtre/dédup, top 3 : %s",
            material, series, brand, bambu_id, len(deduped),
            [p.get("name") for p in deduped[:3]],
        )

        # Stocker dans coordinator.data pour la carte JS
        current = dict(coordinator.data or {})
        bp = dict(current.get("bambu_profiles", {}))
        bp[device_id] = {"uid": uid, "profiles": deduped}
        current["bambu_profiles"] = bp
        coordinator.async_set_updated_data(current)

    return handle


def _make_refresh_handler(hass: HomeAssistant, entry_id: str):
    """Handler du service refresh."""

    async def handle(call: ServiceCall) -> None:
        coordinator = _get_coordinator(hass, entry_id)
        if coordinator:
            await coordinator.async_request_refresh()

    return handle


# ── Scoring des profils filament ────────────────────────────────────────────

def _score_profile(
    profile: dict[str, Any],
    material: str,
    series: str,
    brand: str = "",
    bambu_id: str = "",
) -> int:
    """
    Score un profil Bambu Lab par rapport à la bobine TigerTag.

    Retourne -9999 si le type de base ne correspond pas.

    Priorités vendor :
        Même marque (+80) > Generic (+40) > Bambu Lab (+20) > eSun/Polymake (+15)
    Bonus série :
        +40 si même vendor que la marque, +15 sinon
    Bonus GXX99 :
        +5 (fallback universel)
    """
    name        = (profile.get("name", "")            or "").lower()
    ptype       = (profile.get("type", "")
                   or profile.get("filament_type", "") or "").lower()
    vendor      = (profile.get("vendor", "")
                   or profile.get("filament_vendor", "") or "").lower()
    mat         = (material or "").strip().lower()
    ser         = (series   or "").strip().lower()
    br          = (brand    or "").strip().lower()
    b_id        = (bambu_id or "").strip().upper()

    # Filtre par type de base (ex: "PLA Silk" → base "PLA")
    mat_base    = mat.split()[0] if mat else ""
    ptype_clean = ptype.strip()

    if mat_base and ptype_clean and ptype_clean != mat_base:
        return -9999

    score = 0

    # Bonus match exact type
    if mat and ptype == mat:
        score += 100

    # Bonus bambuID direct (profil spécifique TigerTag)
    idx = (profile.get("tray_info_idx", "") or "").upper()
    if b_id and idx == b_id:
        score += 200

    # Score vendor
    KNOWN_VENDORS = {"esun", "polymake"}
    if vendor:
        if br and (br in vendor or vendor in br):
            score += 80
        elif "generic" in vendor:
            score += 40
        elif "bambu" in vendor:
            score += 20
        elif any(k in vendor for k in KNOWN_VENDORS):
            score += 15
        else:
            score -= 10

    # Bonus série
    if ser:
        vendor_matches = bool(br and vendor and (br in vendor or vendor in br))
        serie_bonus = 40 if vendor_matches else 15
        for word in re.split(r"[\s\-_]+", ser):
            if len(word) > 3 and word in name:
                score += serie_bonus

    # Bonus fallback universel GXX99
    if idx.endswith("99"):
        score += 5

    return score


# ── Enregistrement de la carte Lovelace ────────────────────────────────────

async def _async_register_card(hass: HomeAssistant) -> None:
    """
    Enregistre tigertag-card.js comme ressource statique et Lovelace.

    - Sert le fichier JS depuis custom_components/tigertag/
    - Enregistre automatiquement la ressource Lovelace en mode UI
    - En mode YAML, logge les instructions manuelles
    - Idempotent : appelé à chaque démarrage
    """
    import os

    card_file = hass.config.path("custom_components", DOMAIN, _CARD_PATH)

    if not os.path.isfile(card_file):
        _LOGGER.warning(
            "Fichier carte TigerTag introuvable : %s — la carte ne sera pas enregistrée.",
            card_file,
        )
        return

    # Chemin statique
    try:
        await hass.http.async_register_static_paths([
            StaticPathConfig(_CARD_URL, card_file, False)
        ])
        _LOGGER.debug("Chemin statique enregistré : %s → %s", _CARD_URL, card_file)
    except Exception as err:
        _LOGGER.debug("Chemin statique déjà enregistré ou erreur : %s", err)

    # Ressource Lovelace (mode UI uniquement)
    if "lovelace" not in hass.data:
        _LOGGER.info(
            "TigerTag Card disponible à : %s — "
            "ajouter dans configuration.yaml : "
            "lovelace: resources: - url: %s type: module",
            _CARD_URL, _CARD_URL,
        )
        return

    try:
        resources = hass.data["lovelace"].resources
        if not hasattr(resources, "async_create_item"):
            _LOGGER.info(
                "Lovelace en mode YAML — ajouter dans configuration.yaml : "
                "lovelace: resources: - url: %s type: module",
                _CARD_URL,
            )
            return

        if not any(res.get("url") == _CARD_URL for res in resources.async_items()):
            await resources.async_create_item({"res_type": "module", "url": _CARD_URL})
            _LOGGER.info("Ressource Lovelace TigerTag Card enregistrée : %s", _CARD_URL)
        else:
            _LOGGER.debug("Ressource Lovelace déjà enregistrée : %s", _CARD_URL)

    except Exception as err:
        _LOGGER.info(
            "Auto-enregistrement Lovelace impossible (%s) — "
            "ajouter dans configuration.yaml : "
            "lovelace: resources: - url: %s type: module",
            err, _CARD_URL,
        )


# ── Nettoyage des entités orphelines ───────────────────────────────────────

async def _async_cleanup_orphan_entities(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator: TigerTagDataUpdateCoordinator,
) -> None:
    """
    Supprime du registre HA les entités TigerTag dont la bobine
    n'existe plus dans l'inventaire Firestore.
    Appelé après le premier refresh, avant le chargement des plateformes.
    """
    inventory    = (coordinator.data or {}).get("inventory", {})
    current_uids = {str(v.get("uid", k)) for k, v in inventory.items()}

    entity_registry = er.async_get(hass)
    to_remove = [
        e
        for e in er.async_entries_for_config_entry(entity_registry, entry.entry_id)
        if e.domain in ("sensor", "number")
        # unique_id format : "tigertag_sensor_ABCD" ou "tigertag_number_ABCD"
        and e.unique_id.split("_", 2)[-1] not in current_uids
    ]

    for orphan in to_remove:
        _LOGGER.info(
            "Suppression entité orpheline : %s (bobine absente de l'inventaire)",
            orphan.entity_id,
        )
        entity_registry.async_remove(orphan.entity_id)


# ── Setup / Unload ──────────────────────────────────────────────────────────

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Configure l'intégration TigerTag pour une config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Enregistrement de la carte Lovelace (une seule fois pour toutes les entrées)
    if not hass.data[DOMAIN].get("_card_registered"):
        await _async_register_card(hass)
        hass.data[DOMAIN]["_card_registered"] = True

    # Instanciation du client API
    session = async_get_clientsession(hass)
    client  = TigerTagApiClient(
        email=entry.data[CONF_EMAIL],
        password=entry.data.get(CONF_PASSWORD, ""),
        session=session,
        firebase_uid=entry.data.get(CONF_FIREBASE_UID, ""),
        refresh_token=entry.data.get("_refresh_token", ""),
    )

    # Coordinator
    coordinator = TigerTagDataUpdateCoordinator(hass, client, entry)
    await coordinator.async_setup()

    # Premier refresh bloquant — lève ConfigEntryNotReady si échec
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = coordinator

    # Nettoyage des entités orphelines avant le chargement des plateformes
    await _async_cleanup_orphan_entities(hass, entry, coordinator)

    # Chargement des plateformes (sensor + number)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Enregistrement des services
    eid = entry.entry_id
    _register_services(hass, eid)

    entry.async_on_unload(entry.add_update_listener(_async_entry_updated))
    return True


def _register_services(hass: HomeAssistant, entry_id: str) -> None:
    """Enregistre tous les services HA de l'intégration."""
    hass.services.async_register(
        DOMAIN, SERVICE_UPDATE_WEIGHT,
        _make_update_weight_handler(hass, entry_id),
        schema=_UPDATE_WEIGHT_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SET_RACK,
        _make_set_rack_handler(hass, entry_id),
        schema=_SET_RACK_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SET_TARE,
        _make_set_tare_handler(hass, entry_id),
        schema=_SET_TARE_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_BAMBU_AMS,
        _make_bambu_ams_handler(hass, entry_id),
        schema=_BAMBU_AMS_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN, "fetch_bambu_profiles",
        _make_fetch_profiles_handler(hass, entry_id),
        schema=_FETCH_PROFILES_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_REFRESH,
        _make_refresh_handler(hass, entry_id),
    )


async def _async_entry_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Rechargement si la config change via l'options flow."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Décharge l'intégration TigerTag."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok:
        coordinator: TigerTagDataUpdateCoordinator = hass.data[DOMAIN].pop(entry.entry_id)
        await coordinator.async_shutdown()

        # Déregistrer les services si c'est la dernière entrée
        if not hass.data[DOMAIN] or all(
            k == "_card_registered" for k in hass.data[DOMAIN]
        ):
            for svc in (
                SERVICE_UPDATE_WEIGHT,
                SERVICE_SET_RACK,
                SERVICE_SET_TARE,
                SERVICE_BAMBU_AMS,
                SERVICE_REFRESH,
                "fetch_bambu_profiles",
            ):
                if hass.services.has_service(DOMAIN, svc):
                    hass.services.async_remove(DOMAIN, svc)

    return unload_ok
