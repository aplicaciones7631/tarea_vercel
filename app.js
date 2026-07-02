let SUPABASE_URL, API_KEY;

const CAPAS_CONFIG = [
{ id:'macas_barrios_2016',    nombre:'Barrios',             tipo:'polygon', color:'#e41a1c', fill:true,  peso:2 },
{ id:'macas_manzanas',        nombre:'Manzanas',            tipo:'line',    color:'#377eb8', fill:false, peso:1.5 },
{ id:'macas_vias',            nombre:'VÃ­as',                tipo:'line',    color:'#4daf4a', fill:false, peso:1.8 },
{ id:'morona_canton_2025',    nombre:'CantÃ³n Morona',       tipo:'polygon', color:'#984ea3', fill:true,  peso:2.5 },
{ id:'morona_parroquias_2025',nombre:'Parroquias',          tipo:'polygon', color:'#ff7f00', fill:true,  peso:2 },
{ id:'morona_pob_sectores_2025',nombre:'Sectores poblados', tipo:'point',   color:'#a65628', fill:true,  peso:1 },
{ id:'morona_poblados_2025',  nombre:'Poblados',            tipo:'point',   color:'#f781bf', fill:true,  peso:1 },
{ id:'reportes_ciudadanos',   nombre:'Reportes ciudadanos',  tipo:'point',   color:'#e74c3c', fill:true,  peso:1 }
];

const BASEMAPS = {
osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
attribution:'&copy; <a href="https://openstreetmap.org/copyright">OSM</a>',
maxZoom:19
}),
satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
attribution:'&copy; <a href="https://esri.com">Esri</a>',
maxZoom:18
})
};

const ICONOS_REPORTE = {
Bache:'ðŸ•³ï¸', Alcantarilla:'ðŸ’§', Alumbrado:'ðŸ’¡', Basura:'ðŸ—‘ï¸',
Senal:'ðŸš¸', Acera:'ðŸš¶', Inundacion:'ðŸŒŠ', Arbol:'ðŸŒ³',
Vandalismo:'ðŸŽ¨', Otro:'ðŸ“Œ'
};

let map, activeBasemap = 'osm', capasCargadas = {};

async function loadConfig() {
const res = await fetch('/api/config');
if (!res.ok) throw new Error('Error al cargar configuracion');
const cfg = await res.json();
SUPABASE_URL = cfg.supabaseUrl;
API_KEY = cfg.supabaseKey;
}

async function init() {
const status = document.getElementById('headerStatus');
try {
status.innerHTML = '<span class="spinner"></span> Cargando configuracion...';
await loadConfig();
} catch (e) {
status.style.color = '#e74c3c';
status.textContent = 'Error de configuracion';
console.error(e);
return;
}

map = L.map('map', {
center: [-2.3167, -78.1167],
zoom: 12,
zoomControl: true,
attributionControl: false
});

BASEMAPS.osm.addTo(map);
L.control.attribution({ prefix:'Geoportal Macas' }).addTo(map);

setupSidebar();
setupBasemapSwitcher();
buildLayerListUI();
setupReportes();
cargarTodas();

map.on('click', function(e) {
if (selectingOnMap) {
reportLat = e.latlng.lat;
reportLng = e.latlng.lng;
colocarMarcadorReporte(reportLat, reportLng);
actualizarCoordsUI();
selectingOnMap = false;
map.getContainer().style.cursor = '';
abrirModalReporte();
}
});
}

/* ===== SIDEBAR ===== */
function setupSidebar() {
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');

document.getElementById('btnSidebar').onclick = () => toggleSidebar(true);
document.getElementById('btnCloseSidebar').onclick = () => toggleSidebar(false);
overlay.onclick = () => toggleSidebar(false);

window.matchMedia('(min-width:769px)').addEventListener('change', e => {
if (e.matches) overlay.classList.remove('visible');
});
}

function toggleSidebar(open) {
document.getElementById('sidebar').classList.toggle('closed', !open);
document.getElementById('sidebarOverlay').classList.toggle('visible', open);
}

