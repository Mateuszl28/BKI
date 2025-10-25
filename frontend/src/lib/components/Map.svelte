<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type L from 'leaflet';
	import { locationStore } from '$lib/stores/location.svelte';
	import { poiStore } from '$lib/stores/poi.svelte';
	import type { POI } from '$lib/types/poi';
	// ❌ usunięto import fetchPOIsNearby — używamy lokalnej funkcji z retry
	// import { fetchPOIsNearby } from '$lib/utils/overpass';

	let mapContainer: HTMLDivElement;
	let map: L.Map | null = null;
	let userMarker: L.Marker | null = null;
	let userAccuracyCircle: L.Circle | null = null;
	let poiLayer: L.LayerGroup | null = null;
	let radiusCircle: L.Circle | null = null;

	let isTracking = false;
	let searchQuery = '';
	let searchResults: Array<{ display_name: string; lat: string; lon: string }> = [];
	let showSuggestions = false;

	// Filtrowanie
	const allTypes = ['monopolowy', 'klub', 'pub', 'policja', 'stacjabenzynowa'] as const;
	type PoiType = typeof allTypes[number];
	let enabledTypes: Record<PoiType, boolean> = {
		monopolowy: true,
		klub: true,
		pub: true,
		policja: true,
		stacjabenzynowa: true
	};
	let minDanger = 7;     // minimalny poziom zagrożenia
	let filterRadiusKm = 3; // promień filtrowania w km
	let filterCenter: { lat: number; lng: number } | null = null;

	// Ikony emoji dla typów
	const dangerIcons: Record<PoiType | 'user', string> = {
		monopolowy: '🍷',
		klub: '🎵',
		pub: '🍺',
		policja: '🚨',
		stacjabenzynowa: '⛽',
		user: '📍'
	};

	const DEFAULT_VIEW = {
		lat: 53.01812167,
		lng: 18.60666329,
		zoom: 13
	};

	function saveView() {
		if (!map) return;
		const c = map.getCenter();
		localStorage.setItem('map:view', JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
	}
	function loadView() {
		try {
			const raw = localStorage.getItem('map:view');
			if (!raw) return DEFAULT_VIEW;
			const parsed = JSON.parse(raw);
			return { lat: parsed.lat ?? DEFAULT_VIEW.lat, lng: parsed.lng ?? DEFAULT_VIEW.lng, zoom: parsed.zoom ?? DEFAULT_VIEW.zoom };
		} catch {
			return DEFAULT_VIEW;
		}
	}

	let Llib: typeof import('leaflet') | null = null;

	// ===== Overpass: lokalny fetch z retry i zapasowymi węzłami =====
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
					method: 'POST',
					mode: 'cors',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
					body: `data=${encodeURIComponent(body)}`,
					signal: ctrl.signal
				});
				clearTimeout(t);
				if (res.ok) return await res.json();
				// 429/5xx – poczekaj i spróbuj ponownie / inny węzeł
				await new Promise(r => setTimeout(r, 500 + i * 800));
			} catch {
				clearTimeout(t);
				await new Promise(r => setTimeout(r, 500 + i * 800));
			}
		}
		throw new Error('Overpass unavailable');
	}

	async function fetchPOIsNearbyLocal(lat: number, lng: number, radiusKm: number): Promise<OverpassPOI[]> {
		const endpoints = [
			'https://overpass-api.de/api/interpreter',
			'https://overpass.kumi.systems/api/interpreter',
			'https://overpass.openstreetmap.ru/api/interpreter'
		];

		const radius = Math.max(100, Math.floor(radiusKm * 1000)); // m
		const q = `
			[out:json][timeout:25];
			(
				node(around:${radius},${lat},${lng})["shop"="alcohol"];
				node(around:${radius},${lat},${lng})["amenity"="nightclub"];
				node(around:${radius},${lat},${lng})["amenity"="pub"];
				node(around:${radius},${lat},${lng})["amenity"="police"];
				node(around:${radius},${lat},${lng})["amenity"="fuel"];
			);
			out center tags;
		`.trim();

		let json: any = null;
		let lastErr: any = null;
		for (const ep of endpoints) {
			try {
				json = await fetchJSON(ep, q, 2);
				if (json) break;
			} catch (e) { lastErr = e; }
		}
		if (!json) throw lastErr ?? new Error('No Overpass response');

		const elements = json.elements || [];

		const mapType = (tags: any): OverpassPOI['type'] => {
			if (tags.shop === 'alcohol') return 'monopolowy';
			if (tags.amenity === 'nightclub') return 'klub';
			if (tags.amenity === 'pub') return 'pub';
			if (tags.amenity === 'police') return 'policja';
			return 'stacjabenzynowa'; // amenity=fuel
		};

		return elements
			.filter((e: any) => (e.lat && e.lon && e.tags))
			.map((e: any) => {
				const t = e.tags || {};
				const name = t.name || 'Miejsce';
				const addr = [t['addr:street'], t['addr:housenumber'], t['addr:city']].filter(Boolean).join(' ') || '';
				// prosta demo heurystyka danger; podmień na swój atrybut jeśli masz
				const danger = t.amenity === 'police' ? 7 : (t.amenity === 'nightclub' ? 9 : (t.shop === 'alcohol' ? 8 : 7));
				return {
					lat: e.lat, lng: e.lon,
					name, address: addr,
					type: mapType(t),
					danger,
					description: t.operator || t.brand || ''
				} as OverpassPOI;
			});
	}

	// ===== Nominatim: bez User-Agent, z &email, miękkie błędy =====
	let searchDebounce: number | undefined;

	function onSearchInput() {
		showSuggestions = true;
		clearTimeout(searchDebounce);
		searchDebounce = window.setTimeout(fetchSuggestions, 300);
	}

	async function fetchSuggestions() {
		if (!searchQuery?.trim()) { searchResults = []; return; }
		try {
			const url =
				`https://nominatim.openstreetmap.org/search?` +
				`q=${encodeURIComponent(searchQuery)}` +
				`&format=json&addressdetails=0&limit=5&namedetails=0` +
				`&accept-language=pl&email=test@example.com`;

			const res = await fetch(url, {
				method: 'GET',
				mode: 'cors',
				headers: { 'Accept': 'application/json' } // bez User-Agent
			});

			if (!res.ok) {
				console.warn('Nominatim HTTP', res.status, res.statusText);
				searchResults = [];
				return;
			}
			searchResults = await res.json();
		} catch (e) {
			console.warn('Geocode error', e);
			searchResults = [];
		}
	}

	function chooseSuggestion(item: { lat: string; lon: string; display_name: string }) {
		searchQuery = item.display_name;
		showSuggestions = false;
		jumpTo(parseFloat(item.lat), parseFloat(item.lon));
	}

	function jumpTo(lat: number, lng: number) {
		if (!map) return;
		map.setView([lat, lng], 16);
		filterCenter = { lat, lng };
		drawRadiusCircle();
		refreshPOIMarkers();
	}

	// ===== Inicjalizacja mapy =====
	onMount(async () => {
		Llib = await import('leaflet');
		await import('leaflet/dist/leaflet.css');

		const L = Llib!;
		const view = loadView();

		map = L.map(mapContainer, {
			center: [view.lat, view.lng],
			zoom: view.zoom,
			zoomControl: true,
			attributionControl: true
		});

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap contributors',
			maxZoom: 19
		}).addTo(map);

		L.control.scale({ metric: true }).addTo(map);
		poiLayer = L.layerGroup().addTo(map);

		// Załaduj POI z Overpass (miękki fallback)
		const seedLat = 53.01809179200012;
		const seedLng = 18.607055641182555;

		let newPOIs: POI[] = [];
		try {
			const items = await fetchPOIsNearbyLocal(seedLat, seedLng, 3);
			newPOIs = items as unknown as POI[];
		} catch (e) {
			console.warn('Overpass error:', e);
			newPOIs = [];
		}
		poiStore.loadDemoData(newPOIs);

		// Promień filtracji startowo na środku widoku
		filterCenter = { lat: view.lat, lng: view.lng };
		drawRadiusCircle();

		map.on('moveend zoomend', saveView);

		// Klik w mapę: ustaw centrum filtra
		map.on('click', (e: any) => {
			filterCenter = { lat: e.latlng.lat, lng: e.latlng.lng };
			drawRadiusCircle();
			refreshPOIMarkers();
		});

		// Skróty klawiszowe
		window.addEventListener('keydown', onKey);

		refreshPOIMarkers();
	});

	function onKey(e: KeyboardEvent) {
		if (!map) return;
		if (e.key.toLowerCase() === 'l') locateUser();
		if (e.key.toLowerCase() === 'f') fitToPois();
		if (e.key.toLowerCase() === 'r') { resetFilters(); }
	}

	function resetFilters() {
		minDanger = 7;
		filterRadiusKm = 3;
		enabledTypes = { monopolowy: true, klub: true, pub: true, policja: true, stacjabenzynowa: true };
		if (map) {
			const c = map.getCenter();
			filterCenter = { lat: c.lat, lng: c.lng };
		}
		drawRadiusCircle();
		refreshPOIMarkers();
	}

	function drawRadiusCircle() {
		const L = Llib!;
		if (!map || !filterCenter) return;
		if (radiusCircle) {
			radiusCircle.setLatLng([filterCenter.lat, filterCenter.lng]);
			radiusCircle.setRadius(filterRadiusKm * 1000);
		} else {
			radiusCircle = L.circle([filterCenter.lat, filterCenter.lng], {
				radius: filterRadiusKm * 1000,
				color: '#ff5722',
				fillColor: '#ff5722',
				fillOpacity: 0.08,
				weight: 2,
				dashArray: '4 6'
			}).addTo(map);
		}
	}

	// Haversine (m)
	function distanceMeters(a: {lat: number; lng: number}, b: {lat: number; lng: number}) {
		const R = 6371e3;
		const φ1 = a.lat * Math.PI/180, φ2 = b.lat * Math.PI/180;
		const Δφ = (b.lat-a.lat) * Math.PI/180;
		const Δλ = (b.lng-a.lng) * Math.PI/180;
		const s = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
		return 2*R*Math.asin(Math.sqrt(s));
	}

	function refreshPOIMarkers() {
		try {
			const L = Llib!;
			if (!map || !poiLayer) return;

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
					className: 'custom-div-icon',
					iconSize: [40, 40],
					iconAnchor: [20, 20]
				});

				const navUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${poi.lat}%2C${poi.lng}`;
				const copyBtnId = `copy-${poi.lat.toFixed(5)}-${poi.lng.toFixed(5)}`.replace(/[^\w-]/g, '');

				const popupContent = `
					<div style="text-align:center;padding:10px;min-width:200px">
						<h3 style="margin:0 0 8px 0;color:#d32f2f;font-size:16px;">${poi.name ?? 'Miejsce'}</h3>
						<p style="margin:4px 0;font-size:14px;"><strong>Poziom:</strong> ${poi.danger ?? '?'} / 10 🔴</p>
						${poi.description ? `<p style="margin:5px 0;font-size:13px;color:#666;"><em>${poi.description}</em></p>` : ''}
						${poi.address ? `<p style="margin:5px 0;font-size:12px;">${poi.address}</p>` : ''}
						<p style="margin:8px 0 0 0;font-size:12px;">
							<a href="${navUrl}" target="_blank" rel="noopener">Nawiguj ↗</a> •
							<a id="${copyBtnId}" href="#" data-lat="${poi.lat}" data-lng="${poi.lng}">Kopiuj współrzędne</a>
						</p>
					</div>
				`;

				const m = L.marker([poi.lat, poi.lng], { icon }).bindPopup(popupContent);
				m.on('popupopen', () => {
					setTimeout(() => {
						const el = document.getElementById(copyBtnId);
						if (el) {
							el.addEventListener('click', (ev) => {
								ev.preventDefault();
								const lat = el.getAttribute('data-lat');
								const lng = el.getAttribute('data-lng');
								navigator.clipboard?.writeText(`${lat},${lng}`);
								el.textContent = 'Skopiowano!';
								setTimeout(() => (el.textContent = 'Kopiuj współrzędne'), 1200);
							}, { once: true });
						}
					}, 0);
				});

				m.addTo(poiLayer);
				markers.push(m);
			}

			// Jeżeli włączone śledzenie — nie ruszaj widoku; inaczej dopasuj przy pierwszym odświeżeniu
			if (markers.length && map && !isTracking) {
				const g = L.featureGroup(markers);
				map.fitBounds(g.getBounds().pad(0.2));
			}
		} catch (e) {
			console.warn('refreshPOIMarkers error', e);
		}
	}

	async function locateUser() {
		const L = Llib!;
		if (!map) return;
		if (!navigator.geolocation) {
			alert('Geolokalizacja niedostępna w tej przeglądarce.');
			return;
		}
		navigator.geolocation.getCurrentPosition((pos) => {
			updateUserMarker(L, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
			map!.setView([pos.coords.latitude, pos.coords.longitude], Math.max(15, map!.getZoom()));
			filterCenter = { lat: pos.coords.latitude, lng: pos.coords.longitude };
			drawRadiusCircle();
			refreshPOIMarkers();
		}, (err) => {
			console.warn(err);
			alert('Nie udało się pobrać lokalizacji.');
		}, { enableHighAccuracy: true, timeout: 10000 });
	}

	let watchId: number | null = null;
	function toggleTracking() { if (isTracking) stopTracking(); else startTracking(); }
	function startTracking() {
		if (!navigator.geolocation) return;
		isTracking = true;
		watchId = navigator.geolocation.watchPosition((pos) => {
			updateUserMarker(Llib!, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
			if (map) map.panTo([pos.coords.latitude, pos.coords.longitude], { animate: true });
		}, () => {}, { enableHighAccuracy: true, maximumAge: 2000 });
	}
	function stopTracking() {
		isTracking = false;
		if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
	}

	function updateUserMarker(L: any, lat: number, lng: number, accuracy?: number) {
		if (!map) return;
		if (userMarker) map.removeLayer(userMarker);
		if (userAccuracyCircle) {
			map.removeLayer(userAccuracyCircle);
			userAccuracyCircle = null;
		}

		const userIcon = L.divIcon({
			html: `<div class="user-marker">${dangerIcons.user}</div>`,
			className: 'custom-div-icon',
			iconSize: [30, 30],
			iconAnchor: [15, 15]
		});

		userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map).bindPopup(`
			<div style="text-align:center;padding:5px;">
				<strong>Twoja pozycja</strong><br>
				${accuracy ? `Dokładność: ${Math.round(accuracy)} m` : ''}
			</div>
		`);

		if (accuracy) {
			userAccuracyCircle = L.circle([lat, lng], {
				radius: accuracy,
				color: '#3388ff',
				fillColor: '#3388ff',
				fillOpacity: 0.15,
				weight: 2
			}).addTo(map);
		}
	}

	function fitToPois() {
		if (!map || !poiLayer) return;
		const layers: any[] = [];
		poiLayer.eachLayer((l: any) => layers.push(l));
		if (!layers.length) return;
		const group = (Llib as any).featureGroup(layers);
		map.fitBounds(group.getBounds().pad(0.2));
	}

	// Reaktywne odświeżenia
	$effect(() => {
		const pois = poiStore.pois;
		if (pois.length > 0 && map) {
			refreshPOIMarkers();
		}
	});

	onDestroy(() => {
		locationStore.stopTracking?.();
		window.removeEventListener('keydown', onKey);
		if (map) { map.remove(); map = null; }
	});
</script>

<!-- PANEL KONTROLNY -->
<div class="controls">
	<div class="row">
		<input
			type="text"
			placeholder="Szukaj adresu / miejsca…"
			bind:value={searchQuery}
			on:input={onSearchInput}
			on:focus={() => showSuggestions = true}
			on:blur={() => setTimeout(() => showSuggestions = false, 150)}
		/>
		<button class="btn" on:click={fetchSuggestions}>Szukaj</button>
		<button class="btn" on:click={() => locateUser()}>Lokalizuj (L)</button>
		<button class="btn" on:click={() => toggleTracking()}>{isTracking ? 'Wyłącz śledzenie' : 'Włącz śledzenie'}</button>
	</div>

	{#if showSuggestions && searchResults.length}
	<ul class="suggestions">
		{#each searchResults as s}
			<li on:mousedown={() => chooseSuggestion(s)}>{s.display_name}</li>
		{/each}
	</ul>
	{/if}

	<div class="row">
		<label>Min. zagrożenie: <strong>{minDanger}</strong></label>
		<input type="range" min="0" max="10" step="1" bind:value={minDanger} on:change={refreshPOIMarkers} />
	</div>

	<div class="row">
		<label>Promień: <strong>{filterRadiusKm} km</strong></label>
		<input type="range" min="0" max="10" step="0.5" bind:value={filterRadiusKm} on:input={drawRadiusCircle} on:change={refreshPOIMarkers} />
	</div>

	<div class="row tags">
		{#each allTypes as t}
			<label class="tag">
				<input type="checkbox" bind:checked={enabledTypes[t]} on:change={refreshPOIMarkers} />
				<span>{dangerIcons[t]} {t}</span>
			</label>
		{/each}
	</div>

	<div class="row">
		<button class="btn secondary" on:click={fitToPois}>Dopasuj do POI (F)</button>
		<button class="btn secondary" on:click={resetFilters}>Reset filtrów (R)</button>
	</div>

	<p class="hint">Wskazówka: kliknij na mapie, aby przenieść centrum filtra (pomarańczowy okrąg).</p>
</div>

<div class="map-wrapper">
	<div bind:this={mapContainer} class="map-container"></div>
</div>

<style lang="scss">
	.map-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.map-container {
		width: 100%;
		height: 100%;
		border-radius: 0;
		z-index: 1;
	}

	/* PANEL */
	.controls {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 1000;
		background: rgba(255,255,255,0.94);
		backdrop-filter: blur(3px);
		border-radius: 12px;
		box-shadow: 0 4px 16px rgba(0,0,0,0.15);
		padding: 10px 12px;
		min-width: 320px;
		max-width: min(92vw, 520px);
		font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
	}

	.controls .row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
	.controls input[type="text"] {
		flex: 1;
		padding: 8px 10px;
		border: 1px solid #ddd;
		border-radius: 8px;
		font-size: 14px;
		outline: none;
	}
	.controls input[type="text"]:focus { border-color: #999; }
	.controls input[type="range"] { flex: 1; }
	.controls label { font-size: 13px; color: #333; }

	.controls .btn {
		padding: 8px 10px;
		border-radius: 8px;
		border: none;
		background: #1a73e8;
		color: #fff;
		cursor: pointer;
		font-size: 13px;
		transition: transform .06s ease, box-shadow .2s ease;
		box-shadow: 0 2px 8px rgba(26,115,232,.25);
		white-space: nowrap;
	}
	.controls .btn:hover { transform: translateY(-1px); }
	.controls .btn.secondary { background: #e0e0e0; color: #222; box-shadow: none; }
	.controls .hint { margin: 6px 2px 0; font-size: 12px; color: #666; }

	.suggestions {
		margin: -4px 0 8px;
		padding: 4px;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		background: #fff;
		max-height: 220px;
		overflow: auto;
		list-style: none;
	}
	.suggestions li {
		padding: 6px 8px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 13px;
	}
	.suggestions li:hover { background: #f2f6ff; }

	.tags { gap: 10px; }
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: #f7f7f7;
		border: 1px solid #eee;
		border-radius: 999px;
		padding: 4px 10px;
		font-size: 13px;
		transition: background .2s ease;
	}
	.tag:hover { background: #efefef; }
	.tag input { accent-color: #1a73e8; }

	:global(.custom-div-icon) {
		background: transparent !important;
		border: none !important;
	}

	:global(.user-marker) {
		font-size: 30px;
		animation: pulse 2s infinite;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
	}

	:global(.danger-marker) {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 3px solid #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		animation: bounce 2s infinite;
		cursor: pointer;
		transition: transform 0.2s;
		font-size: 24px;

		&:hover { transform: scale(1.2); }
	}

	:global(.danger-7),
	:global(.danger-8) {
		background: linear-gradient(135deg, #ffa500, #ff6b00);
	}

	:global(.danger-9),
	:global(.danger-10) {
		background: linear-gradient(135deg, #ff0000, #cc0000);
	}

	:global(.leaflet-popup-content-wrapper) {
		border-radius: 12px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	@keyframes pulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.1); }
	}

	@keyframes bounce {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-5px); }
	}
</style>
