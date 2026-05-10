"""Client Firebase REST asynchrone pour TigerTag."""
from __future__ import annotations

import asyncio
import logging
import socket
from datetime import datetime
from typing import Any

import aiohttp
import async_timeout

from .const import (
    FIREBASE_AUTH_URL,
    FIREBASE_CONFIG_URL,
    FIREBASE_REFRESH_URL,
    FIRESTORE_BASE_URL,
    REFERENCES_BASE_URL,
)

_LOGGER = logging.getLogger(__name__)


# ── Exceptions ──────────────────────────────────────────────────────────────

class TigerTagApiClientError(Exception):
    """Exception de base pour les erreurs du client TigerTag."""


class TigerTagApiClientCommunicationError(TigerTagApiClientError):
    """Erreur réseau ou timeout."""


class TigerTagApiClientAuthenticationError(TigerTagApiClientError):
    """Authentification Firebase échouée."""


# ── Helpers Firestore ────────────────────────────────────────────────────────

def _fs_val(field: dict) -> Any:
    """Extrait la valeur typée d'un champ Firestore."""
    for ftype in ("stringValue", "integerValue", "doubleValue", "booleanValue"):
        if ftype in field:
            val = field[ftype]
            if ftype == "integerValue":
                try:
                    return int(val)
                except (TypeError, ValueError):
                    return val
            if ftype == "doubleValue":
                try:
                    return float(val)
                except (TypeError, ValueError):
                    return val
            return val

    if "nullValue" in field:
        return None
    if "mapValue" in field:
        return {k: _fs_val(v) for k, v in field["mapValue"].get("fields", {}).items()}
    if "arrayValue" in field:
        return [_fs_val(v) for v in field["arrayValue"].get("values", [])]
    if "timestampValue" in field:
        return field["timestampValue"]  # ISO string

    return None


def _parse_doc(doc: dict) -> dict[str, Any]:
    """Convertit un document Firestore REST en dict Python natif."""
    return {k: _fs_val(v) for k, v in doc.get("fields", {}).items()}


def _to_fs_int(value: int) -> dict:
    """Encode un entier au format Firestore REST (integerValue = string)."""
    return {"integerValue": str(int(value))}


# ── Client ───────────────────────────────────────────────────────────────────