/* ===== BASEMAP SWITCHER ===== */
function setupBasemapSwitcher() {
document.querySelectorAll('input[name="basemap"]').forEach(radio => {
radio.addEventListener('change', () => {
if (!radio.checked || radio.value === activeBasemap) return;
map.removeLayer(BASEMAPS[activeBasemap]);
BASEMAPS[radio.value].addTo(map);
activeBasemap = radio.value;
});
});
}

/* ===== LAYER UI ===== */
function buildLayerListUI() {
const container = document.getElementById('layerList');
const badges = { polygon:'POL', line:'LIN', point:'PNT' };
container.innerHTML = CAPAS_CONFIG.map(c =>
`<div class="layer-item" data-layer="${c.id}">
<label class="toggle">
<input type="checkbox" class="layer-check" data-layer="${c.id}" checked>
<span class="slider"></span>
</label>
<span class="layer-dot" style="background:${c.color}"></span>
<span class="layer-name">${c.nombre}</span>
<span class="layer-badge">${badges[c.tipo] || ''}</span>
</div>`
).join('');

container.addEventListener('change', e => {
const cb = e.target.closest('.layer-check');
if (!cb) return;
const capa = capasCargadas[cb.dataset.layer];
if (!capa) return;
if (cb.checked) map.addLayer(capa);
else map.removeLayer(capa);
});
}

/* ===== REPORTES CIUDADANOS ===== */
let reportMarker = null;
let reportLat = null, reportLng = null;
let selectingOnMap = false;

function setupReportes() {
const modal = document.getElementById('reportModal');
const btnAbrir = document.getElementById('btnReportar');
const btnCerrar = document.getElementById('btnCerrarModal');
const btnCancelar = document.getElementById('btnCancelarReporte');
const btnMapa = document.getElementById('btnUbicacionMapa');
const btnGps = document.getElementById('btnUbicacionGps');
const btnEnviar = document.getElementById('btnEnviarReporte');

btnAbrir.onclick = () => abrirModalReporte();
btnCerrar.onclick = () => cerrarModalReporte();
btnCancelar.onclick = () => cerrarModalReporte();
modal.onclick = e => { if (e.target === modal) cerrarModalReporte(); };

btnMapa.onclick = () => {
cerrarModalReporte();
selectingOnMap = true;
map.getContainer().style.cursor = 'crosshair';
mostrarToast('Haz clic en el mapa para seÃ±alar la ubicaciÃ³n');
};

btnGps.onclick = () => {
if (!navigator.geolocation) { mostrarToast('GeolocalizaciÃ³n no disponible', 'error'); return; }
navigator.geolocation.getCurrentPosition(
pos => {
reportLat = pos.coords.latitude;
reportLng = pos.coords.longitude;
colocarMarcadorReporte(reportLat, reportLng);
actualizarCoordsUI();
abrirModalReporte();
},
() => mostrarToast('No se pudo obtener tu ubicaciÃ³n', 'error'),
{ enableHighAccuracy: true }
);
};

btnEnviar.onclick = enviarReporte;
}

function abrirModalReporte() {
document.getElementById('reportModal').classList.add('active');
document.getElementById('reportCategoria').focus();
}

function cerrarModalReporte() {
document.getElementById('reportModal').classList.remove('active');
if (selectingOnMap) {
selectingOnMap = false;
map.getContainer().style.cursor = '';
}
}

function colocarMarcadorReporte(lat, lng) {
if (reportMarker) map.removeLayer(reportMarker);
reportMarker = L.marker([lat, lng], {
icon: L.divIcon({
className: '',
html: '<div class="report-marker-pulse conectado"></div>',
iconSize: [24, 24],
iconAnchor: [12, 12]
})
}).addTo(map);
map.setView([lat, lng], Math.max(map.getZoom(), 15));
}

function actualizarCoordsUI() {
const el = document.getElementById('reportCoords');
if (reportLat != null && reportLng != null) {
el.className = 'coords-info ok';
el.textContent = `UbicaciÃ³n: ${reportLat.toFixed(5)}, ${reportLng.toFixed(5)}`;
document.getElementById('btnEnviarReporte').disabled = false;
} else {
el.className = 'coords-info';
el.textContent = 'Ninguna ubicaciÃ³n seleccionada';
document.getElementById('btnEnviarReporte').disabled = true;
}
}

