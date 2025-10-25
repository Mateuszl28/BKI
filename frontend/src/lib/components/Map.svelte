<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type L from 'leaflet';
	import { locationStore } from '$lib/stores/location.svelte';
	import { poiStore } from '$lib/stores/poi.svelte';
	import type { POI } from '$lib/types/poi';

	let mapContainer: HTMLDivElement;
	let map: L.Map | null = null;
	let userMarker: L.Marker | null = null;
	let userAccuracyCircle: L.Circle | null = null;
	let poiLayer: L.LayerGroup | null = null;
	let radiusCircle: L.Circle | null = null;
	let Llib: typeof import('leaflet') | null = null;

	// ==== STAN (Svelte 5 runes)
	let isTracking = $state(false);
	let isSheetOpen = $state(false);      // dolny panel filtrów
	let isLegendOpen = $state(false);     // dolny panel LEGENDY (NOWE)
	let searchQuery = $state('');
	let searchResults = $state<Array<{ display_name: string; lat: string; lon: string }>>([]);
	let showSuggestions = $state(false);

	const allTypes = ['monopolowy', 'klub', 'pub', 'policja', 'stacjabenzynowa'] as const;
	type PoiType = typeof allTypes[number];

	let enabledTypes = $state<Record<PoiType, boolean>>({
		monopolowy: true, klub: true, pub: true, policja: true, stacjabenzynowa: true
	});
	let minDanger = $state(7);
	let filterRadiusKm = $state(3);
	let filterCenter = $state<{ lat: number; lng: number } | null>(null);

	const dangerIcons: Record<PoiType | 'user', string> = {
		monopolowy: '🍷', klub: '🎵', pub: '🍺', policja: '🚨', stacjabenzynowa: '⛽', user: '📍'
	};

	const DEFAULT_VIEW = { lat: 53.01812167, lng: 18.60666329, zoom: 13 };

	function saveView() {
		if (!browser || !map) return;
		const c = map.getCenter();
		localStorage.setItem('map:view', JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
	}
	function loadView() {
		if (!browser) return DEFAULT_VIEW;
		try {
			const raw = localStorage.getItem('map:view');
			if (!raw) return DEFAULT_VIEW;
			const p = JSON.parse(raw);
			return { lat: p.lat ?? DEFAULT_VIEW.lat, lng: p.lng ?? DEFAULT_VIEW.lng, zoom: p.zoom ?? DEFAULT_VIEW.zoom };
		} catch { return DEFAULT_VIEW; }
	}

	// ==== Overpass: lokalny fetch z retry (SSR-safe)
	type OverpassPOI = {
		lat: number; lng: number; name?: string; address?: string; type: 'monopolowy'|'klub'|'pub'|'policja'|'stacjabenzynowa';
		danger: number; description?: string;
	};
	async function fetchJSON(url: string, body: string, attempts = 3, timeoutMs = 20000): Promise<any> {
		for (let i = 0; i < attempts; i++) {
			const ctrl = new AbortController();
			const t = setTimeout(() => ctrl.abort(), timeoutMs);
			try {
				const res = await fetch(url, {
					method: 'POST', mode: 'cors',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
					body: `data=${encodeURIComponent(body)}`, signal: ctrl.signal
				});
				clearTimeout(t);
				if (res.ok) return await res.json();
				await new Promise(r => setTimeout(r, 500 + i * 800));
			} catch { clearTimeout(t); await new Promise(r => setTimeout(r, 500 + i * 800)); }
		}
		throw new Error('Overpass unavailable');
	}
	async function fetchPOIsNearbyLocal(lat: number, lng: number, radiusKm: number): Promise<OverpassPOI[]> {
		const eps = [
			'https://overpass-api.de/api/interpreter',
			'https://overpass.kumi.systems/api/interpreter',
			'https://overpass.openstreetmap.ru/api/interpreter'
		];
		const r = Math.max(100, Math.floor(radiusKm * 1000));
		const q = `
			[out:json][timeout:25];
			(
				node(around:${r},${lat},${lng})["shop"="alcohol"];
				node(around:${r},${lat},${lng})["amenity"="nightclub"];
				node(around:${r},${lat},${lng})["amenity"="pub"];
				node(around:${r},${lat},${lng})["amenity"="police"];
				node(around:${r},${lat},${lng})["amenity"="fuel"];
			);
			out center tags;
		`.trim();
		let json: any = null, last: any = null;
		for (const ep of eps) { try { json = await fetchJSON(ep, q, 2); if (json) break; } catch (e) { last = e; } }
		if (!json) throw last ?? new Error('No Overpass response');
		const mapType = (t: any): OverpassPOI['type'] =>
			t.shop === 'alcohol' ? 'monopolowy' :
			t.amenity === 'nightclub' ? 'klub' :
			t.amenity === 'pub' ? 'pub' :
			t.amenity === 'police' ? 'policja' : 'stacjabenzynowa';
		return (json.elements || []).filter((e: any) => e.lat && e.lon && e.tags).map((e: any) => {
			const t = e.tags || {};
			const name = t.name || 'Miejsce';
			const addr = [t['addr:street'], t['addr:housenumber'], t['addr:city']].filter(Boolean).join(' ') || '';
			const danger = t.amenity === 'police' ? 7 : (t.amenity === 'nightclub' ? 9 : (t.shop === 'alcohol' ? 8 : 7));
			return { lat: e.lat, lng: e.lon, name, address: addr, type: mapType(t), danger, description: t.operator || t.brand || '' };
		});
	}

	// ==== Nominatim (SSR-safe)
	let searchDebounce: number | undefined;
	function onSearchInput() {
		showSuggestions = true;
		if (searchDebounce) clearTimeout(searchDebounce);
		searchDebounce = setTimeout(fetchSuggestions, 300) as unknown as number;
	}
	async function fetchSuggestions() {
		if (!browser) return;
		if (!searchQuery.trim()) { searchResults = []; return; }
		try {
			const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=0&limit=5&namedetails=0&accept-language=pl&email=test@example.com`;
			const res = await fetch(url, { method: 'GET', mode: 'cors', headers: { Accept: 'application/json' } });
			if (!res.ok) { searchResults = []; return; }
			searchResults = await res.json();
		} catch { searchResults = []; }
	}
	function chooseSuggestion(item: { lat: string; lon: string; display_name: string }) {
		searchQuery = item.display_name; showSuggestions = false;
		jumpTo(parseFloat(item.lat), parseFloat(item.lon));
	}
	function jumpTo(lat: number, lng: number) {
		if (!map) return;
		map.setView([lat, lng], 16);
		filterCenter = { lat, lng };
		drawRadiusCircle(); refreshPOIMarkers();
	}

	// ==== Lifecycle
	onMount(async () => {
		if (!browser) return;
		Llib = await import('leaflet');
		await import('leaflet/dist/leaflet.css');

		const L = Llib!;
		const view = loadView();
		map = L.map(mapContainer, {
			center: [view.lat, view.lng],
			zoom: view.zoom,
			zoomControl: false,
			attributionControl: true
		});
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap contributors', maxZoom: 19
		}).addTo(map);
		L.control.zoom({ position: 'bottomright' }).addTo(map);
		L.control.scale({ metric: true }).addTo(map);

		poiLayer = L.layerGroup().addTo(map);

		const seedLat = 53.01809179200012;
		const seedLng = 18.607055641182555;
		let newPOIs: POI[] = [];
		try { newPOIs = await fetchPOIsNearbyLocal(seedLat, seedLng, 3) as unknown as POI[]; } catch {}
		poiStore.loadDemoData(newPOIs);

		filterCenter = { lat: view.lat, lng: view.lng };
		drawRadiusCircle();

		map.on('moveend', saveView, { passive: true } as any);
		map.on('zoomend', saveView, { passive: true } as any);
		map.on('click', (e: any) => {
			filterCenter = { lat: e.latlng.lat, lng: e.latlng.lng };
			drawRadiusCircle(); refreshPOIMarkers();
		}, { passive: true } as any);

		refreshPOIMarkers();
	});

	onDestroy(() => {
		locationStore.stopTracking?.();
		if (map) { map.remove(); map = null; }
	});

	// ==== Funkcje mapy / UI
	function resetFilters() {
		minDanger = 7; filterRadiusKm = 3;
		enabledTypes = { monopolowy: true, klub: true, pub: true, policja: true, stacjabenzynowa: true };
		if (map) { const c = map.getCenter(); filterCenter = { lat: c.lat, lng: c.lng }; }
		drawRadiusCircle(); refreshPOIMarkers();
	}
	function drawRadiusCircle() {
		const L = Llib!; if (!map || !filterCenter) return;
		if (radiusCircle) {
			radiusCircle.setLatLng([filterCenter.lat, filterCenter.lng]);
			radiusCircle.setRadius(filterRadiusKm * 1000);
		} else {
			radiusCircle = L.circle([filterCenter.lat, filterCenter.lng], {
				radius: filterRadiusKm * 1000, color: '#ff5722', fillColor: '#ff5722',
				fillOpacity: 0.08, weight: 2, dashArray: '4 6'
			}).addTo(map);
		}
	}
	function distanceMeters(a: {lat: number; lng: number}, b: {lat: number; lng: number}) {
		const R = 6371e3, φ1 = a.lat*Math.PI/180, φ2 = b.lat*Math.PI/180;
		const Δφ = (b.lat-a.lat)*Math.PI/180, Δλ = (b.lng-a.lng)*Math.PI/180;
		const s = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
		return 2*R*Math.asin(Math.sqrt(s));
	}
	function refreshPOIMarkers() {
		try {
			const L = Llib!; if (!map || !poiLayer) return;
			poiLayer.clearLayers();
			const pois: POI[] = poiStore.pois ?? [];
			let filtered = pois.filter(p => enabledTypes[p.type as PoiType] && (p.danger ?? 0) >= minDanger);
			if (filterCenter && filterRadiusKm > 0) {
				filtered = filtered.filter(p => distanceMeters(filterCenter!, { lat: p.lat, lng: p.lng }) <= filterRadiusKm * 1000);
			}
			const markers: L.Marker[] = [];
			for (const poi of filtered) {
				const icon = L.divIcon({
					html: `<div class="danger-marker danger-${Math.min(10, Math.max(0, poi.danger ?? 0))}">${dangerIcons[(poi.type as PoiType) || 'pub']}</div>`,
					className: 'custom-div-icon', iconSize: [44, 44], iconAnchor: [22, 22]
				});
				const navUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${poi.lat}%2C${poi.lng}`;
				const copyBtnId = `copy-${poi.lat.toFixed(5)}-${poi.lng.toFixed(5)}`.replace(/[^\w-]/g, '');
				const popup = `
					<div style="text-align:center;padding:8px;min-width:220px">
						<h3 style="margin:0 0 6px 0;color:#d32f2f;font-size:16px;">${poi.name ?? 'Miejsce'}</h3>
						<p style="margin:2px 0;font-size:14px;"><strong>Poziom:</strong> ${poi.danger ?? '?'} / 10 🔴</p>
						${poi.description ? `<p style="margin:4px 0;font-size:13px;color:#666;"><em>${poi.description}</em></p>` : ''}
						${poi.address ? `<p style="margin:4px 0;font-size:13px;">${poi.address}</p>` : ''}
						<p style="margin:8px 0 0 0;font-size:14px;">
							<a href="${navUrl}" target="_blank" rel="noopener">Nawiguj ↗</a> •
							<a id="${copyBtnId}" href="#" data-lat="${poi.lat}" data-lng="${poi.lng}">Kopiuj</a>
						</p>
					</div>
				`;
				const m = L.marker([poi.lat, poi.lng], { icon }).bindPopup(popup, { closeButton: true });
				m.on('popupopen', () => {
					if (!browser) return;
					setTimeout(() => {
						const el = document.getElementById(copyBtnId);
						if (el) {
							el.addEventListener('click', (ev) => {
								ev.preventDefault();
								const lat = el.getAttribute('data-lat'); const lng = el.getAttribute('data-lng');
								navigator.clipboard?.writeText(`${lat},${lng}`);
								el.textContent = 'Skopiowano!';
								setTimeout(() => (el.textContent = 'Kopiuj'), 1200);
							}, { once: true, passive: false } as any);
						}
					}, 0);
				}, { passive: true } as any);
				m.addTo(poiLayer); markers.push(m);
			}
			if (markers.length && map && !isTracking) {
				const g = L.featureGroup(markers); map.fitBounds(g.getBounds().pad(0.2));
			}
		} catch {}
	}
	async function locateUser() {
		if (!browser) return;
		const L = Llib!; if (!map) return;
		if (!navigator.geolocation) { alert('Geolokalizacja niedostępna.'); return; }
		navigator.geolocation.getCurrentPosition((pos) => {
			updateUserMarker(L, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
			map!.setView([pos.coords.latitude, pos.coords.longitude], Math.max(15, map!.getZoom()));
			filterCenter = { lat: pos.coords.latitude, lng: pos.coords.longitude };
			drawRadiusCircle(); refreshPOIMarkers();
		}, () => alert('Nie udało się pobrać lokalizacji.'), { enableHighAccuracy: true, timeout: 10000 });
	}
	let watchId: number | null = null;
	function toggleTracking() { isTracking ? stopTracking() : startTracking(); }
	function startTracking() {
		if (!browser || !navigator.geolocation) return;
		isTracking = true;
		watchId = navigator.geolocation.watchPosition((pos) => {
			updateUserMarker(Llib!, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
			if (map) map.panTo([pos.coords.latitude, pos.coords.longitude], { animate: true });
		}, () => {}, { enableHighAccuracy: true, maximumAge: 2000 });
	}
	function stopTracking() {
		isTracking = false;
		if (!browser) return;
		if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
	}
	function updateUserMarker(L: any, lat: number, lng: number, accuracy?: number) {
		if (!map) return;
		if (userMarker) map.removeLayer(userMarker);
		if (userAccuracyCircle) { map.removeLayer(userAccuracyCircle); userAccuracyCircle = null; }
		const userIcon = L.divIcon({ html: `<div class="user-marker">${dangerIcons.user}</div>`, className: 'custom-div-icon', iconSize: [34, 34], iconAnchor: [17, 17] });
		userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map).bindPopup(`
			<div style="text-align:center;padding:6px;"><strong>Twoja pozycja</strong><br>${accuracy ? `Dokładność: ${Math.round(accuracy)} m` : ''}</div>
		`);
		if (accuracy) {
			userAccuracyCircle = L.circle([lat, lng], { radius: accuracy, color: '#3388ff', fillColor: '#3388ff', fillOpacity: 0.15, weight: 2 }).addTo(map);
		}
	}
	function fitToPois() {
		if (!map || !poiLayer) return;
		const layers: any[] = []; poiLayer.eachLayer((l: any) => layers.push(l));
		if (!layers.length) return;
		const group = (Llib as any).featureGroup(layers); map.fitBounds(group.getBounds().pad(0.2));
	}

	// Reaktywne: po zmianie store odśwież markery
	$effect(() => { const pois = poiStore.pois; if (pois.length > 0 && map) refreshPOIMarkers(); });
</script>

<!-- FAB-y -->
<div class="fabs" role="toolbar" aria-label="Nawigacja">
	<button class="fab" onclick={() => locateUser()} aria-label="Zlokalizuj mnie">📍</button>
	<button class="fab" onclick={() => toggleTracking()} aria-pressed={isTracking} aria-label="Śledzenie">
		{isTracking ? '🟢' : '🛰️'}
	</button>
	<button class="fab" onclick={() => isSheetOpen = !isSheetOpen} aria-expanded={isSheetOpen} aria-controls="sheet" aria-label="Filtry">
		⚙️
	</button>
	<!-- NOWE: FAB do LEGENDY -->
	<button class="fab" onclick={() => isLegendOpen = !isLegendOpen} aria-expanded={isLegendOpen} aria-controls="legend-sheet" aria-label="Legenda zagrożeń">
		📘
	</button>
</div>

<!-- DOLNY SHEET: FILTRY -->
<div id="sheet" class="sheet {isSheetOpen ? 'open' : ''}" role="dialog" aria-modal="false" aria-label="Filtry i wyszukiwanie">
	<div class="sheet-handle" ontouchstart={() => isSheetOpen = !isSheetOpen} onclick={() => isSheetOpen = !isSheetOpen}></div>

	<div class="sheet-content">
		<div class="row">
			<input
				type="text"
				placeholder="Szukaj adresu / miejsca…"
				bind:value={searchQuery}
				oninput={onSearchInput}
				onfocus={() => showSuggestions = true}
				onblur={() => setTimeout(() => showSuggestions = false, 150)}
				aria-label="Pole wyszukiwania"
			/>
			<button class="btn" onclick={fetchSuggestions} aria-label="Szukaj">🔎</button>
		</div>

		{#if showSuggestions && searchResults.length}
		<ul class="suggestions" role="listbox" aria-label="Podpowiedzi">
			{#each searchResults as s}
				<li role="button" tabindex="0"
					onmousedown={() => chooseSuggestion(s)}
					onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && chooseSuggestion(s)}
				>{s.display_name}</li>
			{/each}
		</ul>
		{/if}

		<div class="row">
			<label for="minDanger">Min. zagrożenie: <strong>{minDanger}</strong></label>
			<input id="minDanger" type="range" min="0" max="10" step="1" bind:value={minDanger} onchange={refreshPOIMarkers} />
		</div>

		<div class="row">
			<label for="radius">Promień: <strong>{filterRadiusKm} km</strong></label>
			<input id="radius" type="range" min="0" max="15" step="0.5" bind:value={filterRadiusKm} oninput={drawRadiusCircle} onchange={refreshPOIMarkers} />
		</div>

		<div class="row tags">
			{#each allTypes as t}
				<label class="tag">
					<input type="checkbox" bind:checked={enabledTypes[t]} onchange={refreshPOIMarkers} aria-label={`Filtr typu ${t}`} />
					<span>{dangerIcons[t]} {t}</span>
				</label>
			{/each}
		</div>

		<div class="row buttons">
			<button class="btn secondary" onclick={fitToPois}>Dopasuj do POI</button>
			<button class="btn secondary" onclick={resetFilters}>Reset filtrów</button>
		</div>
	</div>
</div>

<!-- DOLNY SHEET: LEGENDA (NOWE) -->
<div id="legend-sheet" class="sheet legend {isLegendOpen ? 'open' : ''}" role="dialog" aria-modal="false" aria-label="Legenda zagrożeń">
	<div class="sheet-handle" ontouchstart={() => isLegendOpen = !isLegendOpen} onclick={() => isLegendOpen = !isLegendOpen}></div>

	<div class="sheet-content legend-content">
		<h3 class="legend-title">Legenda Zagrożeń</h3>

		<ul class="legend-list" aria-label="Typy miejsc">
			<li><span class="ico">🍷</span> Sklep monopolowy</li>
			<li><span class="ico">🎵</span> Klub nocny</li>
			<li><span class="ico">🍺</span> Pub/Bar</li>
			<li><span class="ico">🚨</span> Zgłoszenie policyjne</li>
			<li><span class="ico">⚠️</span> User-generated</li>
		</ul>

		<div class="legend-scale">
			<p>Skala niebezpieczeństwa:</p>
			<div class="scale-row">
				<span class="chip chip-low"></span><span class="lbl">1–6</span>
			</div>
			<div class="scale-row">
				<span class="chip chip-mid"></span><span class="lbl">7–8</span>
			</div>
			<div class="scale-row">
				<span class="chip chip-high"></span><span class="lbl">9–10</span>
			</div>
		</div>
	</div>
</div>

<!-- MAPA -->
<div class="map-wrapper">
	<div bind:this={mapContainer} class="map-container" aria-label="Mapa"></div>
</div>

<style lang="scss">
	/* pełny ekran na mobile + notch */
	.map-wrapper { width: 100%; height: 100dvh; position: relative; }
	.map-container { width: 100%; height: 100%; z-index: 1; touch-action: pan-x pan-y; }

	/* FABs */
	.fabs {
		position: fixed;
		right: max(12px, env(safe-area-inset-right));
		bottom: max(12px, env(safe-area-inset-bottom));
		display: flex; flex-direction: column; gap: 10px;
		z-index: 1200;
	}
	.fab {
		width: 56px; height: 56px; border-radius: 28px; border: none;
		background: #1a73e8; color: #fff; font-size: 22px; line-height: 56px;
		box-shadow: 0 6px 16px rgba(0,0,0,.25); cursor: pointer;
		display: grid; place-items: center;
	}
	.fab[aria-pressed="true"] { background: #0a8f39; }

	/* Bottom sheets – wspólna baza */
	.sheet {
		position: fixed; left: 0; right: 0;
		bottom: calc(-60vh + max(12px, env(safe-area-inset-bottom)) );
		height: 60vh; z-index: 1100;
		background: rgba(255,255,255,0.98);
		backdrop-filter: blur(6px);
		border-top-left-radius: 16px; border-top-right-radius: 16px;
		box-shadow: 0 -8px 24px rgba(0,0,0,.18);
		transition: transform .25s ease;
		transform: translateY(0);
		touch-action: manipulation;
	}
	.sheet.open { transform: translateY(-60vh); }
	@media (min-width: 768px) {
		.sheet { height: 45vh; bottom: calc(-45vh + max(16px, env(safe-area-inset-bottom))); }
		.sheet.open { transform: translateY(-45vh); }
	}
	.sheet-handle {
		width: 56px; height: 6px; border-radius: 3px; background: #c7c7c7;
		margin: 8px auto; cursor: pointer;
	}
	.sheet-content { padding: 8px 12px 12px; max-width: 720px; margin: 0 auto; }
	.sheet-content p { margin: 0; }

	/* LEGEND – styl */
	.legend-content { padding-top: 4px; }
	.legend-title {
		font-size: 16px; font-weight: 700; margin: 4px 0 10px;
		background: #e7f1ff; display: inline-flex; gap: 8px; align-items: center;
		padding: 6px 10px; border-radius: 10px;
	}
	.legend-list { list-style: none; margin: 0 0 12px 0; padding: 0; }
	.legend-list li { display: flex; align-items: center; gap: 10px; padding: 8px 6px; font-size: 15px; }
	.legend-list .ico { width: 22px; text-align: center; font-size: 18px; }

	.legend-scale .scale-row { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
	.legend-scale .chip { display: inline-block; width: 90px; height: 16px; border-radius: 6px; }
	.chip-low  { background: #dff3e3; border: 1px solid #b8e1c1; }
	.chip-mid  { background: #ffe9cc; border: 1px solid #ffd19b; }
	.chip-high { background: #ffd6d9; border: 1px solid #ffb3ba; }
	.legend-scale .lbl { font-size: 14px; color: #333; }

	/* Form / listy – duże hit-targety */
	.row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
	input[type="text"] {
		flex: 1; min-height: 44px; padding: 10px 12px; font-size: 16px;
		border: 1px solid #ddd; border-radius: 10px; outline: none;
	}
	input[type="text"]:focus { border-color: #999; }
	input[type="range"] { flex: 1; }

	.btn {
		min-height: 44px; padding: 0 14px; border-radius: 10px; border: none;
		background: #1a73e8; color: #fff; font-size: 15px; cursor: pointer;
	}
	.btn.secondary { background: #e0e0e0; color: #222; }

	.suggestions {
		width: 100%; max-height: 35vh; overflow: auto; list-style: none; margin: -2px 0 8px; padding: 0;
		border: 1px solid #e5e5e5; border-radius: 10px; background: #fff;
	}
	.suggestions li {
		padding: 12px; font-size: 15px; border-bottom: 1px solid #f0f0f0; cursor: pointer;
	}
	.suggestions li:last-child { border-bottom: none; }
	.suggestions li:active { background: #f5f9ff; }

	.tags { gap: 8px; }
	.tag {
		display: inline-flex; align-items: center; gap: 6px;
		background: #f7f7f7; border: 1px solid #eee; border-radius: 999px;
		padding: 8px 12px; font-size: 14px;
	}
	.tag input { accent-color: #1a73e8; width: 18px; height: 18px; }

	/* Leaflet ikony */
	:global(.custom-div-icon) { background: transparent !important; border: none !important; }
	:global(.user-marker) {
		font-size: 30px; filter: drop-shadow(0 2px 4px rgba(0,0,0,.3));
		animation: pulse 2s infinite;
	}
	:global(.danger-marker) {
		width: 44px; height: 44px; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.3);
		cursor: pointer; font-size: 26px;
	}
	:global(.danger-7), :global(.danger-8) { background: linear-gradient(135deg, #ffa500, #ff6b00); }
	:global(.danger-9), :global(.danger-10) { background: linear-gradient(135deg, #ff0000, #cc0000); }
	:global(.leaflet-popup-content-wrapper) { border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.2); }

	/* Preferencje dostępności */
	@media (prefers-reduced-motion: reduce) {
		* { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; }
	}

	/* Tryb ciemny */
	@media (prefers-color-scheme: dark) {
		.sheet { background: rgba(23,23,23,0.98); color: #eaeaea; }
		.sheet.legend .legend-title { background: #1b2a3b; }
		input[type="text"] { background: #141414; color: #eaeaea; border-color: #333; }
		.btn.secondary { background: #333; color: #eaeaea; }
		.suggestions { background: #141414; border-color: #333; }
		.suggestions li { border-bottom-color: #222; }
		.tag { background: #141414; border-color: #333; }
		.chip-low  { background: #173d2b; border-color: #236b47; }
		.chip-mid  { background: #4b3615; border-color: #7a5722; }
		.chip-high { background: #4a1d23; border-color: #7a2e38; }
	}
	/* Safe areas (notch) */
	.sheet-content { padding-bottom: calc(12px + env(safe-area-inset-bottom)); }
	.fab { padding-bottom: env(safe-area-inset-bottom); }
</style>