class TigerTagApiClient:
    """
    Client Firebase REST pour TigerTag.

    Gère l'authentification (email/password ou OAuth refresh token),
    le renouvellement automatique de l'idToken, et toutes les opérations
    Firestore nécessaires à l'intégration.
    """

    def __init__(
        self,
        email: str,
        password: str,
        session: aiohttp.ClientSession,
        firebase_uid: str = "",
        id_token: str = "",
        refresh_token: str = "",
    ) -> None:
        self._email         = email
        self._password      = password
        self._session       = session
        self._firebase_uid  = firebase_uid
        self._id_token      = id_token
        self._refresh_token = refresh_token
        self._project_id    = ""
        self._api_key       = ""
        self._token_expires = 0.0  # timestamp epoch

    # ── Propriétés publiques ────────────────────────────────────────────────

    @property
    def oauth_mode(self) -> bool:
        """True si mode token sans password — calculé dynamiquement."""
        return bool(self._refresh_token and not self._password)

    @property
    def firebase_uid(self) -> str:
        return self._firebase_uid

    @property
    def refresh_token(self) -> str:
        return self._refresh_token

    @property
    def id_token(self) -> str:
        return self._id_token

    # ── HTTP helpers ────────────────────────────────────────────────────────

    async def _request(
        self,
        method: str,
        url: str,
        json_data: dict | None = None,
        auth: bool = True,
    ) -> Any:
        """
        Exécute une requête HTTP vers Firebase.

        Args:
            method    : verbe HTTP (GET, POST, PATCH…)
            url       : URL cible
            json_data : corps JSON optionnel
            auth      : True pour inclure le Bearer token

        Raises:
            TigerTagApiClientAuthenticationError : HTTP 401/403
            TigerTagApiClientCommunicationError  : timeout ou erreur réseau
        """
        headers = {"Content-Type": "application/json"}
        if auth and self._id_token:
            headers["Authorization"] = f"Bearer {self._id_token}"

        try:
            async with async_timeout.timeout(15):
                resp = await self._session.request(
                    method=method,
                    url=url,
                    json=json_data,
                    headers=headers,
                )

            if resp.status in (401, 403):
                raise TigerTagApiClientAuthenticationError(
                    f"Authentification Firebase refusée (HTTP {resp.status})"
                )
            if resp.status == 404:
                return None

            resp.raise_for_status()

            try:
                return await resp.json(content_type=None)
            except Exception:
                return await resp.text()

        except TigerTagApiClientError:
            raise
        except asyncio.TimeoutError as exc:
            raise TigerTagApiClientCommunicationError("Timeout Firebase") from exc
        except (aiohttp.ClientError, socket.gaierror) as exc:
            raise TigerTagApiClientCommunicationError(f"Erreur réseau : {exc}") from exc

    # ── Firebase config ─────────────────────────────────────────────────────

    async def _ensure_config(self) -> None:
        """Récupère la config Firebase publique (projectId, apiKey) si absente."""
        if self._project_id and self._api_key:
            return
        data = await self._request("GET", FIREBASE_CONFIG_URL, auth=False)
        if not data:
            raise TigerTagApiClientCommunicationError(
                "Impossible de charger la config Firebase depuis tigertag-cdn.web.app"
            )
        self._project_id = data.get("projectId", "")
        self._api_key    = data.get("apiKey", "")
        _LOGGER.debug("Config Firebase chargée : projectId=%s", self._project_id)

    # ── Authentification ────────────────────────────────────────────────────

    async def authenticate(self) -> None:
        """
        Authentification email/password via Firebase Identity Toolkit.
        Stocke idToken, refreshToken et firebase_uid.
        """
        await self._ensure_config()
        url  = f"{FIREBASE_AUTH_URL}?key={self._api_key}"
        data = await self._request(
            "POST",
            url,
            {
                "email":             self._email,
                "password":          self._password,
                "returnSecureToken": True,
            },
            auth=False,
        )

        if not data or "idToken" not in data:
            raise TigerTagApiClientAuthenticationError(
                "Réponse d'authentification invalide"
            )

        self._id_token      = data["idToken"]
        self._refresh_token = data["refreshToken"]
        self._firebase_uid  = data["localId"]
        self._token_expires = (
            datetime.now().timestamp() + int(data.get("expiresIn", 3600))
        )
        _LOGGER.info("Authentifié Firebase : uid=%s", self._firebase_uid)

    async def refresh_id_token(self) -> None:
        """
        Renouvelle l'idToken via le refreshToken (valide 1h → refresh toutes les 55 min).
        Compatible email/password et OAuth Google.
        """
        await self._ensure_config()
        url  = f"{FIREBASE_REFRESH_URL}?key={self._api_key}"
        data = await self._request(
            "POST",
            url,
            {
                "grant_type":    "refresh_token",
                "refresh_token": self._refresh_token,
            },
            auth=False,
        )

        if not data or "id_token" not in data:
            raise TigerTagApiClientAuthenticationError(
                "Refresh token invalide — reconnexion requise"
            )

        self._id_token      = data["id_token"]
        self._refresh_token = data["refresh_token"]
        self._token_expires = datetime.now().timestamp() + 3600

        # En mode OAuth, le firebase_uid vient de la réponse de refresh
        if not self._firebase_uid and "user_id" in data:
            self._firebase_uid = data["user_id"]

        _LOGGER.debug("Token Firebase rafraîchi (uid=%s)", self._firebase_uid)

    async def ensure_valid_token(self) -> None:
        """
        Garantit un idToken valide avant tout appel Firestore.

        Stratégie :
        - Pas de token du tout → authenticate()
        - Refresh token seulement (mode OAuth) → refresh_id_token()
        - Token expirant dans < 5 min → refresh_id_token(), fallback authenticate()
        """
        if not self._id_token and not self._refresh_token:
            await self.authenticate()
            return

        if not self._id_token and self._refresh_token:
            await self.refresh_id_token()
            return

        if datetime.now().timestamp() > self._token_expires - 300:
            try:
                await self.refresh_id_token()
            except TigerTagApiClientAuthenticationError:
                if self.oauth_mode:
                    raise  # Pas de fallback possible sans navigateur
                _LOGGER.warning("Refresh échoué, re-authentification email/password…")
                await self.authenticate()

    async def ping(self) -> bool:
        """Vérifie les identifiants. Retourne True si OK, False sinon."""
        try:
            await self.authenticate()
            return True
        except TigerTagApiClientAuthenticationError:
            return False
        except TigerTagApiClientError as err:
            _LOGGER.error("Ping Firebase échoué : %s", err)
            return False

    # ── Firestore helpers ───────────────────────────────────────────────────

    def _fs_url(self, path: str) -> str:
        """Construit l'URL REST Firestore complète pour un chemin de document."""
        return (
            f"{FIRESTORE_BASE_URL}/projects/{self._project_id}"
            f"/databases/(default)/documents/{path}"
        )

    # ── Inventaire ──────────────────────────────────────────────────────────

    async def get_inventory(self) -> dict[str, Any]:
        """
        Récupère l'inventaire complet depuis Firestore.

        Retourne un dict {rfid_uid_uppercase: spool_data}.
        Les bobines marquées deleted=True sont exclues.

        Note : le __id Firestore du document = uid hex = spoolId (identiques).
        """
        await self.ensure_valid_token()
        url  = self._fs_url(f"users/{self._firebase_uid}/inventory")
        data = await self._request("GET", url)

        docs: list[dict] = data.get("documents", []) if data else []
        inventory: dict[str, Any] = {}

        for doc in docs:
            fields = _parse_doc(doc)

            # Exclure les bobines supprimées
            if fields.get("deleted") is True:
                continue

            # UID en majuscules — source de vérité pour les clés
            raw_uid  = fields.get("uid") or doc["name"].split("/")[-1]
            rfid_uid = str(raw_uid).upper()
            fields["uid"] = rfid_uid

            # Normaliser twin_tag_uid en majuscules
            twin_raw = fields.get("twin_tag_uid") or ""
            if twin_raw:
                fields["twin_tag_uid"] = str(twin_raw).upper()

            # ── Source de vérité rack : uniquement l'objet imbriqué rack.* ───
            # Les champs plats rack_id / level / position / _rackId / _rackLevel
            # / _rackPos sont des reliquats d'anciennes versions — ignorés.
            rack_obj = fields.get("rack")
            if isinstance(rack_obj, dict) and rack_obj.get("id"):
                fields["rack_id"]        = rack_obj["id"]
                fields["spool_level"]    = rack_obj.get("level")
                fields["spool_position"] = rack_obj.get("position")
            else:
                fields["rack_id"]        = None
                fields["spool_level"]    = None
                fields["spool_position"] = None

            inventory[rfid_uid] = fields

        # ── Sync twin rack en mémoire + correction Firestore différée ────────
        twins_to_fix: list[tuple[str, str, int, int]] = []
        for uid, spool in inventory.items():
            twin_uid = spool.get("twin_tag_uid")
            if not twin_uid or twin_uid not in inventory:
                continue
            twin = inventory[twin_uid]
            if spool.get("rack_id") and not twin.get("rack_id"):
                twin["rack_id"]        = spool["rack_id"]
                twin["spool_level"]    = spool.get("spool_level")
                twin["spool_position"] = spool.get("spool_position")
                _LOGGER.debug(
                    "Twin %s aligné sur rack %s (level=%s pos=%s)",
                    twin_uid, spool["rack_id"],
                    spool.get("spool_level"), spool.get("spool_position"),
                )
                r = spool["rack_id"]
                l = spool.get("spool_level")
                p = spool.get("spool_position")
                if r is not None and l is not None and p is not None:
                    twins_to_fix.append((twin_uid, r, int(l), int(p)))

        if twins_to_fix:
            import asyncio
            async def _fix_twins():
                for tw_uid, r, l, p in twins_to_fix:
                    try:
                        await self.set_spool_rack(tw_uid, rack_id=r, level=l, position=p)
                        _LOGGER.info("Firestore twin corrigé : %s rack=%s l=%d p=%d", tw_uid, r, l, p)
                    except Exception as e:
                        _LOGGER.warning("Correction twin %s échouée : %s", tw_uid, e)
            asyncio.ensure_future(_fix_twins())

        _LOGGER.debug("%d bobine(s) active(s) chargées depuis Firestore", len(inventory))
        return inventory

    # ── Racks ───────────────────────────────────────────────────────────────

    async def get_racks(self) -> dict[str, dict[str, Any]]:
        """
        Récupère tous les racks depuis Firestore.

        Retourne {rack_id: {id, name, level_count, position_count, order,
                             last_update, created_at}}.

        Nomenclature :
            level_count    = nombre d'étages du rack   (champ Firestore "level")
            position_count = nombre de positions/étage (champ Firestore "position")
            order          = ordre d'affichage du rack
        """
        await self.ensure_valid_token()
        url  = self._fs_url(f"users/{self._firebase_uid}/racks")
        data = await self._request("GET", url)

        docs: list[dict] = data.get("documents", []) if data else []
        racks: dict[str, dict[str, Any]] = {}

        for doc in docs:
            rack_id = doc["name"].split("/")[-1]
            fields  = _parse_doc(doc)
            racks[rack_id] = {
                "id":             rack_id,
                "name":           fields.get("name", rack_id),
                # Capacité du rack (renommés pour éviter la confusion avec
                # spool.level / spool.position qui sont la position de la bobine)
                "level_count":    int(fields.get("level", 0)),
                "position_count": int(fields.get("position", 0)),
                "order":          int(fields.get("order", 0)),
                # Dates Firestore (ISO strings)
                "last_update":    fields.get("lastUpdate"),
                "created_at":     fields.get("createdAt"),
            }

        _LOGGER.debug("%d rack(s) chargé(s)", len(racks))
        return racks

    async def set_spool_rack(
        self,
        uid: str,
        rack_id: str | None,
        level: int | None = None,
        position: int | None = None,
    ) -> None:
        """
        Met à jour le rack_id, l'étage et la position d'une bobine dans Firestore.

        Args:
            uid      : UID hex de la bobine (uppercase)
            rack_id  : ID Firestore du rack, ou None pour retirer du rack
            level    : étage dans le rack (0-based), ou None pour effacer
            position : position dans l'étage (1-based), ou None pour effacer
        """
        await self.ensure_valid_token()
        now_ms   = int(datetime.now().timestamp() * 1000)
        spool_id = uid.upper()

        def _fs_nullable_int(val: int | None) -> dict:
            return {"nullValue": None} if val is None else _to_fs_int(val)

        # Structure Firestore : objet imbriqué rack.{id, level, position}
        # rack_id plat écrit aussi pour compatibilité app TigerTag Studio.
        if rack_id is None:
            mask = (
                "updateMask.fieldPaths=rack"
                "&updateMask.fieldPaths=rack_id"
                "&updateMask.fieldPaths=last_update"
            )
            url = self._fs_url(f"users/{self._firebase_uid}/inventory/{spool_id}") + f"?{mask}"
            fields: dict = {
                "rack":        {"nullValue": None},
                "rack_id":     {"nullValue": None},
                "last_update": _to_fs_int(now_ms),
            }
        else:
            mask = (
                "updateMask.fieldPaths=rack"
                "&updateMask.fieldPaths=rack_id"
                "&updateMask.fieldPaths=last_update"
            )
            url = self._fs_url(f"users/{self._firebase_uid}/inventory/{spool_id}") + f"?{mask}"
            fields = {
                "rack": {
                    "mapValue": {
                        "fields": {
                            "id":       {"stringValue": rack_id},
                            "level":    _fs_nullable_int(level),
                            "position": _fs_nullable_int(position),
                        }
                    }
                },
                "rack_id":     {"stringValue": rack_id},
                "last_update": _to_fs_int(now_ms),
            }

        await self._request("PATCH", url, {"fields": fields})
        _LOGGER.debug(
            "Rack mis à jour : uid=%s rack_id=%s level=%s position=%s",
            uid, rack_id, level, position,
        )

    # ── Poids ───────────────────────────────────────────────────────────────

    async def set_weight(
        self,
        uid: str,
        weight: int,
        container_weight: int = 0,
    ) -> None:
        """
        Met à jour le poids disponible d'une bobine dans Firestore.

        Le poids stocké est le poids net (container_weight déjà soustrait
        par la carte JS, donc container_weight=0 en pratique).
        """
        await self.ensure_valid_token()
        now_ms   = int(datetime.now().timestamp() * 1000)
        spool_id = uid.upper()
        url = (
            self._fs_url(f"users/{self._firebase_uid}/inventory/{spool_id}")
            + "?updateMask.fieldPaths=weight_available&updateMask.fieldPaths=last_update"
        )
        await self._request(
            "PATCH",
            url,
            {
                "fields": {
                    "weight_available": _to_fs_int(max(0, weight)),
                    "last_update":      _to_fs_int(now_ms),
                }
            },
        )
        _LOGGER.debug("Poids mis à jour : uid=%s weight=%dg", uid, weight)

    async def set_weight_with_twin(
        self,
        uid: str,
        weight: int,
        container_weight: int = 0,
        twin_uid: str | None = None,
    ) -> None:
        """
        Met à jour le poids d'une bobine et de son twin simultanément.
        Le twin est optionnel ; son échec est loggué mais ne bloque pas.
        """
        await self.set_weight(uid=uid, weight=weight, container_weight=container_weight)
        if twin_uid:
            try:
                await self.set_weight(uid=twin_uid, weight=weight)
                _LOGGER.debug("Twin mis à jour : uid=%s weight=%dg", twin_uid, weight)
            except Exception as err:
                _LOGGER.warning(
                    "Mise à jour twin %s échouée (non bloquant) : %s", twin_uid, err
                )

    # ── Références ──────────────────────────────────────────────────────────

    async def get_references(self) -> dict[str, Any]:
        """
        Récupère les tables de référence depuis api.tigertag.io.

        Ces données (brand, material, aspect…) sont sur l'API REST TigerTag,
        pas dans Firestore. Mises en cache 24h par TigerTagStorage.
        """
        endpoints = {
            "version":      f"{REFERENCES_BASE_URL}/version/get/all",
            "material":     f"{REFERENCES_BASE_URL}/material/filament/get/all",
            "aspect":       f"{REFERENCES_BASE_URL}/aspect/get/all",
            "type":         f"{REFERENCES_BASE_URL}/type/get/all",
            "diameter":     f"{REFERENCES_BASE_URL}/diameter/filament/get/all",
            "brand":        f"{REFERENCES_BASE_URL}/brand/get/all",
            "measure_unit": f"{REFERENCES_BASE_URL}/measure_unit/get/all",
        }
        references: dict[str, Any] = {}
        for key, url in endpoints.items():
            try:
                references[key] = await self._request("GET", url, auth=False)
            except Exception as err:
                _LOGGER.warning("Référence '%s' non récupérée : %s", key, err)
                references[key] = None

        return references