async function enviarReporte() {
const categoria = document.getElementById('reportCategoria').value;
const comentario = document.getElementById('reportComentario').value.trim();

if (!categoria) { mostrarToast('Selecciona una categorÃ­a', 'error'); return; }
if (reportLat == null || reportLng == null) { mostrarToast('Selecciona una ubicaciÃ³n', 'error'); return; }

const btnEnviar = document.getElementById('btnEnviarReporte');
btnEnviar.disabled = true;
btnEnviar.textContent = 'Enviando...';

try {
const res = await fetch(`${SUPABASE_URL}/reportes_ciudadanos`, {
method: 'POST',
headers: {
apikey: API_KEY,
Authorization: `Bearer ${API_KEY}`,
'Content-Type': 'application/json',
Prefer: 'return=representation'
},
body: JSON.stringify({ categoria, comentario: comentario || null, lat: reportLat, lon: reportLng })
});

if (!res.ok) {
const err = await res.json().catch(() => ({}));
throw new Error(err.message || `HTTP ${res.status}`);
}

cerrarModalReporte();
mostrarToast('Reporte enviado correctamente', 'ok');

document.getElementById('reportCategoria').value = '';
document.getElementById('reportComentario').value = '';
if (reportMarker) { map.removeLayer(reportMarker); reportMarker = null; }
reportLat = reportLng = null;
actualizarCoordsUI();
btnEnviar.disabled = true;

recargarReportes();

} catch (e) {
mostrarToast('Error al enviar: ' + e.message, 'error');
console.error(e);
} finally {
btnEnviar.textContent = 'Enviar reporte';
}
}

async function recargarReportes() {
const cfg = CAPAS_CONFIG.find(c => c.id === 'reportes_ciudadanos');
if (!cfg) return;

const prev = capasCargadas['reportes_ciudadanos'];
if (prev) {
map.removeLayer(prev);
delete capasCargadas['reportes_ciudadanos'];
}

try {
const capa = await cargarCapa(cfg);
if (capa) {
capa.addTo(map);
capasCargadas['reportes_ciudadanos'] = capa;
}
} catch (e) {
console.warn('Error al recargar reportes:', e);
}
}

function mostrarToast(msg, tipo) {
const existing = document.querySelector('.toast-notif');
if (existing) existing.remove();
const el = document.createElement('div');
el.className = 'toast-notif';
el.textContent = msg;
Object.assign(el.style, {
position:'fixed', bottom:'30px', left:'50%', transform:'translateX(-50%)',
zIndex:3000, padding:'10px 24px', borderRadius:'10px', fontSize:'14px', fontWeight:'500',
boxShadow:'0 4px 20px rgba(0,0,0,.4)', transition:'opacity .3s, transform .3s',
background: tipo === 'error' ? '#c0392b' : tipo === 'ok' ? '#27ae60' : '#2c3e50',
color:'#fff', opacity:'0', pointerEvents:'none'
});
document.body.appendChild(el);
requestAnimationFrame(() => { el.style.opacity = '1'; });
setTimeout(() => {
el.style.opacity = '0';
setTimeout(() => el.remove(), 300);
}, 3000);
}

