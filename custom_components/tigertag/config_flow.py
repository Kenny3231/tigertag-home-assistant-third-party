"""Config flow pour TigerTag — Email/Password ou Firebase Refresh Token."""
import logging
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers import selector

from .api import (
    TigerTagApiClient,
    TigerTagApiClientAuthenticationError,
    TigerTagApiClientCommunicationError,
)
from .const import (
    CONF_EMAIL, CONF_PASSWORD, CONF_FIREBASE_UID, DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

# ── Schémas ────────────────────────────────────────────────────────────────

STEP_USER_SCHEMA = vol.Schema({
    vol.Required("auth_mode", default="password"): selector.selector({
        "select": {
            "options": ["password", "token"],
            "translation_key": "auth_mode",
        }
    }),
})

STEP_PASSWORD_SCHEMA = vol.Schema({
    vol.Required(CONF_EMAIL):    selector.selector({"text": {"type": "email"}}),
    vol.Required(CONF_PASSWORD): selector.selector({"text": {"type": "password"}}),
})

STEP_TOKEN_SCHEMA = vol.Schema({
    vol.Optional(CONF_EMAIL, default=""): selector.selector({"text": {"type": "email"}}),
    vol.Required("refresh_token"): selector.selector({"text": {"multiline": True}}),
})


# ── Helpers de validation ───────────────────────────────────────────────────

async def _validate_password(hass, data: dict[str, Any]) -> tuple[str, str, str]:
    """Valide email/password. Retourne (title, firebase_uid, refresh_token)."""
    session = async_get_clientsession(hass)
    client  = TigerTagApiClient(
        email=data[CONF_EMAIL],
        password=data[CONF_PASSWORD],
        session=session,
    )
    await client.authenticate()
    return f"TigerTag ({data[CONF_EMAIL]})", client.firebase_uid, client.refresh_token


async def _validate_token(hass, data: dict[str, Any]) -> tuple[str, str, str]:
    """
    Valide un refresh token Firebase.
    Retourne (title, firebase_uid, refresh_token).
    L'email est optionnel — le firebase_uid est toujours récupéré depuis le token.
    """
    session = async_get_clientsession(hass)
    email   = data.get(CONF_EMAIL, "").strip()
    client  = TigerTagApiClient(
        email=email,
        password="",
        session=session,
        refresh_token=data["refresh_token"],
    )
    await client.refresh_id_token()
    label = email if email else client.firebase_uid
    return f"TigerTag ({label})", client.firebase_uid, client.refresh_token


# ── Config Flow ─────────────────────────────────────────────────────────────

class TigerTagConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Config flow TigerTag — deux modes d'auth."""

    VERSION = 2

    def __init__(self) -> None:
        self._data:  dict[str, Any] = {}
        self._title: str = ""

    # ── Étape 1 : choix du mode ─────────────────────────────────────────────
    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        if user_input is not None:
            if user_input["auth_mode"] == "token":
                return await self.async_step_token(None)
            return await self.async_step_password(None)

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_SCHEMA,
            errors={},
        )

    # ── Étape 2a : Email + Password ─────────────────────────────────────────
    async def async_step_password(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                self._title, firebase_uid, refresh_token = await _validate_password(
                    self.hass, user_input,
                )
            except TigerTagApiClientAuthenticationError:
                errors["base"] = "invalid_auth"
            except TigerTagApiClientCommunicationError:
                errors["base"] = "cannot_connect"
            except Exception:
                _LOGGER.exception("Erreur validation TigerTag email/password")
                errors["base"] = "unknown"
            else:
                await self.async_set_unique_id(firebase_uid)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title=self._title,
                    data={
                        CONF_EMAIL:         user_input[CONF_EMAIL],
                        CONF_PASSWORD:      user_input[CONF_PASSWORD],
                        CONF_FIREBASE_UID:  firebase_uid,
                        "_refresh_token":   refresh_token,
                        "_auth_mode":       "password",
                    },
                )

        return self.async_show_form(
            step_id="password",
            data_schema=STEP_PASSWORD_SCHEMA,
            errors=errors,
        )

    # ── Étape 2b : Refresh Token ─────────────────────────────────────────────
    async def async_step_token(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                self._title, firebase_uid, refresh_token = await _validate_token(
                    self.hass, user_input,
                )
            except TigerTagApiClientAuthenticationError:
                errors["base"] = "invalid_token"
            except TigerTagApiClientCommunicationError:
                errors["base"] = "cannot_connect"
            except Exception:
                _LOGGER.exception("Erreur validation TigerTag refresh token")
                errors["base"] = "unknown"
            else:
                await self.async_set_unique_id(firebase_uid)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title=self._title,
                    data={
                        CONF_EMAIL:         user_input.get(CONF_EMAIL, ""),
                        CONF_PASSWORD:      "",
                        CONF_FIREBASE_UID:  firebase_uid,
                        "_refresh_token":   refresh_token,
                        "_auth_mode":       "token",
                    },
                )

        return self.async_show_form(
            step_id="token",
            data_schema=STEP_TOKEN_SCHEMA,
            errors=errors,
        )

    # ── Options flow ─────────────────────────────────────────────────────────
    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return TigerTagOptionsFlow(config_entry)


class TigerTagOptionsFlow(config_entries.OptionsFlow):
    """Options flow TigerTag (vide pour l'instant)."""

    def __init__(self, config_entry) -> None:
        self._entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        return self.async_create_entry(title="", data={})
