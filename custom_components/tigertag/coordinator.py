"""DataUpdateCoordinator pour TigerTag — Firebase."""
import logging
from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import TigerTagApiClient, TigerTagApiClientError
from .const import DOMAIN, UPDATE_INTERVAL, TOKEN_REFRESH_INTERVAL
from .storage import TigerTagStorage

_LOGGER = logging.getLogger(__name__)


class TigerTagDataUpdateCoordinator(DataUpdateCoordinator):
    """
    Coordinator central — expose coordinator.data :
    {
        "inventory":  { rfid_uid: spool_dict },
        "references": { "brand": [...], ... },
        "locations":  { uid: "sensor.p2s_ams_1_emplacement_1" },
        "tares":      { uid: 250 },
        "racks":      { rack_id: {"id","name","level","position","order"} },
    }
    """

    def __init__(self, hass: HomeAssistant, client: TigerTagApiClient, entry) -> None:
        self.client   = client
        self.storage  = TigerTagStorage(hass)
        self._entry   = entry
        self._token_unsub = None

        super().__init__(
            hass, _LOGGER, name=DOMAIN,
            update_interval=timedelta(seconds=UPDATE_INTERVAL),
        )

    # ── Init / Shutdown ─────────────────────────────────────────────────────

    async def async_setup(self) -> None:
        await self.storage.async_load()
        # Restaurer tokens
        refresh_token = self.storage.get_refresh_token()
        id_token      = self.storage.get_id_token()
        if refresh_token:
            self.client._refresh_token = refresh_token
            self.client._id_token      = id_token
        # Refresh auto toutes les 55 min
        self._token_unsub = async_track_time_interval(
            self.hass, self._async_refresh_token,
            timedelta(seconds=TOKEN_REFRESH_INTERVAL),
        )

    async def async_shutdown(self) -> None:
        if self._token_unsub:
            self._token_unsub()
            self._token_unsub = None

    async def _async_refresh_token(self, _now=None) -> None:
        try:
            await self.client.refresh_id_token()
            await self.storage.async_save_tokens(
                self.client.refresh_token, self.client.id_token,
            )
        except Exception as err:
            _LOGGER.warning("Refresh token échoué : %s", err)
            # Fallback email/password uniquement si un mot de passe est disponible
            # (mode token sans password → pas de fallback possible)
            if self.client._password:
                try:
                    await self.client.authenticate()
                    await self.storage.async_save_tokens(
                        self.client.refresh_token, self.client.id_token,
                    )
                except Exception as err2:
                    _LOGGER.error("Re-authentification email/password échouée : %s", err2)
            else:
                _LOGGER.error(
                    "Refresh token invalide et aucun mot de passe disponible — "
                    "reconnexion manuelle requise."
                )

    # ── Raccourcis storage ──────────────────────────────────────────────────

    def get_location(self, uid: str) -> str | None:
        return self.storage.get_location(uid)

    async def async_set_location(self, uid: str, entity_id: str | None) -> None:
        await self.storage.async_set_location(uid, entity_id)

    def get_tare(self, uid: str) -> int | None:
        return self.storage.get_tare(uid)

    async def async_set_tare(self, uid: str, tare_g: int | None) -> None:
        await self.storage.async_set_tare(uid, tare_g)

    def get_spool_profile(self, uid: str) -> str | None:
        return self.storage.get_spool_profile(uid)

    async def async_set_spool_profile(self, uid: str, tray_info_idx: str | None) -> None:
        await self.storage.async_set_spool_profile(uid, tray_info_idx)

    # ── Boucle principale ───────────────────────────────────────────────────

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            await self._refresh_references_if_needed()
            inventory = await self.client.get_inventory()
            racks     = await self.client.get_racks()

            await self.storage.async_save_tokens(
                self.client.refresh_token, self.client.id_token,
            )

            return {
                "inventory":  inventory,
                "references": self.storage.references,
                "locations":  self.storage.locations,
                "tares":      self.storage.tares,
                "racks":      racks,
            }
        except TigerTagApiClientError as exc:
            raise UpdateFailed(f"Mise à jour TigerTag échouée : {exc}") from exc

    async def _refresh_references_if_needed(self) -> None:
        if not self.storage.references_are_stale():
            return
        try:
            refs = await self.client.get_references()
            await self.storage.async_save_references(refs)
        except Exception as err:
            _LOGGER.warning("Références non mises à jour (cache conservé) : %s", err)