/* ===== SUPABASE QUERY ===== */
async function fetchTabla(tabla) {
const res = await fetch(`${SUPABASE_URL}/${tabla}?select=*`, {
headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` }
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
return res.json();
}

function parseGeometria(reg) {
let geom = reg.geom || reg.geometry || reg.geojson;
if (typeof geom === 'string') { try { geom = JSON.parse(geom); } catch(e) {} }
if (geom && geom.type) {
return { type:'Feature', properties:reg, geometry:geom };
}
const lat = reg.lat ?? reg.latitude ?? reg.latitud;
const lon = reg.lon ?? reg.lng ?? reg.longitude ?? reg.longitud;
if (lat != null && lon != null) {
return { type:'Feature', properties:reg, geometry:{ type:'Point', coordinates:[+lon, +lat] } };
}
return null;
}

function crearEstilo(cfg) {
if (cfg.fill) {
return { color:cfg.color, weight:cfg.peso, fillColor:cfg.color, fillOpacity:0.35 };
}
return { color:cfg.color, weight:cfg.peso, opacity:0.85 };
}

function popupReporte(props) {
const icono = ICONOS_REPORTE[props.categoria] || 'ðŸ“Œ';
const fecha = props.created_at
? new Date(props.created_at).toLocaleDateString('es-EC', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
: '';
return `<div style="text-align:center;font-size:28px;margin-bottom:4px">${icono}</div>
<div style="font-weight:700;color:#e74c3c;text-align:center;margin-bottom:6px;font-size:14px">${props.categoria}</div>
<hr style="margin:2px 0 6px">
<div style="font-size:12px;color:#ddd">${props.comentario || '<em style="color:#888">Sin comentario</em>'}</div>
${fecha ? `<div style="font-size:10px;color:#999;margin-top:6px;text-align:right">${fecha}</div>` : ''}`;
}

function popupGenerico(feature, nombreTabla) {
let html = `<div style="font-weight:700;color:#1a3a5c;margin-bottom:4px">${nombreTabla}</div><hr style="margin:2px 0 4px">`;
for (let k in feature.properties) {
if (k === 'geom' || k === 'geometry') continue;
html += `<div style="font-size:12px;margin:1px 0"><span style="color:#666">${k}:</span> ${feature.properties[k]}</div>`;
}
return html;
}

async function cargarCapa(cfg) {
const datos = await fetchTabla(cfg.id);
if (!datos || !datos.length) return null;
const features = datos.map(parseGeometria).filter(Boolean);
if (!features.length) return null;

const esReportes = cfg.id === 'reportes_ciudadanos';

return L.geoJSON({ type:'FeatureCollection', features }, {
style: crearEstilo(cfg),
pointToLayer: esReportes ? function(feature, latlng) {
const icono = ICONOS_REPORTE[feature.properties.categoria] || 'ðŸ“Œ';
return L.marker(latlng, {
icon: L.divIcon({
className: '',
html: `<div style="font-size:22px;text-align:center;line-height:1">${icono}</div>`,
iconSize: [28, 28],
iconAnchor: [14, 14]
})
});
} : undefined,
onEachFeature(feature, layer) {
layer.bindPopup(esReportes ? popupReporte(feature.properties) : popupGenerico(feature, cfg.nombre));
if (feature.properties.nombre) {
layer.bindTooltip(feature.properties.nombre, { sticky:true });
}
}
});
}

/* ===== LOAD ALL ===== */
async function cargarTodas() {
const status = document.getElementById('headerStatus');
let ok = 0, total = CAPAS_CONFIG.length;

for (const cfg of CAPAS_CONFIG) {
status.innerHTML = `<span class="spinner"></span> ${cfg.nombre}...`;
try {
const capa = await cargarCapa(cfg);
if (capa) {
capa.addTo(map);
capasCargadas[cfg.id] = capa;
ok++;
} else {
const cb = document.querySelector(`.layer-check[data-layer="${cfg.id}"]`);
if (cb) { cb.checked = false; cb.disabled = true; }
}
} catch (e) {
console.warn(`Fallo ${cfg.id}:`, e);
const cb = document.querySelector(`.layer-check[data-layer="${cfg.id}"]`);
if (cb) { cb.checked = false; cb.disabled = true; }
}
}

status.textContent = `${ok}/${total} capas cargadas`;

if (ok > 0) {
const grupo = L.featureGroup(Object.values(capasCargadas));
map.fitBounds(grupo.getBounds().pad(0.05));
}

buildLeyenda();

document.querySelectorAll('.layer-check').forEach(cb => {
if (!cb.disabled) cb.checked = true;
});
}

/* ===== LEGEND ===== */
function buildLeyenda() {
const container = document.getElementById('leyendaContainer');
container.innerHTML = CAPAS_CONFIG.map(c =>
`<div class="leyenda-item">
<span class="leyenda-color" style="background:${c.color}"></span>
${c.nombre}
</div>`
).join('');
}

document.addEventListener('DOMContentLoaded', () => init());
