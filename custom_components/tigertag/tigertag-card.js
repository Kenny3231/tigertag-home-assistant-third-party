/**
 * TigerTag Card v4.0
 * - Logo "link" SVG inline pour Twin Tag
 * - Bouton refresh
 * - Tare masterspool modifiable par bobine
 * - Lieux de stockage dynamiques (depuis config_flow)
 * - Détection automatique des imprimantes Bambu Lab et leurs trays
 * - Envoi via bambu_lab.set_filament (plus de MQTT manuel)
 * - Zéro scintillement (DOM persistant)
 */
const VERSION = "4.0.0";

// SVG "link / chaîne" inspiré de Flaticon #455691
const LINK_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const CSS = `
:host {
  display: block;
  --tt-green: #1D9E75;
  --tt-red:   #E24B4A;
  --tt-blue:  #185FA5;
  --tt-panel-w: 340px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
.tt { background: var(--lovelace-background, var(--primary-background-color)); }

/* Toolbar */
.tt-toolbar {
  display: flex; gap: 8px; padding: 12px 16px 0;
  align-items: center; flex-wrap: wrap;
}
.tt-title { font-size: 16px; font-weight: 500; color: var(--primary-text-color); flex: none; margin-right: 4px; }
.tt-search {
  flex: 1; min-width: 140px; height: 36px; padding: 0 12px; font-size: 13px;
  border-radius: 8px; border: 1px solid var(--divider-color);
  background: var(--card-background-color); color: var(--primary-text-color);
  outline: none; transition: border-color .15s;
}
.tt-search:focus { border-color: var(--tt-green); }
.tt-btn-refresh {
  height: 36px; width: 36px; border-radius: 8px; flex-shrink: 0;
  border: 1px solid var(--divider-color); background: var(--card-background-color);
  color: var(--secondary-text-color); cursor: pointer; display: flex;
  align-items: center; justify-content: center; transition: all .15s;
}
.tt-btn-refresh:hover { border-color: var(--tt-green); color: var(--tt-green); }
.tt-btn-refresh.spinning svg { animation: tt-spin .7s linear infinite; }
@keyframes tt-spin { to { transform: rotate(360deg); } }

/* Filtres */
.tt-filters {
  display: flex; gap: 5px; padding: 8px 16px; flex-wrap: wrap;
  border-bottom: 1px solid var(--divider-color);
}
.tt-filter {
  font-size: 11px; padding: 3px 11px; border-radius: 20px;
  border: 1px solid var(--divider-color); background: transparent;
  color: var(--secondary-text-color); cursor: pointer; transition: all .12s; white-space: nowrap;
}
.tt-filter:hover { border-color: var(--tt-green); color: var(--tt-green); }
.tt-filter.active { background: var(--tt-green); color: #fff; border-color: var(--tt-green); }

/* Grille */
.tt-grid-wrap { padding: 12px 16px 16px; }
.tt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 10px; }
@media (max-width: 480px) { .tt-grid { grid-template-columns: repeat(2, 1fr); } }

/* Carte bobine */
.tt-spool {
  background: var(--card-background-color); border: 1px solid var(--divider-color);
  border-radius: 12px; overflow: hidden; cursor: pointer;
  transition: border-color .12s, transform .1s; position: relative;
}
.tt-spool:hover { border-color: var(--tt-green); transform: translateY(-1px); }
.tt-spool.selected { border: 2px solid var(--tt-green); box-shadow: 0 0 0 3px color-mix(in srgb, var(--tt-green) 15%, transparent); }
.tt-spool.low-stock { border-color: var(--tt-red); }
.tt-spool.low-stock.selected { border-color: var(--tt-red); box-shadow: 0 0 0 3px color-mix(in srgb, var(--tt-red) 15%, transparent); }

.tt-spool-img-wrap { width: 100%; aspect-ratio: 1/1; overflow: hidden; position: relative; background: var(--secondary-background-color); }
.tt-spool-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .2s; }
.tt-spool:hover .tt-spool-img { transform: scale(1.03); }
.tt-spool-color { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.tt-spool-body { padding: 8px 9px 9px; }
.tt-spool-name { font-size: 12px; font-weight: 500; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
.tt-spool-sub  { font-size: 10px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px; }
.tt-spool-foot { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
.tt-spool-weight { font-size: 12px; font-weight: 500; color: var(--primary-text-color); }
.tt-bar { height: 3px; border-radius: 2px; background: var(--divider-color); margin-top: 6px; }
.tt-bar-fill { height: 100%; border-radius: 2px; }

/* Tags */
.tt-tag { font-size: 9px; padding: 2px 5px; border-radius: 4px; font-weight: 500; white-space: nowrap; }
.tt-tag-plus   { background: #fff3e0; color: #bf360c; }
.tt-tag-base   { background: #e8f5e9; color: #1b5e20; }
.tt-tag-ams    { background: #e1f5ee; color: #0f6e56; }
.tt-tag-room   { background: #e6f1fb; color: var(--tt-blue); }
.tt-tag-refill { background: #fce4ec; color: #880e4f; }
.tt-tag-eco    { background: #e8f5e9; color: #1b5e20; }

/* Badge twin — logo chaîne */
.tt-twin-dot {
  position: absolute; top: 6px; right: 6px;
  height: 20px; padding: 0 5px; border-radius: 10px;
  background: rgba(24,95,165,.8); backdrop-filter: blur(4px);
  display: flex; align-items: center; gap: 3px;
}
.tt-twin-dot svg { width: 11px; height: 11px; color: #fff; }
.tt-twin-dot span { font-size: 9px; font-weight: 500; color: #fff; }

/* Overlay */
.tt-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 99; }
.tt-overlay.open { display: block; }

/* Panneau */
.tt-panel {
  position: fixed; top: 0; right: 0; bottom: 0; width: var(--tt-panel-w);
  background: var(--card-background-color); border-left: 1px solid var(--divider-color);
  display: flex; flex-direction: column;
  transform: translateX(100%); transition: transform .28s cubic-bezier(.4,0,.2,1);
  overflow: hidden; z-index: 100; box-shadow: -4px 0 24px rgba(0,0,0,.18);
}
.tt-panel.open { transform: translateX(0); }
@media (max-width: 700px) { .tt-panel { width: 100%; border-left: none; } }

.tt-panel-head {
  display: flex; align-items: center; padding: 10px 12px;
  border-bottom: 1px solid var(--divider-color); gap: 8px; flex-shrink: 0;
}
.tt-panel-close {
  width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--divider-color);
  background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: var(--secondary-text-color); flex-shrink: 0;
}
.tt-panel-close:hover { background: var(--secondary-background-color); }
.tt-panel-head-name { font-size: 13px; font-weight: 500; color: var(--primary-text-color); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.tt-panel-img-wrap { width: 100%; overflow: hidden; flex-shrink: 0; position: relative; background: var(--secondary-background-color); }
.tt-panel-img   { width: 100%; height: auto; max-height: 240px; object-fit: contain; display: block; }
.tt-panel-color { width: 100%; aspect-ratio: 4/3; max-height: 180px; display: flex; align-items: center; justify-content: center; }
.tt-panel-badges { position: absolute; top: 8px; left: 8px; display: flex; gap: 4px; flex-wrap: wrap; }
.tt-panel-badge { font-size: 9px; padding: 2px 7px; border-radius: 4px; font-weight: 500; backdrop-filter: blur(4px); }

.tt-panel-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 14px; }
.tt-section-label { font-size: 10px; font-weight: 500; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 7px; }

/* Poids */
.tt-weight-box { background: var(--secondary-background-color); border-radius: 8px; padding: 10px; }
.tt-weight-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
.tt-weight-val { font-size: 24px; font-weight: 500; color: var(--primary-text-color); }
.tt-weight-cap { font-size: 11px; color: var(--secondary-text-color); }
.tt-w-bar { height: 4px; border-radius: 2px; background: var(--divider-color); margin-bottom: 8px; }
.tt-w-bar-fill { height: 100%; border-radius: 2px; }
input[type=range].tt-range { width: 100%; margin: 0 0 8px; cursor: pointer; accent-color: var(--tt-green); }
.tt-weight-row2 { display: flex; gap: 6px; margin-bottom: 8px; }
.tt-w-input {
  flex: 1; height: 32px; padding: 0 8px; font-size: 13px;
  border-radius: 6px; border: 1px solid var(--divider-color);
  background: var(--card-background-color); color: var(--primary-text-color); outline: none;
}
.tt-w-input:focus { border-color: var(--tt-green); }
.tt-btn-save {
  height: 32px; padding: 0 14px; border-radius: 6px; border: none;
  background: var(--tt-green); color: #fff; font-size: 12px; font-weight: 500; cursor: pointer;
}
.tt-btn-save:hover { opacity: .85; }
.tt-btn-save:disabled { opacity: .5; cursor: default; }
.tt-w-note { font-size: 11px; color: var(--secondary-text-color); margin-top: 4px; }

/* Tare */
.tt-tare-row { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
.tt-tare-label { font-size: 11px; color: var(--secondary-text-color); white-space: nowrap; }
.tt-tare-input {
  width: 80px; height: 28px; padding: 0 7px; font-size: 12px;
  border-radius: 6px; border: 1px solid var(--divider-color);
  background: var(--card-background-color); color: var(--primary-text-color); outline: none;
}
.tt-tare-input:focus { border-color: var(--tt-green); }
.tt-btn-tare {
  height: 28px; padding: 0 10px; border-radius: 6px;
  border: 1px solid var(--divider-color); background: transparent;
  color: var(--primary-text-color); font-size: 11px; cursor: pointer;
}
.tt-btn-tare:hover { background: var(--secondary-background-color); }

/* Emplacement */
.tt-loc-rows { display: flex; flex-direction: column; gap: 7px; }
.tt-loc-row  { display: flex; align-items: center; gap: 8px; }
.tt-loc-lbl  { font-size: 11px; color: var(--secondary-text-color); width: 44px; flex-shrink: 0; }
.tt-loc-sel  {
  flex: 1; height: 30px; font-size: 12px; padding: 0 7px;
  border-radius: 6px; border: 1px solid var(--divider-color);
  background: var(--card-background-color); color: var(--primary-text-color); outline: none;
}
.tt-loc-sel:focus { border-color: var(--tt-green); }
.tt-btn-ams {
  margin-top: 4px; height: 30px; padding: 0 12px; border-radius: 6px;
  border: 1px solid var(--tt-green); background: transparent; color: var(--tt-green);
  font-size: 11px; font-weight: 500; cursor: pointer; width: 100%;
}
.tt-btn-ams:hover { background: color-mix(in srgb, var(--tt-green) 10%, transparent); }

/* Températures */
.tt-temp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.tt-temp-chip { background: var(--secondary-background-color); border-radius: 7px; padding: 8px; text-align: center; }
.tt-temp-lbl  { font-size: 10px; color: var(--secondary-text-color); margin-bottom: 3px; }
.tt-temp-val  { font-size: 13px; font-weight: 500; color: var(--primary-text-color); }

/* Liens */
.tt-links { display: flex; gap: 5px; flex-wrap: wrap; }
.tt-link-btn { font-size: 11px; padding: 4px 9px; border-radius: 5px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-color); text-decoration: none; display: inline-block; }
.tt-link-btn:hover { background: var(--secondary-background-color); }

/* Info rows */
.tt-info-row { display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px solid var(--divider-color); }
.tt-info-row:last-child { border-bottom: none; }
.tt-info-k { color: var(--secondary-text-color); }
.tt-info-v { color: var(--primary-text-color); font-weight: 500; text-align: right; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.tt-empty { grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--secondary-text-color); font-size: 13px; }

/* ── Panneau — structure principale ── */
.tt-panel { display:flex; flex-direction:column; overflow:hidden; }
.tt-panel-head { flex-shrink:0; }
.tt-panel-scroll {
  flex:1; overflow-y:auto; overflow-x:hidden;
  overscroll-behavior:contain;
}
/* Image dans le panneau — sticky après le header */
.tt-panel-img-wrap {
  position:sticky; top:0; z-index:1;
  background:var(--secondary-background-color);
  flex-shrink:0;
}
.tt-panel-infobar { padding: 10px 12px 4px; }
.tt-panel-name { font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
.tt-panel-meta { font-size: 11px; color: var(--secondary-text-color); margin-top: 2px; }
.tt-panel-tags {
  display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px 10px;
  background: linear-gradient(to bottom, transparent 0%, var(--card-background-color) 80%);
  margin-top: -32px; position: relative; z-index: 2;
}
.tt-panel-split { border-top: 1px solid var(--divider-color); border-bottom: 1px solid var(--divider-color); }
.tt-section-label { font-size: 10px; font-weight: 500; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 8px; }

/* ── Onglets panneau ── */
.tt-tabs { display:flex; border-bottom:1px solid var(--divider-color); flex-shrink:0; }
.tt-tab {
  flex:1; padding:10px 12px; font-size:12px; font-weight:500;
  color:var(--secondary-text-color); cursor:pointer; text-align:center;
  border-bottom:2px solid transparent; transition:all .15s;
}
.tt-tab:hover { color:var(--primary-text-color); }
.tt-tab.active { color:var(--tt-green); border-bottom-color:var(--tt-green); }
.tt-tab-content { display:none; flex:1; overflow-y:auto; overflow-x:hidden; }
.tt-tab-content.active { display:flex; flex-direction:column; }

/* ── Toggle vue ── */
.tt-view-toggle { display:flex; gap:4px; flex-shrink:0; }
.tt-view-btn {
  height:36px; padding:0 10px; border-radius:8px; border:1px solid var(--divider-color);
  background:transparent; color:var(--secondary-text-color); cursor:pointer;
  display:flex; align-items:center; gap:5px; font-size:12px; transition:all .12s;
}
.tt-view-btn:hover  { border-color:var(--tt-green); color:var(--tt-green); }
.tt-view-btn.active { background:var(--tt-green); color:#fff; border-color:var(--tt-green); }
.tt-view-btn svg    { width:14px; height:14px; }

/* ── Table ── */
.tt-table-wrap { padding:0 16px 16px; overflow-x:auto; }
table.tt-table {
  width:100%; border-collapse:collapse; font-size:12px;
}
table.tt-table th {
  text-align:left; padding:8px 10px; font-size:10px; font-weight:500;
  color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.05em;
  border-bottom:1px solid var(--divider-color); cursor:pointer; white-space:nowrap;
  user-select:none;
}
table.tt-table th:hover { color:var(--tt-green); }
table.tt-table th .tt-sort-icon { display:inline-block; margin-left:3px; opacity:.4; }
table.tt-table th.sorted .tt-sort-icon { opacity:1; color:var(--tt-green); }
table.tt-table td {
  padding:8px 10px; border-bottom:1px solid var(--divider-color);
  color:var(--primary-text-color); vertical-align:middle;
}
table.tt-table tr:last-child td { border-bottom:none; }
table.tt-table tr:hover td { background:var(--secondary-background-color); cursor:pointer; }
table.tt-table tr.selected td { background:color-mix(in srgb,var(--tt-green) 8%,transparent); }
table.tt-table tr.low-stock td { color:var(--tt-red); }
.tt-table-img { width:32px; height:32px; border-radius:6px; object-fit:cover; }
.tt-table-color { width:32px; height:32px; border-radius:6px; }
.tt-table-bar { height:3px; border-radius:2px; background:var(--divider-color); margin-top:3px; min-width:60px; }
.tt-table-bar-fill { height:100%; border-radius:2px; }
`;

class TigerTagCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass        = null;
    this._config      = {};
    this._selected    = null;
    this._search      = "";
    this._filter      = "Toutes";
    this._editWeight  = null;
    this._initialized = false;
    this._refreshing  = false;
    this._domGrid = this._domOverlay = this._domPanel = this._domFilters = null;
    this._viewMode = 'grid';   // sera mis à jour par setConfig
    this._dataHash = null;     // hash des données pour éviter les re-renders inutiles
    this._sortCol  = 'name';   // colonne de tri courante
    this._sortDir  = 1;        // 1=asc -1=desc
    this._domTable = null;
  }

  setConfig(cfg) {
    this._config   = { title: cfg.title || null, defaultView: cfg.default_view || 'grid' };
    // Initialiser le mode vue depuis la config — setConfig est appelé avant _initDOM
    this._viewMode = this._config.defaultView;
  }
  static getStubConfig() { return { type: "custom:tigertag-card" }; }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) { this._initDOM(); this._initialized = true; }

    // Ne re-render la grille que si les données ont réellement changé.
    // HA appelle set hass très fréquemment (toutes les secondes) — sans ce
    // garde-fou, chaque update détruit et recrée le DOM, perdant le hover
    // et causant un clignotement permanent.
    const hash = this._computeDataHash();
    if (hash !== this._dataHash) {
      this._dataHash = hash;
      this._renderGrid();
    }

    if (this._selected) this._syncPanelWeight();
  }

  _computeDataHash() {
    if (!this._hass) return null;
    const states = this._hass.states;
    let h = "";
    for (const [id, s] of Object.entries(states)) {
      if (id.startsWith("sensor.tigertag_")) {
        h += id + ":" + s.last_changed + ":" + s.state + "|";
      }
    }
    // Inclure les racks dans le hash — ils viennent du StatsSensor
    // et peuvent charger après les sensors bobines
    const racks = this._getRacks();
    h += "racks:" + Object.keys(racks).sort().join(",");
    return h;
  }

  /* ── Détection Bambu Lab ─────────────────────────────────────────────── */

  /**
   * Détecte tous les trays Bambu Lab dans hass.states
   * en cherchant les entités qui ont tag_uid + tray_uuid dans leurs attributs.
   * Fonctionne pour N imprimantes (P2S, X1C, A1...) et N AMS.
   */
  _getBambuTrayEntities() {
    if (!this._hass) return [];
    // Mots-clés qui indiquent un sensor virtuel (pas un emplacement physique)
    const VIRTUAL = ["actif", "active", "current", "now", "en_cours"];
    return Object.values(this._hass.states).filter(e => {
      if (!e.entity_id.startsWith("sensor.")) return false;
      const a = e.attributes;
      // Signature unique d'un tray Bambu Lab (ha-bambulab)
      if (a.tag_uid === undefined || a.tray_uuid === undefined) return false;
      // Exclure les sensors virtuels (emplacement actif, current tray...)
      const eid   = e.entity_id.toLowerCase();
      const fname = (a.friendly_name || "").toLowerCase();
      if (VIRTUAL.some(k => eid.includes(k) || fname.includes(k))) return false;
      return true;
    });
  }

  /**
   * Extrait le nom de l'imprimante depuis l'entity_id.
   * Ex: "sensor.p2s_ams_1_emplacement_1" → "P2S"
   *     "sensor.x1c_bambu_ams_2_slot_3"  → "X1C Bambu"
   */
  _printerName(entityId) {
    // Tout ce qui est avant "_ams_" ou "_external"
    const m = entityId.match(/^sensor\.([^_]+(?:_[^_]+)*?)(?:_ams_|_external)/i);
    if (m) return m[1].replace(/_/g, " ").toUpperCase();
    return entityId.split(".")[1].split("_")[0].toUpperCase();
  }

  /**
   * Construit la liste des options pour le sélecteur AMS,
   * regroupées par imprimante.
   * Retourne : [
   *   { value: "—",           label: "Pas dans un AMS", group: null },
   *   { value: "sensor.p2s_ams_1_emplacement_1", label: "AMS 1 — Emplacement 1", group: "P2S" },
   *   { value: "sensor.p2s_external_spool", label: "Bobine externe", group: "P2S" },
   *   ...
   * ]
   */
  _getBambuTrayOptions() {
    const trays = this._getBambuTrayEntities();
    const opts  = [{ value: "—", label: "Pas dans un AMS", group: null }];

    // Trier par entity_id pour un ordre stable
    trays.sort((a, b) => a.entity_id.localeCompare(b.entity_id));

    trays.forEach(e => {
      const printer = this._printerName(e.entity_id);
      const fname   = e.attributes.friendly_name || e.entity_id;
      // Raccourcir le friendly_name : enlever le préfixe imprimante si présent
      // "P2S AMS 1 Emplacement 1" → "AMS 1 — Emplacement 1"
      const short = fname
        .replace(new RegExp(`^${printer}\s*`, "i"), "")
        .replace(/emplacement\s+(\d+)/i, "Empl. $1")
        .replace(/slot\s+(\d+)/i,        "Slot $1")
        .replace(/tray\s+(\d+)/i,        "Tray $1")
        .replace(/external.*/i,          "Bobine externe")
        .replace(/\s+/g, " ").trim() || fname;

      // Indicateur visuel
      const tagUid = (e.attributes.tag_uid || "").replace(/0/g,"");
      const hasRfid = tagUid.length > 0;  // tag non vide = bobine avec puce
      const active  = e.attributes.active;
      // Chercher si une bobine TigerTag est assignée à ce tray
      const hasTiger = this._allSpools().some(s => s.ams_entity === e.entity_id);

      let icon  = "○";  // vide
      let extra = "";
      if (hasTiger) {
        const tiger = this._allSpools().find(s => s.ams_entity === e.entity_id);
        icon  = active ? "▶" : "●";
        extra = tiger ? ` (${this._esc(tiger.name)})` : "";
      } else if (hasRfid) {
        icon = "◉";  // puce Bambu native
      }

      opts.push({
        value:  e.entity_id,
        label:  `${icon} ${short}${extra}`,
        group:  printer,
        entity: e,
      });
    });

    return opts;
  }

  /* ── Lieux de stockage depuis le coordinator ─────────────────────────── */
  _getRacks() {
    // Retourne {rack_id: {id, name, level, position}} depuis le sensor stats
    if (!this._hass) return {};
    const stats = Object.values(this._hass.states)
      .find(e => e.entity_id === "sensor.tigertag_statistiques");
    return stats?.attributes?.racks || {};
  }

  _getRackName(rack_id) {
    if (!rack_id) return null;
    return this._getRacks()[rack_id]?.name || rack_id;
  }

  /* ── Init DOM ────────────────────────────────────────────────────────── */
  _initDOM() {
    const style = document.createElement("style");
    style.textContent = CSS;
    const root = document.createElement("div");
    root.className = "tt";

    // Toolbar
    const tb = document.createElement("div");
    tb.className = "tt-toolbar";
    if (this._config.title) {
      const t = document.createElement("span");
      t.className = "tt-title"; t.textContent = this._config.title;
      tb.appendChild(t);
    }
    const inp = document.createElement("input");
    inp.className = "tt-search"; inp.type = "text";
    inp.placeholder = "Rechercher marque, matériau, couleur, UID…";
    inp.addEventListener("input", e => { this._search = e.target.value; this._renderGrid(); });
    tb.appendChild(inp);

    // Bouton refresh
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "tt-btn-refresh";
    refreshBtn.title = "Rafraîchir l'inventaire";
    refreshBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
    refreshBtn.addEventListener("click", () => this._doRefresh(refreshBtn));
    tb.appendChild(refreshBtn);

    // Toggle Grille / Tableau
    const viewToggle = document.createElement("div");
    viewToggle.className = "tt-view-toggle";

    const btnGrid = document.createElement("button");
    btnGrid.className = "tt-view-btn" + (this._viewMode==='grid'?" active":"");
    btnGrid.title = "Vue grille";
    btnGrid.innerHTML = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="5" height="5" rx="1"/><rect x="8" y="1" width="5" height="5" rx="1"/><rect x="1" y="8" width="5" height="5" rx="1"/><rect x="8" y="8" width="5" height="5" rx="1"/></svg><span>Grille</span>`;
    btnGrid.addEventListener("click", () => { this._viewMode="grid"; btnGrid.classList.add("active"); btnTable.classList.remove("active"); this._renderGrid(); });

    const btnTable = document.createElement("button");
    btnTable.className = "tt-view-btn" + (this._viewMode==='table'?" active":"");
    btnTable.title = "Vue tableau";
    btnTable.innerHTML = `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="12" height="3" rx="1"/><rect x="1" y="6" width="12" height="3" rx="1"/><rect x="1" y="11" width="12" height="3" rx="1"/></svg><span>Tableau</span>`;
    btnTable.addEventListener("click", () => { this._viewMode="table"; btnTable.classList.add("active"); btnGrid.classList.remove("active"); this._renderGrid(); });

    this._btnGrid  = btnGrid;
    this._btnTable = btnTable;
    viewToggle.appendChild(btnGrid);
    viewToggle.appendChild(btnTable);
    tb.appendChild(viewToggle);
    root.appendChild(tb);

    // Filtres
    this._domFilters = document.createElement("div");
    this._domFilters.className = "tt-filters";
    root.appendChild(this._domFilters);

    // Grille
    const gw = document.createElement("div");
    gw.className = "tt-grid-wrap";
    this._domGrid = document.createElement("div");
    this._domGrid.className = "tt-grid";
    gw.appendChild(this._domGrid);
    root.appendChild(gw);

    // Table
    const tw = document.createElement("div");
    tw.className = "tt-table-wrap";
    tw.style.display = "none";
    this._domTable = tw;
    root.appendChild(tw);

    // Overlay
    this._domOverlay = document.createElement("div");
    this._domOverlay.className = "tt-overlay";
    this._domOverlay.addEventListener("click", () => this._closePanel());

    // Panneau détail bobine
    this._domPanel = document.createElement("div");
    this._domPanel.className = "tt-panel";

    this._amsState = { tray: null, profile: null, uid: null, spool: null };

    this.shadowRoot.replaceChildren(style, root, this._domOverlay, this._domPanel);
    this._buildFilters();
  }

  _buildFilters() {
    const racks   = this._getRacks();
    const rackNames = Object.values(racks).sort((a,b) => a.order - b.order).map(r => r.name);
    const filters = ["Toutes","Dans un AMS","Non placées","Stock faible",...rackNames];
    this._domFilters.innerHTML = "";
    filters.forEach(f => {
      const b = document.createElement("button");
      b.className = "tt-filter" + (f === this._filter ? " active" : "");
      b.textContent = f;
      b.addEventListener("click", () => {
        this._filter = f;
        this._domFilters.querySelectorAll(".tt-filter").forEach(el =>
          el.classList.toggle("active", el.textContent === f));
        this._renderGrid();
      });
      this._domFilters.appendChild(b);
    });
  }

  /* ── Refresh ─────────────────────────────────────────────────────────── */
  async _doRefresh(btn) {
    if (this._refreshing || !this._hass) return;
    this._refreshing = true;
    btn.classList.add("spinning");
    try {
      await this._hass.callService("tigertag", "refresh", {});
    } catch(e) { console.error("[TigerTagCard] refresh:", e); }
    finally {
      setTimeout(() => { this._refreshing = false; btn.classList.remove("spinning"); }, 1500);
    }
  }

  /* ── Données ─────────────────────────────────────────────────────────── */
  _allSpools() {
    if (!this._hass) return [];
    return Object.values(this._hass.states)
      .filter(e => e.entity_id.startsWith("sensor.tigertag_") && e.attributes.uid)
      .map(e => this._normalize(e));
  }

  _normalize(e) {
    const a = e.attributes;
    const tare = a.container_weight_effective ?? a.container_weight_custom ?? a.container_weight ?? 0;
    return {
      entity_id:    e.entity_id,
      uid:          String(a.uid || ""),
      name:         a.color_name || a.product_name || a.friendly_name || e.entity_id,
      brand:        a.brand || "",
      material:     a.material || "",
      series:       a.series || "",
      color_hex:    a.color_hex || "#888888",
      img_url:      (a.img_url && a.img_url !== "--") ? a.img_url : null,
      color_list:   a.online_color_list || [],
      color_type:   a.online_color_type || "",
      color_hex2:   a.color_hex2 || null,
      color_hex3:   a.color_hex3 || null,
      aspect1:      a.aspect1 || "",
      aspect2:      a.aspect2 || "",
      is_plus:      !!a.is_plus,
      has_twin:     !!a.has_twin,
      twin_uid:     a.twin_uid || null,
      weight:       parseFloat(e.state) || 0,
      capacity:     parseFloat(a.capacity_gr) || 1000,
      tare:         parseFloat(tare) || 0,
      tare_official:parseFloat(a.container_weight) || 0,
      tare_custom:  a.container_weight_custom != null ? parseFloat(a.container_weight_custom) : null,
      // Firebase prioritaire : rack_id et ams_entity sont mutuellement exclusifs
      // Si rack_id présent dans Firestore → la bobine N'est PAS dans un AMS
      ams_entity:   (a.rack_id ? null : (a.ams_location || null)),
      rack_id:              a.rack_id || null,
      rack_name:            a.rack_id ? (this._getRacks()[a.rack_id]?.name || a.rack_id) : null,
      rack_level:           a.rack_level ?? null,
      rack_position:        a.rack_position ?? null,
      rack_level_count:     a.rack_id ? (this._getRacks()[a.rack_id]?.level_count ?? null) : null,
      rack_position_count:  a.rack_id ? (this._getRacks()[a.rack_id]?.position_count ?? null) : null,
      rack_order:           a.rack_id ? (this._getRacks()[a.rack_id]?.order ?? null) : null,
      nozzle_min:   a.nozzle_temp_min || null,
      nozzle_max:   a.nozzle_temp_max || null,
      bed_min:      a.bed_temp_min || null,
      bed_max:      a.bed_temp_max || null,
      dry_temp:     a.dry_temp || null,
      dry_time:     a.dry_time_hours || null,
      link_msds:    a.link_msds || null,
      link_tds:     a.link_tds || null,
      link_rohs:    a.link_rohs || null,
      link_reach:   a.link_reach || null,
      link_food:    a.link_food || null,
      link_youtube: a.link_youtube || null,
      is_refill:    !!a.is_refill,
      is_recycled:  !!a.is_recycled,
      sku:          a.sku || null,
      barcode:      a.barcode || null,
      diameter:     a.diameter || null,
      // Profil filament Bambu sauvegardé
      bambu_profile_idx: a.bambu_profile_idx || null,
      // updated_at = epoch seconds, last_update = epoch ms (selon l'API TigerTag)
      // On normalise tout en epoch seconds pour _relTime
      last_update:  a.updated_at
                    || (a.last_update ? Math.round(a.last_update / 1000) : null),
    };
  }

  _deduplicated(spools) {
    const uids = new Set(spools.map(s => s.uid));
    const hidden = new Set();
    spools.forEach(s => {
      if (s.has_twin && s.twin_uid && uids.has(s.twin_uid) && !hidden.has(s.uid))
        hidden.add(s.twin_uid);
    });
    return spools.filter(s => !hidden.has(s.uid));
  }

  _filtered() {
    const all = this._deduplicated(this._allSpools());
    const q   = this._search.toLowerCase();
    const f   = this._filter;
    const thr = 250;
    const filtered = all.filter(s => {
      const mq = !q || s.name.toLowerCase().includes(q) || s.brand.toLowerCase().includes(q)
               || s.material.toLowerCase().includes(q)  || s.uid.toLowerCase().includes(q);
      const mf = f === "Toutes"
        || (f === "Dans un AMS"  && s.ams_entity)
        || (f === "Non placées"  && !s.ams_entity && !s.rack_id)
        || (f === "Stock faible" && s.weight < thr && s.weight >= 0)
        || s.rack_name === f;
      return mq && mf;
    });

    // Tri spécifique par filtre :
    if (f === "Dans un AMS") {
      // Tri par entity_id du tray → T1, T2, T3, T4 dans l'ordre naturel
      filtered.sort((a, b) => {
        const ea = a.ams_entity || "";
        const eb = b.ams_entity || "";
        // Extraire le numéro de tray en fin d'entity_id (ex: _1, _2…)
        const na = parseInt((ea.match(/(\d+)$/) || [])[1] ?? "0");
        const nb = parseInt((eb.match(/(\d+)$/) || [])[1] ?? "0");
        if (ea !== eb) {
          if (na !== nb) return na - nb;
          return ea.localeCompare(eb);
        }
        return a.name.localeCompare(b.name);
      });
    } else if (f !== "Toutes" && f !== "Non placées" && f !== "Stock faible") {
      // Rack sélectionné : Niveau 0 pos 0, 1, 2… puis Niveau 1 pos 0, 1, 2… etc.
      filtered.sort((a, b) => {
        const la = a.rack_level    ?? 999;
        const lb = b.rack_level    ?? 999;
        const pa = a.rack_position ?? 999;
        const pb = b.rack_position ?? 999;
        if (la !== lb) return la - lb;
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      });
    }

    return filtered;
  }

  /* ── Rendu (grille ou tableau selon le mode) ──────────────────────── */
  _renderGrid() {
    if (!this._domGrid) return;
    this._buildFilters();
    const spools = this._filtered();
    const thr    = 250;

    if (this._viewMode === 'table') {
      this._domGrid.parentElement.style.display = "none";
      this._domTable.style.display = "";
      this._renderTable(spools, thr);
      return;
    }

    this._domGrid.parentElement.style.display = "";
    this._domTable.style.display = "none";

    if (!spools.length) {
      this._domGrid.innerHTML = `<div class="tt-empty">Aucune bobine trouvée</div>`;
      return;
    }

    // Mise à jour différentielle : on ne recrée une carte que si son uid
    // ou son état a changé. Cela préserve le hover et évite le clignotement.
    const existing = new Map();
    for (const el of this._domGrid.children) {
      const uid = el.dataset.uid;
      if (uid) existing.set(uid, el);
    }

    const newUids = new Set(spools.map(s => s.uid));

    // Supprimer les cartes dont la bobine n'est plus dans la liste filtrée
    for (const [uid, el] of existing) {
      if (!newUids.has(uid)) { this._domGrid.removeChild(el); existing.delete(uid); }
    }

    // Insérer ou mettre à jour chaque carte dans le bon ordre
    spools.forEach((s, idx) => {
      const cardHash = s.uid + ":" + s.weight + ":" + (s.rack_id||"") + ":" + (s.rack_level??"") + ":" + (s.rack_position??"") + ":" + (s.ams_entity||"");
      const el = existing.get(s.uid);
      if (!el) {
        // Nouvelle bobine → créer la carte
        const newEl = this._spoolCard(s, thr);
        newEl.dataset.uid      = s.uid;
        newEl.dataset.cardHash = cardHash;
        const ref = this._domGrid.children[idx];
        if (ref) this._domGrid.insertBefore(newEl, ref);
        else      this._domGrid.appendChild(newEl);
      } else {
        // Carte existante → repositionner si nécessaire, mettre à jour si contenu changé
        const ref = this._domGrid.children[idx];
        if (ref !== el) this._domGrid.insertBefore(el, ref || null);
        if (el.dataset.cardHash !== cardHash) {
          // Contenu changé : remplacer uniquement cette carte
          const newEl = this._spoolCard(s, thr);
          newEl.dataset.uid      = s.uid;
          newEl.dataset.cardHash = cardHash;
          this._domGrid.replaceChild(newEl, el);
        }
      }
    });
  }

  /* ── Vue Tableau ─────────────────────────────────────────────────────── */
  _renderTable(spools, thr) {
    const cols = [
      { key:"img",      label:"",           sortable:false },
      { key:"type",     label:"Type",       sortable:true  },
      { key:"material", label:"Matériau",   sortable:true  },
      { key:"brand",    label:"Marque",     sortable:true  },
      { key:"color",    label:"Couleur",    sortable:false },
      { key:"name",     label:"Nom",        sortable:true  },
      { key:"weight",   label:"Poids dispo.",sortable:true  },
      { key:"capacity", label:"Capacité",   sortable:true  },
      { key:"room",     label:"Lieu",       sortable:true  },
      { key:"updated",  label:"Màj",        sortable:true  },
    ];

    // Tri
    const sorted = [...spools].sort((a,b) => {
      let av = this._sortVal(a, this._sortCol);
      let bv = this._sortVal(b, this._sortCol);
      if (av < bv) return -this._sortDir;
      if (av > bv) return  this._sortDir;
      return 0;
    });

    this._domTable.innerHTML = "";
    if (!sorted.length) {
      this._domTable.innerHTML = `<div class="tt-empty">Aucune bobine trouvée</div>`;
      return;
    }

    const table = document.createElement("table");
    table.className = "tt-table";

    // En-tête
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    cols.forEach(col => {
      const th = document.createElement("th");
      th.dataset.col = col.key;
      if (col.sortable) {
        const isSorted = this._sortCol === col.key;
        th.className = isSorted ? "sorted" : "";
        th.innerHTML = `${col.label}<span class="tt-sort-icon">${isSorted ? (this._sortDir===1?"↑":"↓") : "↕"}</span>`;
        th.addEventListener("click", () => {
          if (this._sortCol === col.key) this._sortDir *= -1;
          else { this._sortCol = col.key; this._sortDir = 1; }
          this._renderGrid();
        });
      } else {
        th.textContent = col.label;
      }
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    // Corps
    const tbody = document.createElement("tbody");
    sorted.forEach(s => {
      const tr = document.createElement("tr");
      if (s.entity_id === this._selected) tr.classList.add("selected");
      if (s.weight < thr && s.weight >= 0) tr.classList.add("low-stock");

      // Image — photo officielle ou SVG bobine coloré (data URL)
      const tdImg = document.createElement("td");
      if (s.img_url) {
        const img = document.createElement("img");
        img.className = "tt-table-img"; img.src = s.img_url; img.loading = "lazy";
        img.onerror = () => { tdImg.innerHTML=""; tdImg.appendChild(this._tableColorDiv(s)); };
        tdImg.appendChild(img);
      } else {
        tdImg.appendChild(this._tableColorDiv(s));
      }
      tr.appendChild(tdImg);

      // Type (badge TigerTag / TigerTag+)
      const tdType = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "tt-tag " + (s.is_plus ? "tt-tag-plus" : "tt-tag-base");
      badge.textContent = s.is_plus ? "TigerTag+" : "TigerTag";
      tdType.appendChild(badge);
      tr.appendChild(tdType);

      // Matériau
      const tdMat = document.createElement("td");
      tdMat.textContent = s.material || "—";
      tr.appendChild(tdMat);

      // Marque
      const tdBrand = document.createElement("td");
      tdBrand.textContent = s.brand || "—";
      tr.appendChild(tdBrand);

      // Couleur — cercle mono ou dégradé conique si multicolore
      const tdColor = document.createElement("td");
      const colorDot = document.createElement("div");
      colorDot.style.cssText = "width:22px;height:22px;border-radius:50%;border:1px solid var(--divider-color)";
      colorDot.style.background = this._colorBackground(s);
      tdColor.appendChild(colorDot);
      tr.appendChild(tdColor);

      // Nom
      const tdName = document.createElement("td");
      tdName.style.fontWeight = "500";
      tdName.textContent = s.name || "—";
      tr.appendChild(tdName);

      // Poids avec mini barre
      const tdW = document.createElement("td");
      const pct = this._pct(s.weight, s.capacity);
      const bc  = this._barColor(s.weight, s.capacity);
      tdW.innerHTML = `${Math.round(s.weight)} g<div class="tt-table-bar"><div class="tt-table-bar-fill" style="width:${pct}%;background:${bc}"></div></div>`;
      tr.appendChild(tdW);

      // Capacité
      const tdCap = document.createElement("td");
      tdCap.textContent = s.capacity + " g";
      tr.appendChild(tdCap);

      // Lieu
      const tdRoom = document.createElement("td");
      if (s.ams_entity && this._hass?.states[s.ams_entity]) {
        const n = this._shortAmsName(s.ams_entity);
        tdRoom.innerHTML = `<span class="tt-tag tt-tag-ams">${this._esc(n)}</span>`;
      } else if (s.rack_name) {
        tdRoom.innerHTML = `<span class="tt-tag tt-tag-room">${this._esc(s.rack_name)}</span>`;
      } else {
        tdRoom.innerHTML = `<span style="color:var(--secondary-text-color);font-size:11px">—</span>`;
      }
      tr.appendChild(tdRoom);

      // Màj (last_update timestamp → durée relative)
      const tdUpd = document.createElement("td");
      tdUpd.style.color = "var(--secondary-text-color)";
      tdUpd.textContent = s.last_update ? this._relTime(s.last_update) : "—";
      tr.appendChild(tdUpd);

      tr.addEventListener("click", () => this._openPanel(s));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    this._domTable.appendChild(table);
  }

  _sortVal(s, col) {
    switch(col) {
      case "name":     return (s.name||"").toLowerCase();
      case "material": return (s.material||"").toLowerCase();
      case "brand":    return (s.brand||"").toLowerCase();
      case "weight":   return s.weight;
      case "capacity": return s.capacity;
      case "room":     return (s.rack_name||s.ams_entity||"").toLowerCase();
      case "type":     return s.is_plus ? 0 : 1;
      case "updated":  return s.last_update || 0;
      default:         return "";
    }
  }

  _relTime(ts) {
    const diff = Math.round((Date.now()/1000) - ts);
    if (diff < 60)   return diff + "s";
    if (diff < 3600) return Math.round(diff/60) + "m";
    if (diff < 86400)return Math.round(diff/3600) + "h";
    return Math.round(diff/86400) + "j";
  }

  _tableColorDiv(s) {
    const d = document.createElement("div");
    d.className = "tt-table-color";
    d.style.cssText = "width:24px;height:24px;border-radius:50%;border:1px solid var(--divider-color)";
    d.style.background = this._colorBackground(s);
    return d;
  }

  _colorBackground(s) {
    // Logique calquée sur l'app officielle TigerTag Studio Manager
    const aspects = [s.aspect1, s.aspect2].map(a => (a || "").toLowerCase());
    const isRainbow  = aspects.some(a => a.includes("rainbow")  || a.includes("multicolor"));
    const isTricolor = aspects.some(a => a.includes("tricolor") || a.includes("tri color") || a.includes("tricolore"));
    const isBicolor  = aspects.some(a => a.includes("bicolor")  || a.includes("bi color")  || a.includes("bicolore"));

    // Normalise une couleur #RRGGBBAA ou #RRGGBB → #RRGGBB valide pour CSS
    const norm = c => {
      const s2 = (c || "").trim().replace(/^#/, "");
      const h6  = s2.length === 8 ? s2.slice(0, 6) : s2;
      return /^[0-9a-fA-F]{6}$/.test(h6) ? "#" + h6 : null;
    };

    const cls       = (s.color_list || []).map(norm).filter(Boolean);
    const colorType = s.color_type || "";

    // Priorité 1 : online_color_list avec type explicite
    if (cls.length >= 2 && colorType === "conic_gradient") {
      // Boucle fermée : on répète la 1ère couleur à la fin pour un dégradé lisse
      return `conic-gradient(from 0deg, ${cls.join(", ")}, ${cls[0]})`;
    }
    if (cls.length >= 2 && colorType === "gradient") {
      return `linear-gradient(90deg, ${cls.join(", ")})`;
    }
    if (cls.length >= 2) {
      // Plusieurs couleurs sans type → dégradé conique avec parts égales
      const step = 360 / cls.length;
      const stops = cls.map((c, i) => `${c} ${i*step}deg ${(i+1)*step}deg`).join(", ");
      return `conic-gradient(${stops})`;
    }
    if (cls.length === 1) {
      return cls[0]; // online_color_list mono → priorité sur la couleur RFID
    }

    // Priorité 2 : aspects + couleurs RGB du chip RFID
    const c1 = s.color_hex  || null;
    const c2 = s.color_hex2 || null;
    const c3 = s.color_hex3 || null;
    const rfidColors = [c1, c2, c3].filter(Boolean);

    if (isRainbow && isTricolor) {
      const [r1="#ff4d4d", r2="#ffd93d", r3="#4da3ff"] = rfidColors;
      return `linear-gradient(90deg, ${r1} 0%, ${r2} 50%, ${r3} 100%)`;
    }
    if (isRainbow && isBicolor) {
      const [r1="#ff7a00", r2="#8a2be2"] = rfidColors;
      return `linear-gradient(90deg, ${r1} 0%, ${r2} 100%)`;
    }
    if (isRainbow) {
      if (rfidColors.length >= 2) return `linear-gradient(90deg, ${rfidColors.join(", ")})`;
      if (rfidColors.length === 1) return rfidColors[0];
      return "linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00cc00, #0000ff, #8b00ff)";
    }
    if (isTricolor) {
      const [t1="#cccccc", t2="#888888", t3] = rfidColors;
      const _t3 = t3 || t1;
      return `conic-gradient(${t1} 0deg 120deg, ${t2} 120deg 240deg, ${_t3} 240deg 360deg)`;
    }
    if (isBicolor) {
      const [b1="#cccccc", b2="#ffffff"] = rfidColors;
      return `conic-gradient(${b1} 0deg 180deg, ${b2} 180deg 360deg)`;
    }

    // Fallback : couleur principale
    return s.color_hex || "#888888";
  }

  _syncPanelWeight() {
    if (!this._selected || this._editWeight !== null) return;
    const s = this._allSpools().find(x => x.entity_id === this._selected);
    if (!s) return;
    const wval  = this._domPanel.querySelector("#tt-wval");
    const wbar  = this._domPanel.querySelector("#tt-wbar");
    const range = this._domPanel.querySelector("#tt-range");
    const winp  = this._domPanel.querySelector("#tt-winput");
    if (!wval) return;
    // Ligne du haut = poids NET
    wval.textContent = Math.round(s.weight) + " g";
    if (wbar) { wbar.style.width = this._pct(s.weight, s.capacity) + "%"; wbar.style.background = this._barColor(s.weight, s.capacity); }
    // Slider et input = poids BRUT (net + tare)
    const wBrut = Math.round(s.weight) + (s.tare || 0);
    if (range && range !== document.activeElement) range.value = wBrut;
    if (winp  && winp  !== document.activeElement) winp.value  = wBrut;
  }

  /* ── Carte bobine ────────────────────────────────────────────────────── */
  _spoolCard(s, thr) {
    const isSel = s.entity_id === this._selected;
    const isLow = s.weight < thr && s.weight >= 0;
    const pct   = this._pct(s.weight, s.capacity);
    const bc    = this._barColor(s.weight, s.capacity);

    const card = document.createElement("div");
    card.className = "tt-spool" + (isSel ? " selected" : "") + (isLow ? " low-stock" : "");
    card.dataset.eid = s.entity_id;
    card.dataset.uid = s.uid;   // nécessaire pour la mise à jour différentielle

    const imgWrap = document.createElement("div");
    imgWrap.className = "tt-spool-img-wrap";
    if (s.img_url) {
      const img = document.createElement("img");
      img.className = "tt-spool-img"; img.src = s.img_url; img.loading = "lazy";
      img.onerror = () => { imgWrap.removeChild(img); imgWrap.appendChild(this._colorDiv(s, "tt-spool-color")); };
      imgWrap.appendChild(img);
    } else {
      imgWrap.appendChild(this._colorDiv(s, "tt-spool-color"));
    }
    // Badge twin avec logo chaîne
    if (s.has_twin) {
      const dot = document.createElement("div");
      dot.className = "tt-twin-dot"; dot.title = "Twin Tag — 2 puces RFID";
      dot.innerHTML = LINK_SVG;
      imgWrap.appendChild(dot);
    }
    card.appendChild(imgWrap);

    // Emplacement AMS — nom court depuis hass.states si possible
    let amsLabel = null;
    if (s.ams_entity && this._hass && this._hass.states[s.ams_entity]) {
      const trayState = this._hass.states[s.ams_entity];
      amsLabel = trayState.attributes.friendly_name || s.ams_entity;
      amsLabel = amsLabel.replace(/emplacement\s*/i, "T").replace(/\s+/g, " ").trim();
    }

    // Badges en overlay sur l'image — ordre : emplacement → TigerTag/TigerTag+
    const locBadge = amsLabel
      ? `<span class="tt-tag tt-tag-ams" title="${this._esc(s.ams_entity || '')}">${this._esc(amsLabel)}</span>`
      : s.rack_name
        ? `<span class="tt-tag tt-tag-room">${this._esc(s.rack_name)}</span>`
        : "";
    const typeBadge = `<span class="tt-tag ${s.is_plus ? "tt-tag-plus" : "tt-tag-base"}">${s.is_plus ? "TigerTag+" : "TigerTag"}</span>`;
    const allBadges = (locBadge ? locBadge + typeBadge : typeBadge);

    const badgeOverlay = document.createElement("div");
    badgeOverlay.className = "tt-panel-badges";
    badgeOverlay.style.cssText = "position:absolute;bottom:8px;left:8px;top:auto;display:flex;gap:4px;flex-wrap:wrap";
    badgeOverlay.innerHTML = allBadges;
    imgWrap.appendChild(badgeOverlay);

    const body = document.createElement("div");
    body.className = "tt-spool-body";
    body.innerHTML = `
      <div class="tt-spool-name">${this._esc(s.name)}</div>
      <div class="tt-spool-sub">${this._esc(s.material)}${s.brand ? " · " + this._esc(s.brand) : ""}</div>
      <div class="tt-spool-foot"><span class="tt-spool-weight">${Math.round(s.weight)} g</span></div>
      <div class="tt-bar"><div class="tt-bar-fill" style="width:${pct}%;background:${bc}"></div></div>`;
    card.appendChild(body);
    card.addEventListener("click", () => this._openPanel(s));
    return card;
  }

  /* ── Panneau ─────────────────────────────────────────────────────────── */
  _openPanel(s) {
    this._selected   = s.entity_id;
    this._editWeight = null;
    this._domPanel.innerHTML = "";
    this._domPanel.appendChild(this._buildPanel(s));
    requestAnimationFrame(() => {
      this._domOverlay.classList.add("open");
      this._domPanel.classList.add("open");
    });
    this._domGrid.querySelectorAll(".tt-spool").forEach(el =>
      el.classList.toggle("selected", el.dataset.eid === s.entity_id));
  }

  _closePanel() {
    this._selected = null; this._editWeight = null;
    this._domOverlay.classList.remove("open");
    this._domPanel.classList.remove("open");
    this._domGrid.querySelectorAll(".tt-spool").forEach(el => el.classList.remove("selected"));
  }

  _buildPanel(s) {
    const frag = document.createDocumentFragment();
    const w    = s.weight;

    // ── Header (fermeture) ──────────────────────────────────────────────────
    const head = document.createElement("div");
    head.className = "tt-panel-head";
    const closeBtn = document.createElement("button");
    closeBtn.className = "tt-panel-close";
    closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    closeBtn.addEventListener("click", () => this._closePanel());
    const titleWrap = document.createElement("div");
    titleWrap.style.flex = "1";
    const titleEl = document.createElement("div");
    titleEl.className = "tt-panel-title";
    titleEl.textContent = s.name || "Bobine";
    const metaEl = document.createElement("div");
    metaEl.style.cssText = "font-size:10px;color:var(--secondary-text-color);margin-top:1px";
    const nameParts = [s.material, s.series, s.brand, s.diameter ? s.diameter+" mm" : null].filter(Boolean).join(" · ");
    metaEl.textContent = nameParts;
    titleWrap.appendChild(titleEl);
    titleWrap.appendChild(metaEl);
    head.appendChild(closeBtn);
    head.appendChild(titleWrap);
    frag.appendChild(head);

    // ── 1. Image / SVG ─────────────────────────────────────────────────────
    if (s.img_url) {
      const imgWrap = document.createElement("div");
      imgWrap.className = "tt-panel-img-wrap";
      imgWrap.style.cssText = "width:100%;max-height:180px;overflow:hidden";
      const img = document.createElement("img");
      img.src = s.img_url;
      img.style.cssText = "width:100%;max-height:180px;object-fit:contain;display:block";
      img.onerror = () => imgWrap.style.display = "none";
      imgWrap.appendChild(img);
      frag.appendChild(imgWrap);
    }



    // ── ZONE FIXE : image + tags ────────────────────────────────────────
    // ── 3. Tags (lieu, badges) ──────────────────────────────────────────────
    const tagBar = document.createElement("div");
    tagBar.className = "tt-panel-tags";
    // Lieu de stockage — affiché seulement si pas dans un AMS
    // (quand dans AMS, room = nom imprimante = redondant avec le tag AMS)
    if (s.rack_name && !s.ams_entity) {
      const roomTag = document.createElement("span");
      roomTag.className = "tt-tag tt-tag-room";
      roomTag.textContent = s.rack_name;
      tagBar.appendChild(roomTag);
    }
    // Emplacement AMS
    if (s.ams_entity && this._hass?.states[s.ams_entity]) {
      const amsTag = document.createElement("span");
      amsTag.className = "tt-tag tt-tag-ams";
      amsTag.textContent = this._shortAmsName(s.ams_entity);
      tagBar.appendChild(amsTag);
    }
    // Badges propriétés
    const badgeDefs = [
      [s.is_refill,   "Recharge",   "tt-tag-refill"],
      [s.is_recycled, "Recyclé",    "tt-tag-recycled"],
      [s.is_filled,   "Pré-chargé", "tt-tag-filled"],
      [s.is_plus,     this._esc(s.tag_type||"TigerTag+"), "tt-tag-plus"],
      [!s.is_plus,    this._esc(s.tag_type||"TigerTag"),  "tt-tag-base"],
    ];
    badgeDefs.forEach(([cond, label, cls]) => {
      if (!cond) return;
      const b = document.createElement("span");
      b.className = `tt-tag ${cls}`;
      b.innerHTML = label;
      tagBar.appendChild(b);
    });
    // Twin Tag = badge séparé avec icône lien (toujours en dernier)
    if (s.has_twin) {
      const twinB = document.createElement("span");
      twinB.className = "tt-tag tt-tag-plus";
      twinB.style.cssText = "display:flex;align-items:center;gap:3px;background:var(--tt-blue);color:#fff;border-color:var(--tt-blue)";
      twinB.innerHTML = `<span style="width:11px;height:11px;display:inline-flex">${LINK_SVG}</span>2×RFID`;
      tagBar.appendChild(twinB);
    }
    frag.appendChild(tagBar);

    // ── ZONE SCROLLABLE (split + températures + détails) ───────────────────
    const scrollZone = document.createElement("div");
    scrollZone.className = "tt-panel-scroll";

    // ── 4. Split Poids / Emplacement ───────────────────────────────────────
    const splitWrap = document.createElement("div");
    splitWrap.className = "tt-panel-split";
    splitWrap.style.cssText = "overflow:hidden";

    // Toggle Poids / Emplacement
    const toggleRow = document.createElement("div");
    toggleRow.className = "tt-tabs";
    const tabPoids = document.createElement("div");
    tabPoids.className = "tt-tab active"; tabPoids.textContent = "⚖ Poids";
    const tabEmpl = document.createElement("div");
    tabEmpl.className = "tt-tab"; tabEmpl.textContent = "📍 Emplacement";
    toggleRow.appendChild(tabPoids); toggleRow.appendChild(tabEmpl);
    splitWrap.appendChild(toggleRow);

    // Onglet Poids
    const bodyPoids = document.createElement("div");
    bodyPoids.className = "tt-tab-content active";
    bodyPoids.style.cssText = "padding:12px;overflow:hidden";

    // Onglet Emplacement
    const bodyEmpl = document.createElement("div");
    bodyEmpl.className = "tt-tab-content";

    const switchTab = (i) => {
      [tabPoids, tabEmpl].forEach((t,j) => t.classList.toggle("active", i===j));
      [bodyPoids, bodyEmpl].forEach((b,j) => b.classList.toggle("active", i===j));
    };
    tabPoids.addEventListener("click", () => switchTab(0));
    tabEmpl.addEventListener("click",  () => switchTab(1));

    // Contenu onglet Poids
    const pct = this._pct(w, s.capacity);
    const bc  = this._barColor(w, s.capacity);
    const maxBrut = s.capacity + s.tare;
    const wBrut   = Math.round(w) + s.tare;

    const wBox = document.createElement("div");
    wBox.innerHTML = `
      <div class="tt-weight-top">
        <span class="tt-weight-val" id="tt-wval">${Math.round(w)} g</span>
        <span class="tt-weight-cap">/ ${s.capacity} g</span>
      </div>
      <div class="tt-w-bar"><div class="tt-w-bar-fill" id="tt-wbar" style="width:${pct}%;background:${bc}"></div></div>
      <input type="range" class="tt-range" id="tt-range" min="${s.tare}" max="${maxBrut}" step="1" value="${wBrut}" />
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--secondary-text-color);margin-bottom:8px">
        <span id="tt-lbl-min">${s.tare} g (tare)</span><span id="tt-lbl-max">${maxBrut} g (max balance)</span>
      </div>
      <div class="tt-weight-row2">
        <input type="number" class="tt-w-input" id="tt-winput" min="${s.tare}" max="${maxBrut}" step="1" value="${wBrut}" />
        <button class="tt-btn-save" id="tt-save">Enregistrer</button>
      </div>
      <div class="tt-w-note" style="color:var(--tt-green);background:color-mix(in srgb,var(--tt-green) 8%,transparent);padding:5px 8px;border-radius:5px">
        <span id="tt-w-brut-val">${wBrut}</span> g − tare <span id="tt-w-tare-val">${s.tare}</span> g = <strong id="tt-w-net-val">${Math.round(w)}</strong> g net
      </div>
      ${s.has_twin?`<div class="tt-w-note" style="color:var(--tt-blue);display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;display:inline-flex">${LINK_SVG}</span>Twin Tag — les deux puces seront mises à jour</div>`:""}
      <div class="tt-tare-row">
        <span class="tt-tare-label">Tare (g) :</span>
        <input type="number" class="tt-tare-input" id="tt-tare" min="0" max="2000" step="1"
          value="${s.tare_custom !== null ? s.tare_custom : s.tare_official}"
          placeholder="${s.tare_official || 0}" />
        <button class="tt-btn-tare" id="tt-tare-save">Appliquer</button>
      </div>
      <div class="tt-w-note">Tare officielle TigerTag : ${s.tare_official || 0} g — tu peux l'ajuster (masterspool différent)</div>`;

    bodyPoids.appendChild(wBox);

    // Listeners poids
    const rng_   = wBox.querySelector("#tt-range");
    const winp_  = wBox.querySelector("#tt-winput");
    const saveB_ = wBox.querySelector("#tt-save");
    const tareI_ = wBox.querySelector("#tt-tare");
    const tSave_ = wBox.querySelector("#tt-tare-save");
    const wval_  = wBox.querySelector("#tt-wval");
    const wbar_  = wBox.querySelector("#tt-wbar");

    const updateDisplay = (brut, forceInput = false) => {
      const currentTare = s.tare;
      const currentMax  = s.capacity + currentTare;
      const b   = Math.round(Math.max(currentTare, Math.min(currentMax, Number(brut))));
      const net = Math.max(0, b - currentTare);
      this._editWeight = net;
      if (wval_) wval_.textContent = net + " g";
      if (wbar_) { wbar_.style.width = this._pct(net,s.capacity)+"%"; wbar_.style.background = this._barColor(net,s.capacity); }
      if (rng_ && rng_ !== document.activeElement) {
        rng_.min = currentTare; rng_.max = currentMax; rng_.value = b;
      }
      if (forceInput && winp_) {
        winp_.min = currentTare; winp_.max = currentMax; winp_.value = b;
      }
      const labMin = wBox.querySelector("#tt-lbl-min");
      const labMax = wBox.querySelector("#tt-lbl-max");
      if (labMin) labMin.textContent = currentTare + " g (tare)";
      if (labMax) labMax.textContent = currentMax + " g (max balance)";
      const brutVal = wBox.querySelector("#tt-w-brut-val");
      const netVal  = wBox.querySelector("#tt-w-net-val");
      const tareVal = wBox.querySelector("#tt-w-tare-val");
      if (brutVal) brutVal.textContent = b;
      if (netVal)  netVal.textContent  = net;
      if (tareVal) tareVal.textContent = currentTare;
      return { b, net };
    };

    if (rng_) { rng_.min = s.tare; rng_.max = s.capacity + s.tare; rng_.value = wBrut; }

    if (rng_) rng_.addEventListener("input", e => {
      const b = Number(e.target.value);
      if (winp_ && winp_ !== document.activeElement) winp_.value = b;
      updateDisplay(b);
    });

    if (winp_) {
      winp_.addEventListener("input", e => {
        const v = e.target.value;
        const n = Number(v);
        if (!isNaN(n) && v !== "" && v !== "-") {
          updateDisplay(n);
          if (rng_ && rng_ !== document.activeElement) {
            rng_.value = Math.max(s.tare, Math.min(s.capacity + s.tare, n));
          }
        }
      });
      winp_.addEventListener("blur", e => {
        const currentTare = s.tare;
        const currentMax  = s.capacity + currentTare;
        const n = Number(e.target.value);
        const clamped = isNaN(n) ? currentTare : Math.max(currentTare, Math.min(currentMax, n));
        winp_.value = clamped;
        updateDisplay(clamped, false);
        if (rng_) { rng_.min = currentTare; rng_.max = currentMax; rng_.value = clamped; }
      });
    }

    if (saveB_) saveB_.addEventListener("click", async () => {
      const currentTare = s.tare;
      const currentMax  = s.capacity + currentTare;
      const brutRaw  = winp_ ? Number(winp_.value) : (s.weight + currentTare);
      const brutSafe = Math.max(currentTare, Math.min(currentMax, isNaN(brutRaw) ? currentTare : brutRaw));
      const net = Math.max(0, brutSafe - currentTare);
      updateDisplay(brutSafe, false);
      if (!this._hass) return;
      saveB_.disabled = true; saveB_.textContent = "Sauvegarde…";
      try {
        await this._hass.callService("tigertag", "update_spool_weight", {
          uid: s.uid, weight: net, container_weight: 0,
        });
        s.weight = net;
      } catch(e) { console.error("[TigerTagCard] saveWeight:", e); }
      finally { saveB_.disabled = false; saveB_.textContent = "Enregistrer"; }
    });

    const saveTareAndResync = async () => {
      const v = parseInt(tareI_.value);
      if (isNaN(v)) return;
      tSave_.textContent = "…";
      try {
        await this._hass.callService("tigertag", "set_spool_tare", { uid: s.uid, tare: v });
        s.tare = v; s.tare_custom = v;
        const brutCurrent = winp_ ? Number(winp_.value) : (this._editWeight + v);
        updateDisplay(brutCurrent, true);
        if (rng_) { rng_.min = v; rng_.max = s.capacity + v; rng_.value = brutCurrent; }
        tSave_.textContent = "Appliquer ✓";
        setTimeout(() => { tSave_.textContent = "Appliquer"; }, 1500);
      } catch(e) { console.warn("[TigerTagCard] saveTare:", e); tSave_.textContent = "Appliquer"; }
    };
    if (tSave_) tSave_.addEventListener("click", saveTareAndResync);

    splitWrap.appendChild(bodyPoids);

    // Contenu onglet Emplacement
    this._buildEmplacementTab(bodyEmpl, s);
    splitWrap.appendChild(bodyEmpl);
    scrollZone.appendChild(splitWrap);

    // ── 5. Paramètres d'impression ──────────────────────────────────────────
    if (s.nozzle_min || s.nozzle_max || s.bed_min || s.bed_max || s.dry_temp) {
      const tSec = document.createElement("div");
      tSec.style.padding = "12px 12px 12px";
      tSec.innerHTML = `<div class="tt-section-label">Paramètres d'impression</div>
        <div class="tt-temp-grid">
          ${(s.nozzle_min||s.nozzle_max)?`<div class="tt-temp-chip"><div class="tt-temp-lbl">Buse</div><div class="tt-temp-val">${s.nozzle_min||"?"}–${s.nozzle_max||"?"} °C</div></div>`:""}
          ${(s.bed_min||s.bed_max)?`<div class="tt-temp-chip"><div class="tt-temp-lbl">Plateau</div><div class="tt-temp-val">${s.bed_min||"?"}–${s.bed_max||"?"} °C</div></div>`:""}
          ${s.dry_temp?`<div class="tt-temp-chip"><div class="tt-temp-lbl">Séchage</div><div class="tt-temp-val">${s.dry_temp} °C</div></div>`:""}
          ${s.dry_time?`<div class="tt-temp-chip"><div class="tt-temp-lbl">Durée séchage</div><div class="tt-temp-val">${s.dry_time} h</div></div>`:""}
        </div>`;
      scrollZone.appendChild(tSec);
    }

    // ── 6. Détails ─────────────────────────────────────────────────────────
    const detSec = document.createElement("div");
    detSec.style.padding = "0 12px 12px";
    const detItems = [
      ["UID",      s.uid],
      ["SKU",      s.sku],
      ["Barcode",  s.barcode],
      ["Diamètre", s.diameter ? s.diameter+" mm" : null],
      ["Série",    s.series],
    ].filter(([,v]) => v);

    if (detItems.length) {
      detSec.innerHTML = `<div class="tt-section-label">Détails</div>`;
      const dl = document.createElement("dl");
      dl.style.cssText = "display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:11px;margin:0";
      detItems.forEach(([label, val]) => {
        const dt = document.createElement("dt");
        dt.style.cssText = "color:var(--secondary-text-color);white-space:nowrap";
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.style.cssText = "margin:0;color:var(--primary-text-color);word-break:break-all";
        dd.textContent = val;
        dl.appendChild(dt); dl.appendChild(dd);
      });
      detSec.appendChild(dl);
    }

    // Liens
    const links = [
      ["YouTube", s.link_youtube],
      ["MSDS",    s.link_msds],
      ["TDS",     s.link_tds],
      ["RoHS",    s.link_rohs],
      ["REACH",   s.link_reach],
      ["Food",    s.link_food],
    ].filter(([,v]) => v && v !== "--");

    if (links.length) {
      const linkRow = document.createElement("div");
      linkRow.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-top:8px";
      links.forEach(([label, url]) => {
        const a = document.createElement("a");
        a.href = url; a.target = "_blank";
        a.style.cssText = "font-size:10px;padding:2px 7px;border-radius:4px;border:0.5px solid var(--divider-color);color:var(--tt-green);text-decoration:none";
        a.textContent = label;
        linkRow.appendChild(a);
      });
      detSec.appendChild(linkRow);
    }

    if (detItems.length || links.length) scrollZone.appendChild(detSec);

    frag.appendChild(scrollZone);
    return frag;
  }

  /* ── Actions ─────────────────────────────────────────────────────────── */
  async _saveWeight(s, btn) {
    const w = this._editWeight;
    if (w === null || !this._hass) return;
    if (btn) { btn.disabled = true; btn.textContent = "Sauvegarde…"; }
    try {
      await this._hass.callService("tigertag", "update_spool_weight", {
        uid: s.uid, weight: w, container_weight: s.tare || 0,
      });
      this._editWeight = null;
    } catch(e) { console.error("[TigerTagCard] saveWeight:", e); }
    finally { if (btn) { btn.disabled = false; btn.textContent = "Enregistrer"; } }
  }

  async _saveTare(s, input, btn) {
    const v = parseInt(input.value);
    if (isNaN(v) || !this._hass) return;
    btn.textContent = "…";
    try {
      await this._hass.callService("tigertag", "set_spool_tare", {
        uid: s.uid, tare: v,
      });
      // Mise à jour immédiate de l'objet spool en mémoire
      // pour que _saveWeight utilise la nouvelle tare sans avoir à
      // fermer/rouvrir le panneau
      s.tare         = v;
      s.tare_custom  = v;
    } catch(e) { console.warn("[TigerTagCard] saveTare:", e); }
    finally { btn.textContent = "Appliquer ✓"; setTimeout(() => { btn.textContent = "Appliquer"; }, 1500); }
  }

  async _setRack(s, rackId, level, position) {
    if (!this._hass) return;
    try {
      const data = { uid: s.uid, rack_id: rackId || null };
      if (level    !== undefined && level    !== null) data.level    = level;
      if (position !== undefined && position !== null) data.position = position;
      await this._hass.callService("tigertag", "set_spool_rack", data);

      // ── Éjecter l'occupant actuel du slot si conflit ──────────────────
      if (rackId && level !== null && position !== null) {
        const occupant = this._getSlotOccupant(rackId, level, position, s.uid);
        if (occupant) {
          // Retirer l'occupant localement (le service Python le fait aussi côté Firestore)
          occupant.rack_id       = null;
          occupant.rack_name     = null;
          occupant.rack_level    = null;
          occupant.rack_position = null;
          this._refreshSpoolCard(occupant);
          // Si le twin de l'occupant est aussi dans la grille
          if (occupant.twin_uid) {
            const twin = this._allSpools().find(x => x.uid === occupant.twin_uid);
            if (twin) {
              twin.rack_id = null; twin.rack_name = null;
              twin.rack_level = null; twin.rack_position = null;
              this._refreshSpoolCard(twin);
            }
          }
        }
      }

      // ── Mettre à jour la bobine courante ──────────────────────────────
      s.rack_id       = rackId || null;
      s.rack_name     = rackId ? this._getRackName(rackId) : null;
      s.rack_level    = level    ?? null;
      s.rack_position = position ?? null;
      // Assigner rack → effacer AMS (règle métier)
      if (rackId && s.ams_entity) s.ams_entity = null;
      // Propagation twin
      if (s.twin_uid) {
        const twin = this._allSpools().find(x => x.uid === s.twin_uid);
        if (twin) {
          twin.rack_id = s.rack_id; twin.rack_name = s.rack_name;
          twin.rack_level = s.rack_level; twin.rack_position = s.rack_position;
          twin.ams_entity = s.ams_entity;
          this._refreshSpoolCard(twin);
        }
      }

      this._refreshPanelTags(s);
      this._refreshSpoolCard(s);
    } catch(e) { console.error("[TigerTagCard] setRack:", e); }
  }

  async _setAms(s, entityId) {
    const newAms = entityId === "—" ? null : entityId;
    if (!this._hass) return;

    if (newAms) {
      const data = { uid: s.uid, tray_entity_id: newAms };
      if (this._amsState?.profile?.tray_info_idx) {
        data.tray_info_idx = this._amsState.profile.tray_info_idx;
        data.profile_name  = this._amsState.profile.name;
      }
      try {
        // Éjecter l'occupant actuel de ce slot AMS
        const amsOccupant = this._allSpools().find(
          sp => sp.ams_entity === newAms && sp.uid !== s.uid && sp.uid !== s.twin_uid
        );
        if (amsOccupant) {
          amsOccupant.ams_entity = null;
          this._refreshSpoolCard(amsOccupant);
          if (amsOccupant.twin_uid) {
            const ot = this._allSpools().find(x => x.uid === amsOccupant.twin_uid);
            if (ot) { ot.ams_entity = null; this._refreshSpoolCard(ot); }
          }
        }

        await this._hass.callService("tigertag", "set_bambu_ams_filament", data);
        s.ams_entity = newAms;

        // Assigner AMS → effacer rack (règle métier)
        if (s.rack_id) {
          await this._hass.callService("tigertag", "set_spool_rack", { uid: s.uid, rack_id: null });
          s.rack_id = null; s.rack_name = null;
          s.rack_level = null; s.rack_position = null;
        }

        // Propagation twin
        if (s.twin_uid) {
          const twin = this._allSpools().find(x => x.uid === s.twin_uid);
          if (twin) {
            twin.ams_entity = s.ams_entity;
            twin.rack_id = null; twin.rack_name = null;
            twin.rack_level = null; twin.rack_position = null;
            this._refreshSpoolCard(twin);
          }
        }

        this._refreshPanelTags(s);
        this._refreshSpoolCard(s);
        this._refreshEmplacementTab(s);
      } catch(e) { console.error("[TigerTagCard] setAms:", e); }

    } else {
      try {
        await this._hass.callService("tigertag", "set_spool_rack", { uid: s.uid, rack_id: null });
        s.ams_entity = null;
        if (s.twin_uid) {
          const twin = this._allSpools().find(x => x.uid === s.twin_uid);
          if (twin) { twin.ams_entity = null; this._refreshSpoolCard(twin); }
        }
        this._refreshPanelTags(s);
        this._refreshSpoolCard(s);
        this._refreshEmplacementTab(s);
      } catch(e) { console.error("[TigerTagCard] removeAms:", e); }
    }
  }

  _refreshEmplacementTab(s) {
    const panel = this._domPanel;
    if (!panel) return;

    panel.querySelectorAll("[data-slot-eid]").forEach(slot => {
      const eid = slot.dataset.slotEid;
      if (eid !== s.ams_entity) return;

      // Bordure verte
      slot.style.border = "2px solid var(--tt-green)";

      // Vider et reconstruire le contenu du slot avec les données TigerTag
      slot.innerHTML = "";

      const pct = Math.round(this._pct(s.weight, s.capacity));
      const col = s.color_hex || "#888888";

      // Barre de remplissage
      const fill = document.createElement("div");
      fill.style.cssText = `position:absolute;bottom:0;width:100%;height:${pct}%;background:${col}22`;
      slot.appendChild(fill);

      // Pourcentage
      const pctLbl = document.createElement("div");
      pctLbl.style.cssText = `position:absolute;bottom:2px;width:100%;text-align:center;font-size:9px;font-weight:500;color:${col}`;
      pctLbl.textContent = pct + "%";
      slot.appendChild(pctLbl);

      // Dot couleur
      const dot = document.createElement("div");
      dot.style.cssText = `position:absolute;top:5px;left:50%;transform:translateX(-50%);
        width:11px;height:11px;border-radius:50%;background:${col};
        border:0.5px solid var(--card-background-color)`;
      slot.appendChild(dot);

      // Le slot (bar-wrap) est children[1] du col
      // Structure col.children : [0]=lbl(T4), [1]=slot(bar-wrap), [2]=name, [3]=badge
      const colEl = slot.parentElement;
      if (colEl) {
        const nameLbl = colEl.children[2];
        const badge   = colEl.children[3];
        if (nameLbl) nameLbl.textContent = s.name || "—";
        if (badge) {
          badge.style.background = s.is_plus ? "#fff3e0" : "#e8f5e9";
          badge.style.color      = s.is_plus ? "#bf360c" : "#1b5e20";
          badge.textContent      = s.is_plus ? "TigerTag+" : "TigerTag";
        }
      }
    });
  }

  // Retourne la bobine occupant le slot (rackId, level, position), ou null
  // Exclut la bobine s elle-même (et son twin) pour éviter les faux positifs
  _getSlotOccupant(rackId, level, position, excludeUid = null) {
    if (!rackId || level === null || position === null) return null;
    const spools = this._allSpools();
    for (const sp of spools) {
      if (sp.rack_id !== rackId) continue;
      if (sp.rack_level !== level || sp.rack_position !== position) continue;
      if (excludeUid && (sp.uid === excludeUid || sp.uid === this._getTwinUid(excludeUid))) continue;
      return sp;
    }
    return null;
  }

  // Retourne le twin_tag_uid d'une bobine depuis _allSpools
  _getTwinUid(uid) {
    const sp = this._allSpools().find(s => s.uid === uid);
    return sp?.twin_uid || null;
  }

  // Force la mise à jour de la carte grille d'une bobine spécifique
  // sans recréer toute la grille — appelé après une action locale (_setRack, _setAms)
  _refreshSpoolCard(s) {
    if (!this._domGrid) return;
    const el = this._domGrid.querySelector(`[data-uid="${s.uid}"]`);
    if (!el) return;
    const thr     = 250;
    const newEl   = this._spoolCard(s, thr);
    const newHash = s.uid + ":" + (s.weight||0) + ":" + (s.rack_id||"") + ":" + (s.rack_level??"") + ":" + (s.rack_position??"") + ":" + (s.ams_entity||"");
    newEl.dataset.uid      = s.uid;
    newEl.dataset.cardHash = newHash;
    el.dataset.cardHash    = newHash; // mettre à jour le hash de l'ancien aussi
    this._domGrid.replaceChild(newEl, el);
  }

  _refreshPanelTags(s) {
    const tagBar = this._domPanel?.querySelector(".tt-panel-tags");
    if (!tagBar) return;
    tagBar.innerHTML = "";
    if (s.rack_name && !s.ams_entity) {
      const r = document.createElement("span");
      r.className = "tt-tag tt-tag-room"; r.textContent = s.rack_name;
      tagBar.appendChild(r);
    }
    if (s.ams_entity && this._hass?.states[s.ams_entity]) {
      const a = document.createElement("span");
      a.className = "tt-tag tt-tag-ams";
      a.textContent = this._shortAmsName(s.ams_entity);
      tagBar.appendChild(a);
    }
    const t = document.createElement("span");
    t.className = `tt-tag ${s.is_plus ? "tt-tag-plus" : "tt-tag-base"}`;
    t.textContent = s.is_plus ? (s.tag_type || "TigerTag+") : (s.tag_type || "TigerTag");
    tagBar.appendChild(t);
    if (s.has_twin) {
      const tw = document.createElement("span");
      tw.className = "tt-tag tt-tag-plus";
      tw.style.cssText = "display:flex;align-items:center;gap:3px;background:var(--tt-blue);color:#fff;border-color:var(--tt-blue)";
      tw.innerHTML = `<span style="width:11px;height:11px;display:inline-flex">${LINK_SVG}</span>2×RFID`;
      tagBar.appendChild(tw);
    }
  }

  async _pushToAms(s) {
    if (!s.ams_entity || !this._hass) return;
    try {
      await this._hass.callService("tigertag", "set_bambu_ams_filament", {
        uid: s.uid, tray_entity_id: s.ams_entity,
      });
    } catch(e) { console.error("[TigerTagCard] pushToAms:", e); }
  }

  /* ── Utils ───────────────────────────────────────────────────────────── */
  /* ── Onglet Emplacement ─────────────────────────────────────────────────── */
  _buildEmplacementTab(container, s) {
    container.style.padding       = "12px";
    container.style.flexDirection = "column";
    container.style.gap           = "14px";

    // État interne de l'onglet — reset à chaque ouverture
    this._amsState = { tray: null, profile: null, uid: s.uid, spool: s };
    this._rackState = { rack_id: s.rack_id || null, level: s.rack_level ?? null, position: s.rack_position ?? null };

    // ══════════════════════════════════════════════════════
    // SECTION RACK
    // ══════════════════════════════════════════════════════
    const racks       = this._getRacks();
    const racksSorted = Object.values(racks).sort((a,b) => (a.order||0) - (b.order||0));

    const rackSec = document.createElement("div");
    rackSec.id = "tt-rack-sec";

    const rackLabel = document.createElement("div");
    rackLabel.className = "tt-section-label";
    rackLabel.textContent = "Rack de stockage";
    rackSec.appendChild(rackLabel);

    // Sélecteur du rack
    const rackSel = document.createElement("select");
    rackSel.className = "tt-loc-sel";
    rackSel.style.width = "100%";
    rackSel.innerHTML = `<option value="">— Non placée —</option>` +
      racksSorted.map(r =>
        `<option value="${r.id}"${s.rack_id === r.id ? " selected" : ""}>${this._esc(r.name)}</option>`
      ).join("");
    rackSec.appendChild(rackSel);

    // Sélecteurs étage + position (visibles seulement si rack sélectionné)
    const rackPosRow = document.createElement("div");
    rackPosRow.style.cssText = "display:flex;gap:8px;margin-top:8px";
    rackPosRow.id = "tt-rack-pos-row";

    // Sélecteur étage
    const levelWrap = document.createElement("div");
    levelWrap.style.flex = "1";
    const levelLabel = document.createElement("div");
    levelLabel.style.cssText = "font-size:10px;color:var(--secondary-text-color);margin-bottom:3px";
    levelLabel.textContent = "Niveau";
    const levelSel = document.createElement("select");
    levelSel.className = "tt-loc-sel";
    levelSel.style.width = "100%";
    levelSel.id = "tt-rack-level";
    levelWrap.appendChild(levelLabel);
    levelWrap.appendChild(levelSel);

    // Sélecteur position
    const posWrap = document.createElement("div");
    posWrap.style.flex = "1";
    const posLabel = document.createElement("div");
    posLabel.style.cssText = "font-size:10px;color:var(--secondary-text-color);margin-bottom:3px";
    posLabel.textContent = "Position";
    const posSel = document.createElement("select");
    posSel.className = "tt-loc-sel";
    posSel.style.width = "100%";
    posSel.id = "tt-rack-position";
    posWrap.appendChild(posLabel);
    posWrap.appendChild(posSel);

    rackPosRow.appendChild(levelWrap);
    rackPosRow.appendChild(posWrap);
    rackSec.appendChild(rackPosRow);

    // Déclaré ici pour être accessible depuis fillRackPos (avant la def du bouton)
    let _refreshAssignBtn = () => {};

    // Remplit les sélecteurs étage/position selon le rack choisi
    // Avec indicateur vert (libre) / rouge (occupé) par position
    const fillRackPos = (rackId) => {
      const rack = racks[rackId];
      levelSel.innerHTML = "";
      posSel.innerHTML   = "";

      if (!rack) {
        rackPosRow.style.display = "none";
        this._rackState.level    = null;
        this._rackState.position = null;
        return;
      }

      rackPosRow.style.display = "flex";

      // Construire un index d'occupation : {level: {position: uid}}
      const occupied = {};
      for (const sp of this._allSpools()) {
        if (sp.rack_id !== rackId) continue;
        if (sp.uid === s.uid || sp.uid === s.twin_uid) continue; // ignorer soi-même
        const lv = sp.rack_level;
        const po = sp.rack_position;
        if (lv === null || lv === undefined || po === null || po === undefined) continue;
        if (!occupied[lv]) occupied[lv] = {};
        occupied[lv][po] = sp.uid;
      }

      // Niveau  : lettre  (0 → "A", 1 → "B" …)
      // Position : chiffre (0 → "1", 1 → "2" …)
      const levelLabel_human = i => String.fromCharCode(65 + i); // 0→A, 1→B …
      const posLabel_human   = i => String(i + 1);               // 0→1, 1→2 …

      // Slot actuel : mis à jour après chaque assignation via s (objet muté)
      const getCurLevel = () => (s.rack_id === rackId) ? s.rack_level    : null;
      const getCurPos   = () => (s.rack_id === rackId) ? s.rack_position : null;

      const updatePosSel = (level) => {
        posSel.innerHTML = "";
        const nbPos = rack.position_count ?? 5;
        for (let i = 0; i < nbPos; i++) {
          const isCurrent  = (level === getCurLevel() && i === getCurPos()); // slot actuel de cette bobine
          const isOccupied = !!(occupied[level] && occupied[level][i] !== undefined);
          // Rouge si slot actuel OU occupé par une autre bobine
          const dot = (isCurrent || isOccupied) ? "🔴" : "🟢";
          const o   = document.createElement("option");
          o.value   = i;
          o.textContent = `${dot} ${posLabel_human(i)}`;
          if (isCurrent) o.selected = true;
          posSel.appendChild(o);
        }
        this._rackState.position = parseInt(posSel.value);
        if (typeof _refreshAssignBtn === "function") _refreshAssignBtn();
      };

      // Niveaux : lettres A, B, C…
      const nbLevels = rack.level_count ?? 1;
      for (let i = 0; i < nbLevels; i++) {
        const o = document.createElement("option");
        o.value = i;
        o.textContent = levelLabel_human(i);  // 0→A, 1→B …
        if (s.rack_level === i && s.rack_id === rackId) o.selected = true;
        levelSel.appendChild(o);
      }

      // Init positions selon niveau sélectionné
      const initLevel = s.rack_id === rackId && s.rack_level !== null ? s.rack_level : parseInt(levelSel.value);
      updatePosSel(initLevel);

      // Recalculer les positions quand le niveau change
      levelSel.addEventListener("change", e => {
        const lv = parseInt(e.target.value);
        this._rackState.level = lv;
        updatePosSel(lv);
      });

      // Mettre à jour l'état local
      this._rackState.level    = parseInt(levelSel.value);
      this._rackState.position = parseInt(posSel.value);
    };

    // Init avec le rack actuel
    const initRackId = s.rack_id || "";
    fillRackPos(initRackId);
    if (!initRackId) rackPosRow.style.display = "none";
    // _refreshAssignBtn sera défini juste après — on l'appellera via un timer micro
    // pour être sûr que la closure est prête (ordre de déclaration JS)

    // Listeners rack
    rackSel.addEventListener("change", e => {
      const rid = e.target.value || null;
      this._rackState.rack_id = rid;
      fillRackPos(rid || "");
      // Rack sélectionné → cacher AMS
      _toggleAmsSec(!rid);
    });

    // Note : le listener levelSel est géré dans fillRackPos (met à jour posSel dynamiquement)
    posSel.addEventListener("change", e => {
      this._rackState.position = e.target.value !== "" ? parseInt(e.target.value) : null;
    });

    container.appendChild(rackSec);

    // ══════════════════════════════════════════════════════
    // SECTION AMS
    // ══════════════════════════════════════════════════════
    const amsSec = document.createElement("div");
    amsSec.id = "tt-ams-sec";

    const toggleAmsSec = (show) => {
      amsSec.style.display    = show ? "" : "none";
      profileSec.style.display = show ? "" : "none";
    };

    const trays = this._getBambuTrayEntities();

    if (!trays.length) {
      const noAms = document.createElement("div");
      noAms.style.cssText = "font-size:12px;color:var(--secondary-text-color)";
      noAms.textContent = "Aucune imprimante Bambu détectée";
      amsSec.appendChild(noAms);
    } else {
      const amsLabel = document.createElement("div");
      amsLabel.className = "tt-section-label";
      amsLabel.textContent = "Emplacement AMS / Imprimante";
      amsSec.appendChild(amsLabel);

      // ── Étape 1 : sélecteur imprimante ──
      const printers    = [...new Set(trays.map(e => this._printerName(e.entity_id)))];
      const initPrinter = s.ams_entity ? this._printerName(s.ams_entity) : printers[0];

      const pSel = document.createElement("select");
      pSel.className = "tt-loc-sel";
      pSel.style.width = "100%";
      printers.forEach(p => {
        const o = document.createElement("option");
        o.value = p; o.textContent = p;
        if (p === initPrinter) o.selected = true;
        pSel.appendChild(o);
      });
      amsSec.appendChild(pSel);

      // ── Étape 2 : sélecteur AMS / Externe (caché jusqu'à imprimante choisie) ──
      const amsGroupRow = document.createElement("div");
      amsGroupRow.id = "tt-ams-group-row";
      amsGroupRow.style.marginTop = "8px";

      const getAmsGroups = (printer) => {
        const groups = {};
        trays.filter(e => this._printerName(e.entity_id) === printer).forEach(e => {
          const m = e.entity_id.match(/ams_(\d+)/i);
          const g = m ? `AMS ${m[1]}` : "Externe";
          if (!groups[g]) groups[g] = [];
          groups[g].push(e);
        });
        return groups;
      };

      const amsSel = document.createElement("select");
      amsSel.className = "tt-loc-sel";
      amsSel.style.width = "100%";
      amsSel.id = "tt-ams-group-sel";

      const fillAmsSel = (printer) => {
        amsSel.innerHTML = "";
        const groups = getAmsGroups(printer);
        Object.keys(groups).forEach(g => {
          const o = document.createElement("option");
          o.value = g; o.textContent = g;
          amsSel.appendChild(o);
        });
        if (s.ams_entity) {
          const m = s.ams_entity.match(/ams_(\d+)/i);
          const sg = m ? `AMS ${m[1]}` : "Externe";
          amsSel.value = sg;
        }
      };
      fillAmsSel(initPrinter);
      amsGroupRow.appendChild(amsSel);
      amsSec.appendChild(amsGroupRow);

      // ── Étape 3 : grille des slots (cachée jusqu'à AMS choisi) ──
      const slotsDiv = document.createElement("div");
      slotsDiv.id = "tt-ams-slots";
      slotsDiv.style.marginTop = "10px";

      const renderSlots = (printer, amsGroup) => {
        slotsDiv.innerHTML = "";
        const groups = getAmsGroups(printer);
        const items  = groups[amsGroup] || [];
        const isExt  = amsGroup === "Externe";

        const grid = document.createElement("div");
        const colCount = isExt ? 1 : 4;
        grid.style.cssText = `display:grid;grid-template-columns:repeat(${colCount},1fr);gap:6px`;
        if (isExt) { grid.style.maxWidth = "25%"; grid.style.margin = "0 auto"; }

        items.forEach(e => {
          const a        = e.attributes;
          const isCurrent = e.entity_id === s.ams_entity;
          const isActive  = a.active;
          const tagUid    = (a.tag_uid || "").replace(/0/g,"");
          const hasRfid   = tagUid.length > 0;
          const tiger     = this._allSpools().find(sp => sp.ams_entity === e.entity_id);
          const hasTiger  = !!tiger;
          const remain    = a.remain >= 0 ? a.remain : null;

          let dotColor  = "var(--divider-color)";
          let fillColor = "transparent";
          if (hasTiger) {
            dotColor  = tiger.color_hex || "#888";
            fillColor = dotColor + "22";
          } else if (hasRfid) {
            let rawCol = a.tray_color || (a.cols && a.cols[0]) || "";
            rawCol = rawCol.replace(/^#/, "").slice(0, 6);
            dotColor  = rawCol.length === 6 ? "#" + rawCol : "#888888";
            fillColor = dotColor + "22";
          }

          const pct = remain !== null ? remain : (hasTiger ? Math.round(this._pct(tiger.weight, tiger.capacity)) : null);

          const col = document.createElement("div");
          col.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer";

          const lbl = document.createElement("div");
          const m2 = e.entity_id.match(/(\d+)$/);
          lbl.style.cssText = "font-size:10px;font-weight:500;color:var(--secondary-text-color)";
          lbl.textContent = isExt ? "Ext." : (m2 ? `T${m2[1]}` : "?");

          const slot = document.createElement("div");
          slot.dataset.slotEid = e.entity_id;
          slot.style.cssText = `
            width:100%;border-radius:6px;height:80px;position:relative;overflow:hidden;
            border:${isCurrent ? "2px solid var(--tt-green)" : "0.5px solid var(--divider-color)"};
            background:var(--secondary-background-color);
          `;

          if (pct !== null) {
            const fill = document.createElement("div");
            fill.style.cssText = `position:absolute;bottom:0;width:100%;height:${pct}%;background:${fillColor};transition:height .3s;`;
            slot.appendChild(fill);
            const pctLbl = document.createElement("div");
            pctLbl.style.cssText = `position:absolute;bottom:2px;width:100%;text-align:center;font-size:9px;font-weight:500;color:${dotColor};`;
            pctLbl.textContent = pct + "%";
            slot.appendChild(pctLbl);
          } else if (!hasRfid && !hasTiger) {
            const emptyLbl = document.createElement("div");
            emptyLbl.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--secondary-text-color)";
            emptyLbl.textContent = "Vide";
            slot.appendChild(emptyLbl);
          }

          const dot = document.createElement("div");
          dot.style.cssText = `
            position:absolute;top:5px;left:50%;transform:translateX(-50%);
            width:11px;height:11px;border-radius:50%;
            background:${dotColor};border:0.5px solid var(--card-background-color);
          `;
          slot.appendChild(dot);

          if (isActive) {
            const act = document.createElement("div");
            act.style.cssText = "position:absolute;top:2px;right:3px;font-size:8px;color:var(--tt-green)";
            act.textContent = "▶";
            slot.appendChild(act);
          }

          const name = document.createElement("div");
          name.style.cssText = "font-size:9px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;color:var(--primary-text-color)";
          name.textContent = hasTiger ? (tiger.name || "—") : (hasRfid ? (a.type || "Bambu") : "—");

          const badge = document.createElement("div");
          badge.style.cssText = "font-size:8px;padding:1px 4px;border-radius:3px;white-space:nowrap";
          if (hasTiger) {
            badge.style.background = tiger.is_plus ? "#fff3e0" : "#e8f5e9";
            badge.style.color = tiger.is_plus ? "#bf360c" : "#1b5e20";
            badge.textContent = tiger.is_plus ? "TigerTag+" : "TigerTag";
          } else if (hasRfid) {
            badge.style.background = "#f3e5f5";
            badge.style.color = "#6a1b9a";
            badge.textContent = "Bambu Lab";
          } else {
            badge.style.color = "var(--secondary-text-color)";
            badge.textContent = "—";
          }

          col.appendChild(lbl); col.appendChild(slot);
          col.appendChild(name); col.appendChild(badge);

          // Clic slot → sélectionner + activer le bouton Assigner
          col.addEventListener("click", () => {
            slotsDiv.querySelectorAll("[data-slot-selected]").forEach(el => {
              el.style.border = "0.5px solid var(--divider-color)";
              delete el.dataset.slotSelected;
            });
            slot.style.border = "2px solid var(--tt-green)";
            slot.dataset.slotSelected = "1";
            this._amsState.tray = e.entity_id;
            // Rack = vider
            rackSel.value = "";
            this._rackState.rack_id = null;
            rackPosRow.style.display = "none";
            // Activer bouton
            const vBtn = container.querySelector("#tt-validate-btn");
            if (vBtn) { vBtn.disabled = false; vBtn.style.opacity = "1"; vBtn.style.cursor = "pointer"; }
            // Charger profils
            this._loadProfilesForPrinter(pSel.value, s, container);
          });

          grid.appendChild(col);
        });
        slotsDiv.appendChild(grid);
      };

      // Init slots
      renderSlots(initPrinter, amsSel.value || Object.keys(getAmsGroups(initPrinter))[0]);

      // Changement d'imprimante → refill AMS sel + re-render slots
      pSel.addEventListener("change", e => {
        fillAmsSel(e.target.value);
        renderSlots(e.target.value, amsSel.value);
        this._amsState.tray = null;
        const vBtn = container.querySelector("#tt-validate-btn");
        if (vBtn) { vBtn.disabled = true; vBtn.style.opacity = "0.4"; }
        setTimeout(() => this._loadProfilesForPrinter(e.target.value, s, container), 50);
      });

      // Changement AMS/Externe → re-render slots
      amsSel.addEventListener("change", e => {
        renderSlots(pSel.value, e.target.value);
        this._amsState.tray = null;
        const vBtn = container.querySelector("#tt-validate-btn");
        if (vBtn) { vBtn.disabled = true; vBtn.style.opacity = "0.4"; }
      });

      amsSec.appendChild(slotsDiv);

      // Bouton retirer AMS
      if (s.ams_entity) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "tt-btn-tare";
        removeBtn.style.cssText = "color:var(--tt-red);border-color:var(--tt-red);width:100%;margin-top:6px";
        removeBtn.textContent = "Retirer de l'AMS";
        removeBtn.addEventListener("click", async () => {
          await this._setAms(s, "—");
          s.ams_entity = null;
          removeBtn.style.display = "none";
        });
        amsSec.appendChild(removeBtn);
      }
    }
    container.appendChild(amsSec);

    // ══════════════════════════════════════════════════════
    // SECTION PROFIL FILAMENT
    // ══════════════════════════════════════════════════════
    const profileSec = document.createElement("div");
    profileSec.id = "tt-profile-sec";
    profileSec.innerHTML = `<div class="tt-section-label">Profil filament Bambu</div>
      <div id="tt-profile-list" style="font-size:11px;color:var(--secondary-text-color)">
        Sélectionne un emplacement pour charger les profils
      </div>`;
    container.appendChild(profileSec);

    // Initialiser la visibilité : rack sélectionné → cacher AMS+profil
    // On doit le faire après avoir appended les deux sections
    const _toggleAmsSec = (show) => {
      amsSec.style.display     = show ? "" : "none";
      profileSec.style.display = show ? "" : "none";
    };
    // Si une bobine est déjà dans un rack, on cache l'AMS par défaut
    _toggleAmsSec(!s.rack_id);
    // Si rack est changé → relancé via listener déjà posé sur rackSel
    // (on doit réassigner car _toggleAmsSec était pas encore défini au moment du listener)
    rackSel.addEventListener("change", () => {
      _toggleAmsSec(!rackSel.value);
    });

    // ══════════════════════════════════════════════════════
    // BOUTON ASSIGNER UNIQUE
    // ══════════════════════════════════════════════════════
    const validateBtn = document.createElement("button");
    validateBtn.className = "tt-btn-save";
    validateBtn.style.cssText = "width:100%;margin-top:10px";
    validateBtn.id = "tt-validate-btn";
    validateBtn.textContent = "Assigner";

    const isRackReady = () => rackSel.value && this._rackState.level !== null && this._rackState.position !== null;
    const isAmsReady  = () => !!this._amsState.tray;

    // Indique si le slot rack actuellement sélectionné est occupé par une autre bobine
    const isSlotOccupied = () => {
      if (!isRackReady()) return false;
      return !!this._getSlotOccupant(
        this._rackState.rack_id,
        this._rackState.level,
        this._rackState.position,
        s.uid
      );
    };

    // Mise à jour visuelle du bouton Assigner selon disponibilité du slot
    _refreshAssignBtn = () => {
      const ok       = isRackReady() || isAmsReady();
      const occupied = isRackReady() && isSlotOccupied();
      validateBtn.disabled      = !ok;
      validateBtn.style.opacity = ok ? "1" : "0.4";
      validateBtn.style.cursor  = ok ? "pointer" : "default";
      if (occupied) {
        // Slot pris : bouton orange avec avertissement
        validateBtn.textContent       = "⚠️ Assigner (remplacer)";
        validateBtn.style.background  = "var(--warning-color, #f4a100)";
        validateBtn.style.color       = "#fff";
        validateBtn.style.borderColor = "var(--warning-color, #f4a100)";
      } else {
        validateBtn.textContent       = "Assigner";
        validateBtn.style.background  = "";
        validateBtn.style.color       = "";
        validateBtn.style.borderColor = "";
      }
    };

    // Init couleur bouton immédiatement
    _refreshAssignBtn();

    rackSel.addEventListener("change",  _refreshAssignBtn);
    levelSel.addEventListener("change", _refreshAssignBtn);
    posSel.addEventListener("change",   _refreshAssignBtn);

    validateBtn.addEventListener("click", async () => {
      validateBtn.disabled = true;
      validateBtn.textContent = "Envoi…";
      try {
        if (isRackReady()) {
          // Rack prioritaire — efface AMS si nécessaire puis assigne au rack
          await this._setRack(
            s,
            this._rackState.rack_id,
            this._rackState.level,
            this._rackState.position
          );
        } else if (isAmsReady()) {
          // Assigner à l'AMS seulement si aucun rack sélectionné
          await this._setAms(s, this._amsState.tray);
        }
        validateBtn.textContent = "Assigné ✓";
        // Mettre à jour les selects : ancien slot → vert, nouveau → rouge
        fillRackPos(this._rackState.rack_id || "");
        setTimeout(() => { validateBtn.textContent = "Assigner"; }, 1800);
      } catch(e) {
        console.error("[TigerTagCard] assign:", e);
        validateBtn.textContent = "Erreur";
        setTimeout(() => { validateBtn.textContent = "Assigner"; }, 1800);
      } finally {
        validateBtn.disabled = false;
        refreshBtn();
      }
    });
    container.appendChild(validateBtn);

    // Charger les profils si déjà dans un AMS
    // Note : on ne pré-remplit PAS _amsState.tray ici pour que isAmsReady()
    // reste false tant que l'utilisateur n'a pas explicitement cliqué un slot.
    // Ainsi, sélectionner un rack + niveau + position prend la priorité.
    if (s.ams_entity) {
      const firstPrinter = this._printerName(s.ams_entity);
      setTimeout(() => this._loadProfilesForPrinter(firstPrinter, s, container), 150);
    }
  }


  _renderTempSection(container, s, overrideTemps) {
    // overrideTemps = {nozzle_min, nozzle_max, bed_min, bed_max, dry_temp, dry_time}
    const nm  = overrideTemps?.nozzle_min  ?? s.nozzle_min;
    const nM  = overrideTemps?.nozzle_max  ?? s.nozzle_max;
    const bm  = overrideTemps?.bed_min     ?? s.bed_min;
    const bM  = overrideTemps?.bed_max     ?? s.bed_max;
    const dt  = overrideTemps?.dry_temp    ?? s.dry_temp;
    const dth = overrideTemps?.dry_time    ?? s.dry_time;

    if (!nm && !nM && !bm && !bM && !dt) { container.innerHTML = ""; return; }

    container.innerHTML = `<div class="tt-section-label" style="margin-top:8px">Paramètres d'impression</div>
      <div class="tt-temp-grid">
        ${(nm||nM)?`<div class="tt-temp-chip"><div class="tt-temp-lbl">Buse</div><div class="tt-temp-val">${nm||"?"}–${nM||"?"} °C</div></div>`:""}
        ${(bm||bM)?`<div class="tt-temp-chip"><div class="tt-temp-lbl">Plateau</div><div class="tt-temp-val">${bm||"?"}–${bM||"?"} °C</div></div>`:""}
        ${dt?`<div class="tt-temp-chip"><div class="tt-temp-lbl">Séchage</div><div class="tt-temp-val">${dt} °C</div></div>`:""}
        ${dth?`<div class="tt-temp-chip"><div class="tt-temp-lbl">Durée séchage</div><div class="tt-temp-val">${dth} h</div></div>`:""}
      </div>`;
  }

  /* ── Profils filament Bambu ─────────────────────────────────────────────── */

  async _loadProfilesForPrinter(printerName, s, container) {
    const profileList = container.querySelector ? container.querySelector("#tt-profile-list") : null;
    if (profileList) profileList.innerHTML = `<span style="color:var(--secondary-text-color)">Chargement des profils…</span>`;

    const trays = this._getBambuTrayEntities()
      .filter(e => this._printerName(e.entity_id) === printerName);
    if (!trays.length || !this._hass) {
      if (profileList) profileList.textContent = "Aucun tray trouvé pour " + printerName;
      return;
    }

    // Récupérer le device_id du premier tray de cette imprimante
    let deviceId = null;
    try {
      const reg = await this._hass.connection.sendMessagePromise({
        type: "config/entity_registry/list",
      });
      // reg peut être un tableau ou un objet {entities: [...]}
      const list = Array.isArray(reg) ? reg : (reg?.entities || []);
      const entry = list.find(e => e.entity_id === trays[0].entity_id);
      deviceId = entry?.device_id || null;
      if (!deviceId) console.warn("[TigerTag] device_id introuvable pour", trays[0].entity_id, "dans", list.length, "entrées");
    } catch(e) { console.warn("[TigerTag] entity_registry:", e); }

    if (!deviceId) {
      // Fallback : utiliser la table interne directement
      if (profileList) profileList.innerHTML = `<span style="color:var(--secondary-text-color)">Profils génériques (device_id introuvable)</span>`;
      await this._hass.callService("tigertag", "fetch_bambu_profiles", {
        device_id: "fallback_" + printerName.toLowerCase(),
        uid: s.uid,
      });
      // Utiliser le premier résultat disponible
      await new Promise(r => setTimeout(r, 800));
      const updated = Object.values(this._hass.states)
        .find(e => e.entity_id === "sensor.tigertag_statistiques");
      const allBp = updated?.attributes?.bambu_profiles || {};
      const anyProfiles = Object.values(allBp)[0]?.profiles;
      if (anyProfiles) { this._renderProfileList(profileList, anyProfiles, s, container); return; }
      if (profileList) profileList.textContent = "Impossible de charger les profils";
      return;
    }

    // Vérifier le cache dans sensor.tigertag_statistiques
    const statsSensor = Object.values(this._hass.states)
      .find(e => e.entity_id === "sensor.tigertag_statistiques");
    const cached = statsSensor?.attributes?.bambu_profiles?.[deviceId];
    // Utiliser le cache uniquement si les profils ont été scorés pour cette bobine précise
    if (cached && cached.uid === s.uid) {
      this._renderProfileList(profileList, cached.profiles || [], s, container);
      return;
    }

    // Appeler le service Python
    try {
      await this._hass.callService("tigertag", "fetch_bambu_profiles", {
        device_id: deviceId, uid: s.uid,
      });
      // Polling : attendre que le sensor se mette à jour (max 5s)
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        const updated = Object.values(this._hass.states)
          .find(e => e.entity_id === "sensor.tigertag_statistiques");
        const p = updated?.attributes?.bambu_profiles?.[deviceId];
        if (p) { this._renderProfileList(profileList, p.profiles || [], s, container); return; }
      }
      if (profileList) profileList.textContent = "Aucun profil reçu — vérifier ha-bambulab";
    } catch(e) {
      console.error("[TigerTag] fetchProfiles:", e);
      if (profileList) profileList.textContent = "Erreur lors du chargement";
    }
  }

  _renderProfileList(container, profiles, s, tabContainer) {
    if (!container) return;
    if (!profiles.length) {
      container.textContent = "Aucun profil disponible";
      return;
    }
    container.innerHTML = "";

    // Profil sauvegardé pour cette bobine (persisté sur disque)
    const savedIdx = s.bambu_profile_idx || null;

    // Réorganiser : profil sauvegardé en premier si présent
    let ordered = [...profiles];
    if (savedIdx) {
      const savedPos = ordered.findIndex(p => p.tray_info_idx === savedIdx);
      if (savedPos > 0) {
        const [saved] = ordered.splice(savedPos, 1);
        ordered.unshift(saved);
      }
    }

    // Dropdown avec idx affiché
    const sel = document.createElement("select");
    sel.className = "tt-loc-sel";
    sel.style.width = "100%";

    ordered.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      const isSaved = savedIdx && p.tray_info_idx === savedIdx;
      const isTop   = i === 0 && !isSaved;
      const label   = p.name || p.tray_info_idx || "Inconnu";
      const idx     = p.tray_info_idx || "";
      const suffix  = isSaved ? " 💾" : (isTop ? " ★" : "");
      opt.textContent = `${label} (${idx})${suffix}`;
      sel.appendChild(opt);
    });
    container.appendChild(sel);

    // Note explicative
    const note = document.createElement("div");
    note.style.cssText = "font-size:10px;color:var(--secondary-text-color);margin-top:3px";
    const noteText = savedIdx
      ? `💾 = dernier profil utilisé · ★ = recommandé pour ${s.material||""} ${s.series||""}`
      : `★ = recommandé pour ${s.material||""} ${s.series||""}`;
    note.textContent = noteText;
    container.appendChild(note);

    // Listener changement profil
    const onProfileChange = (idx) => {
      const p = ordered[parseInt(idx)];
      if (!p) return;
      this._amsState.profile = p;
      const tempSec = tabContainer?.querySelector("#tt-temp-section")
        || this._domPanel?.querySelector("#tt-temp-section");
      if (tempSec) {
        this._renderTempSection(tempSec, s, {
          nozzle_min: parseInt(p.nozzle_temp_min) || null,
          nozzle_max: parseInt(p.nozzle_temp_max) || null,
          bed_min:    parseInt(p.bed_temp)         || null,
          dry_temp:   parseInt(p.drying_temp)      || null,
          dry_time:   parseInt(p.drying_time)      || null,
        });
      }
    };

    sel.addEventListener("change", e => onProfileChange(e.target.value));

    // Sélectionner le profil par défaut et mettre à jour les températures
    this._amsState.profile = ordered[0];
    onProfileChange(0);
  }

  /* Panneau AMS intégré dans les onglets du panneau principal */

    _shortAmsName(entityId) {
    if (!entityId || !this._hass || !this._hass.states[entityId]) return entityId;
    const name = this._hass.states[entityId].attributes.friendly_name || entityId;
    return name.replace(/emplacement\s*/i,"T").trim();
  }
  _pct(w,c)      { return Math.round(Math.max(0, Math.min(100, w/(c||1000)*100))); }
  _barColor(w,c) {
    const p = this._pct(w,c);
    return p>50?"var(--success-color,#1D9E75)":p>20?"var(--warning-color,#BA7517)":"var(--error-color,#E24B4A)";
  }
  _colorDiv(s,cls) {
    const d = document.createElement("div");
    d.className = cls; d.style.background = s.color_hex+"33";
    d.innerHTML = `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" opacity=".25"><circle cx="20" cy="20" r="15" stroke="var(--primary-text-color)" stroke-width="1.5"/><path d="M13 20L20 13L27 20L20 27Z" stroke="var(--primary-text-color)" stroke-width="1.5" fill="none"/></svg>`;
    return d;
  }
  _esc(s) {
    return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  }
}

customElements.define("tigertag-card", TigerTagCard);
window.customCards = window.customCards || [];
window.customCards.push({ type:"tigertag-card", name:"TigerTag Card", description:"Gestion inventaire filaments TigerTag", preview:false });
console.info(`%c TigerTag Card %c v${VERSION} `,"background:#1D9E75;color:#fff;font-weight:500;padding:2px 6px;border-radius:3px 0 0 3px","background:#eee;color:#333;padding:2px 6px;border-radius:0 3px 3px 0");
