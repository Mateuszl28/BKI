<script lang="ts">
	/**
	 * Rozbudowana mapa POI (Svelte)
	 * - Filtry: typy, min. poziom, promień
	 * - Auto-odświeżanie
	 * - Śledzenie pozycji
	 * - Heatmapa (leaflet.heat, opcjonalnie)
	 * - Klastrowanie (leaflet.markercluster, opcjonalnie — z gracją degraduje)
	 * - Szukaj miejsca (Nominatim)
	 * - Zapamiętywanie ustawień w localStorage
	 * - Eksport widocznych POI do GeoJSON
	 * - Skróty klawiszowe
	 */

	import { onMount, onDestroy } from 'svelte';
	import type L from 'leaflet';
	import { locationStore } from '$lib/stores/location.svelte';
	import { poiStore } from '$lib/stores/poi.svelte';
	import type { POI } from '$lib/types/poi';
	import { fetchPOIsNearby } from '$lib/utils/overpass';

	let mapContainer: HTMLDivElement;
	let map: L.Map | null = null;
	let lastRenderedPois: POI[] = [];


	let Lref: typeof import('leaflet') | null = null;

	// Warstwy
	let poiFeatureGroup: L.FeatureGroup | null = null;
	let poiLayerCurrent: L.Layer | null = null;
	let heatLayer: any | null = null;

	// Użytkownik
	let userMarker: L.Marker | null = null;
	let accuracyCircle: L.Circle | null = null;
	let geoWatchId: number | null = null;

	// Ustawienia (persist)
	let centerLat = 53.01809179200012;
	let centerLng = 18.607055641182555;
	let radiusKm = persisted('map.radiusKm', 3);
	let minDanger = persisted('map.minDanger', 7);
	let showHeatmap = persisted('map.showHeatmap', false);
	let useClusters = persisted('map.useClusters', true);
	let followUser = persisted('map.followUser', false);
	let autoRefresh = persisted('map.autoRefresh', 0); // s

	type POIType = 'monopolowy' | 'klub' | 'pub' | 'policja' | 'stacjabenzynowa';
	const allTypes: POIType[] = ['monopolowy', 'klub', 'pub', 'policja', 'stacjabenzynowa'];
	let selectedTypes = new Set<string>(persisted('map.selectedTypes', allTypes));

	// UI stany
	let isLoading = false;
	let errorMsg: string | null = null;
	let searchQuery = '';
	let searchResults: Array<{ display_name: string; lat: string; lon: string }> = [];
	let searching = false;

	// Ikony
	const dangerIcons: Record<string, string> = {
		monopolowy: '🍷',
		klub: '🎵',
		pub: '🍺',
		policja: '🚨',
		user: '📍',
		stacjabenzynowa: '⛽'
	};
	const typeLabels: Record<string, string> = {
		monopolowy: 'Sklep monopolowy',
		klub: 'Klub',
		pub: 'Pub',
		policja: 'Policja',
		stacjabenzynowa: 'Stacja benzynowa'
	};

	// Debounce
	function debounce<T extends (...args: any[]) => void>(fn: T, ms = 250) {
		let t: any;
		return (...args: Parameters<T>) => {
			clearTimeout(t);
			t = setTimeout(() => fn(...args), ms);
		};
	}
	const refreshPOIsDebounced = debounce(refreshPOIs, 250);
	const searchDebounced = debounce(performSearch, 400);

	// Persist helpers
	function persisted<T>(key: string, initial: T): T {
		if (typeof localStorage === 'undefined') return initial;
		try {
			const v = localStorage.getItem(key);
			if (v == null) return initial;
			return JSON.parse(v) as T;
		} catch {
			return initial;
		}
	}
	function save<T>(key: string, value: T) {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch {}
	}

	// Reakcje → zapis do localStorage
	$: save('map.radiusKm', radiusKm);
	$: save('map.minDanger', minDanger);
	$: save('map.showHeatmap', showHeatmap);
	$: save('map.useClusters', useClusters);
	$: save('map.followUser', followUser);
	$: save('map.autoRefresh', autoRefresh);
	$: save('map.selectedTypes', Array.from(selectedTypes));

	// Reakcje → logika mapy
	$: refreshPOIsDebounced();
	$: setupHeatmap();
	$: setupAutoRefresh();

	onMount(async () => {
		const L = await import('leaflet');
		await import('leaflet/dist/leaflet.css');
		Lref = L;

		map = L.map(mapContainer, {
			center: [centerLat, centerLng],
			zoom: 13,
			zoomControl: true,
			attributionControl: true
		});

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap contributors',
			maxZoom: 19
		}).addTo(map);

		poiFeatureGroup = L.featureGroup().addTo(map);

		// Kontekstowe menu: skopiuj współrzędne
		map.on('contextmenu', (e: any) => {
			const { lat, lng } = e.latlng;
			navigator.clipboard?.writeText(`${lat.toFixed(6)},${lng.toFixed(6)}`);
			toast('Skopiowano współrzędne do schowka');
		});

		// Interakcje wyłączają follow
		map.on('dragstart zoomstart', () => (followUser = false));

		// Skróty klawiszowe
		window.addEventListener('keydown', onKeyDown);

		// Start
		locationStore.startTracking?.();
		await refreshPOIs();
		setupAutoRefresh();
	});

	onDestroy(() => {
		locationStore.stopTracking?.();
		window.removeEventListener('keydown', onKeyDown);
		if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId);
		if (autoRefreshTimer) clearInterval(autoRefreshTimer);
		map?.remove();
		map = null;
	});

	// Auto-refresh
	let autoRefreshTimer: number | null = null;
	function setupAutoRefresh() {
		if (autoRefreshTimer) {
			clearInterval(autoRefreshTimer);
			autoRefreshTimer = null;
		}
		if (autoRefresh > 0) {
			autoRefreshTimer = window.setInterval(() => refreshPOIs(), autoRefresh * 1000);
		}
	}

	// Pobieranie i render
	async function refreshPOIs() {
		if (!map || !Lref) return;
		isLoading = true;
		errorMsg = null;

		try {
			const list = await fetchWithRetry(() => fetchPOIsNearby(centerLat, centerLng, radiusKm), 2, 600);
			poiStore.loadDemoData?.(list);

			const filtered = list.filter(
				(p) => selectedTypes.has(p.type) && (p.danger ?? 0) >= minDanger
			);

			await renderPOIs(filtered);

			if (poiFeatureGroup && (poiFeatureGroup as any).getLayers?.().length > 0 && !followUser) {
				const b = poiFeatureGroup.getBounds();
				if (b.isValid()) map!.fitBounds(b.pad(0.2));
			}
		} catch (e: any) {
			errorMsg = e?.message ?? 'Nie udało się pobrać POI.';
			console.error(e);
		} finally {
			isLoading = false;
		}
	}

	async function renderPOIs(pois: POI[]) {
		if (!map || !Lref || !poiFeatureGroup) return;

		// Usuń poprzednią warstwę
		if (poiLayerCurrent) {
			poiFeatureGroup.removeLayer(poiLayerCurrent);
			poiLayerCurrent = null;
		}

		// Warstwa docelowa
		let target: L.LayerGroup<any>;
		if (useClusters) {
			try {
				await import('leaflet.markercluster');
				await import('leaflet.markercluster/dist/MarkerCluster.Default.css');
				await import('leaflet.markercluster/dist/MarkerCluster.css');
				// @ts-ignore
				target = (Lref as any).markerClusterGroup({ chunkedLoading: true });
			} catch {
				console.warn('Brak leaflet.markercluster — używam zwykłej warstwy.');
				target = Lref.layerGroup();
				useClusters = false;
			}
		} else {
			target = Lref.layerGroup();
		}

		// Markery
		for (const poi of pois) {
			const icon = Lref.divIcon({
				html: `<div class="danger-marker danger-${poi.danger}">${dangerIcons[poi.type] ?? '📍'}</div>`,
				className: 'custom-div-icon',
				iconSize: [40, 40],
				iconAnchor: [20, 20]
			});

			const popup = `
				<div style="text-align:center; padding:10px; max-width:240px;">
					<h3 style="margin:0 0 8px 0; color:#d32f2f; font-size:16px;">${poi.name ?? 'POI'}</h3>
					<p style="margin:4px 0; font-size:14px;"><strong>Poziom:</strong> ${poi.danger ?? '—'}/10 🔴</p>
					${poi.description ? `<p style="margin:4px 0; font-size:13px; color:#666;"><em>${poi.description}</em></p>` : ''}
					${poi.address ? `<p style="margin:4px 0; font-size:12px;">${poi.address}</p>` : ''}
					<div style="margin-top:8px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
						<a href="https://www.google.com/maps?q=${poi.lat},${poi.lng}" target="_blank" rel="noopener">Mapy</a>
						<button class="mini-btn" data-lat="${poi.lat}" data-lng="${poi.lng}">Skopiuj</button>
						<button class="mini-btn" data-zoom="${poi.lat},${poi.lng}">Powiększ</button>
					</div>
				</div>
			`;

			const marker = Lref.marker([poi.lat, poi.lng], { icon }).bindPopup(popup);
			marker.on('popupopen', () => {
				// Delegacja do przycisków w popupie
				const el = (marker as any)._popup?._contentNode as HTMLElement | undefined;
				if (!el) return;

				el.querySelectorAll('button.mini-btn').forEach((btn) => {
					btn.addEventListener('click', (ev) => {
						const t = ev.currentTarget as HTMLButtonElement;
						if (t.dataset.lat && t.dataset.lng) {
							navigator.clipboard?.writeText(`${t.dataset.lat},${t.dataset.lng}`);
							toast('Skopiowano współrzędne');
						}
						if (t.dataset.zoom) {
							const [la, ln] = t.dataset.zoom.split(',').map(Number);
							map?.setView([la, ln], Math.max(map?.getZoom() ?? 13, 17), { animate: true });
						}
					});
				});
			});

			target.addLayer(marker);
		}

		poiLayerCurrent = target;
		poiFeatureGroup.addLayer(target);

		// Heatmapa
		if (showHeatmap) addOrUpdateHeatmap(pois);
		else removeHeatmap();
	}

	async function addOrUpdateHeatmap(pois: POI[]) {
		if (!map || !Lref) return;
		if (!('heatLayer' in (Lref as any))) {
			try {
				await import('leaflet.heat');
			} catch {
				console.warn('Brak leaflet.heat — wyłączam heatmapę.');
				showHeatmap = false;
				return;
			}
		}
		const points = pois.map((p) => [p.lat, p.lng, Math.max(0.25, (p.danger ?? 1) / 10)]);
		if (heatLayer) heatLayer.setLatLngs(points);
		else heatLayer = (Lref as any).heatLayer(points, { radius: 25, blur: 15, maxZoom: 17 }).addTo(map);
	}

	function removeHeatmap() {
		if (map && heatLayer) {
			map.removeLayer(heatLayer);
			heatLayer = null;
		}
	}

	// Geolokalizacja
	function updateUserMarker(L: typeof import('leaflet'), lat: number, lng: number, accuracy?: number) {
		if (!map) return;
		if (userMarker) map.removeLayer(userMarker);
		if (accuracyCircle) map.removeLayer(accuracyCircle);

		const userIcon = L.divIcon({
			html: `<div class="user-marker">${dangerIcons.user}</div>`,
			className: 'custom-div-icon',
			iconSize: [30, 30],
			iconAnchor: [15, 15]
		});

		userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map).bindPopup(`
			<div style="text-align:center; padding:5px;">
				<strong>Jesteś tutaj!</strong><br>
				${accuracy ? `Dokładność: ${Math.round(accuracy)} m` : ''}
			</div>
		`);

		if (accuracy) {
			accuracyCircle = L.circle([lat, lng], {
				radius: accuracy,
				color: '#3388ff',
				fillColor: '#3388ff',
				fillOpacity: 0.15,
				weight: 2
			}).addTo(map);
		}
	}

	function locateUser() {
		if (!Lref) return;
		if (!('geolocation' in navigator)) {
			errorMsg = 'Przeglądarka nie obsługuje geolokalizacji.';
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				const { latitude, longitude, accuracy } = pos.coords;
				centerLat = latitude;
				centerLng = longitude;
				updateUserMarker(Lref!, latitude, longitude, accuracy);
				map?.setView([latitude, longitude], 15, { animate: true });
			},
			(err) => (errorMsg = `Błąd geolokalizacji: ${err.message}`),
			{ enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
		);
	}

	function toggleFollow() {
		if (!('geolocation' in navigator) || !Lref) {
			errorMsg = 'Śledzenie wymaga geolokalizacji.';
			followUser = false;
			return;
		}
		if (followUser) {
			geoWatchId = navigator.geolocation.watchPosition(
				(pos) => {
					const { latitude, longitude, accuracy } = pos.coords;
					updateUserMarker(Lref!, latitude, longitude, accuracy);
					map?.setView([latitude, longitude]);
				},
				(err) => {
					errorMsg = `Błąd śledzenia: ${err.message}`;
					followUser = false;
				},
				{ enableHighAccuracy: true, maximumAge: 5000 }
			);
		} else {
			if (geoWatchId !== null) {
				navigator.geolocation.clearWatch(geoWatchId);
				geoWatchId = null;
			}
		}
	}

	// Nominatim (proste geokodowanie)
	async function performSearch() {
		if (!searchQuery.trim()) {
			searchResults = [];
			return;
		}
		searching = true;
		try {
			const url = new URL('https://nominatim.openstreetmap.org/search');
			url.searchParams.set('q', searchQuery);
			url.searchParams.set('format', 'json');
			url.searchParams.set('limit', '5');
			url.searchParams.set('addressdetails', '0');
			const res = await fetch(url.toString(), {
				headers: { 'Accept-Language': 'pl', 'User-Agent': 'BKI-Map/1.0' }
			});
			searchResults = res.ok ? await res.json() : [];
		} catch {
			searchResults = [];
		} finally {
			searching = false;
		}
	}

	function flyToResult(r: { lat: string; lon: string }) {
		const lat = parseFloat(r.lat);
		const lng = parseFloat(r.lon);
		centerLat = lat;
		centerLng = lng;
		map?.flyTo([lat, lng], 14, { animate: true });
		searchResults = [];
	}

	// Eksport widocznych POI do GeoJSON (na podstawie renderowanej warstwy)
	function exportVisibleGeoJSON() {
		if (!poiLayerCurrent || !Lref) return;
		const features: any[] = [];
		// Obsługa clusterów i zwykłej warstwy
		const collect = (layer: any) => {
			if (!layer) return;
			if (layer.getLayers) {
				layer.getLayers().forEach(collect);
				return;
			}
			if (layer.getLatLng) {
				const { lat, lng } = layer.getLatLng();
				features.push({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: [lng, lat] },
					properties: {}
				});
			}
		};
		collect(poiLayerCurrent);

		const geojson = { type: 'FeatureCollection', features };
		const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'poi-visible.geojson';
		a.click();
		URL.revokeObjectURL(url);
	}

	// Utility
	function fetchWithRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 500): Promise<T> {
		return fn().catch((e) => {
			if (retries <= 0) throw e;
			return new Promise<T>((resolve, reject) =>
				setTimeout(() => fetchWithRetry(fn, retries - 1, delayMs).then(resolve, reject), delayMs)
			);
		});
	}

	let toastTimer: number | null = null;
	function toast(msg: string) {
		const el = document.querySelector('.toast') as HTMLDivElement | null;
		if (!el) return;
		el.textContent = msg;
		el.classList.add('show');
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => el.classList.remove('show'), 1600);
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.ctrlKey && e.key.toLowerCase() === 'f') {
			// Ctrl+F → focus szukajki
			e.preventDefault();
			(document.getElementById('search') as HTMLInputElement | null)?.focus();
		}
		if (e.key === 'h') showHeatmap = !showHeatmap;   // H
		if (e.key === 'c') useClusters = !useClusters;   // C
		if (e.key === 'l') locateUser();                 // L
	}
	// Handlery UI
	function onTypeToggle(type: string) {
		if (selectedTypes.has(type)) selectedTypes.delete(type);
		else selectedTypes.add(type);
		selectedTypes = new Set(selectedTypes);
	}
	function onRadiusChange(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		radiusKm = Math.max(0.5, Math.min(30, v));
	}
	function onDangerChange(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		minDanger = Math.max(1, Math.min(10, v));
	}
</script>

<div class="map-wrapper">
	<!-- Panel sterowania -->
	<div class="controls" role="region" aria-label="Filtry mapy">
		<div class="row search">
			<input id="search" class="search-input" type="text" placeholder="Szukaj miejsca (np. Toruń, ul. Mickiewicza)"
				bind:value={searchQuery} on:input={() => searchDebounced()} autocomplete="off" />
			<button class="btn" on:click={performSearch} disabled={searching}>{searching ? '...' : 'Szukaj'}</button>
		</div>
		{#if searchResults.length > 0}
			<ul class="search-results">
				{#each searchResults as r}
					<li><button on:click={() => flyToResult(r)}>{r.display_name}</button></li>
				{/each}
			</ul>
		{/if}

		<div class="row">
			<label class="label">Promień: <strong>{radiusKm} km</strong></label>
			<input type="range" min="0.5" max="30" step="0.5" bind:value={radiusKm} on:input={onRadiusChange} />
		</div>

		<div class="row">
			<label class="label">Min. poziom: <strong>{minDanger}</strong></label>
			<input type="range" min="1" max="10" step="1" bind:value={minDanger} on:input={onDangerChange} />
		</div>

		<div class="row types">
			{#each allTypes as t}
				<label class="chip">
					<input type="checkbox" checked={selectedTypes.has(t)} on:change={() => onTypeToggle(t)} />
					<span class="chip-icon">{dangerIcons[t]}</span>
					<span>{typeLabels[t]}</span>
				</label>
			{/each}
		</div>

		<div class="row toggles">
			<label class="switch">
				<input type="checkbox" bind:checked={showHeatmap} />
				<span>Heatmapa (H)</span>
			</label>
			<label class="switch">
				<input type="checkbox" bind:checked={useClusters} />
				<span>Klastrowanie (C)</span>
			</label>
			<label class="switch">
				<input type="checkbox" bind:checked={followUser} on:change={toggleFollow} />
				<span>Śledź pozycję</span>
			</label>
			<div class="autorefresh">
				<label for="ar">Auto-odświeżanie</label>
				<select id="ar" bind:value={autoRefresh}>
					<option value="0">Wyłączone</option>
					<option value="15">co 15 s</option>
					<option value="30">co 30 s</option>
					<option value="60">co 60 s</option>
				</select>
			</div>
		</div>

		<div class="row actions">
			<button class="btn" on:click={refreshPOIs} disabled={isLoading}>
				{#if isLoading}⏳ Aktualizuję...{/if}
				{#if !isLoading}🔄 Odśwież{/if}
			</button>
			<button class="btn" on:click={locateUser}>📡 Zlokalizuj mnie (L)</button>
			<button class="btn" on:click={exportVisibleGeoJSON}>⬇️ Eksport GeoJSON</button>
		</div>

		{#if errorMsg}
			<div class="error" role="alert">⚠️ {errorMsg}</div>
		{/if}
	</div>

	<!-- Mapa -->
	<div bind:this={mapContainer} class="map-container" aria-label="Mapa POI"></div>

	<!-- Legenda / licznik -->
	<div class="legend">
		<div class="legend-row">
			<span class="dot dot-high"></span> 9–10 (wysokie)
		</div>
		<div class="legend-row">
			<span class="dot dot-mid"></span> 7–8 (podwyższone)
		</div>
		<div class="legend-row count" aria-live="polite">
			Znaczników: {poiFeatureGroup ? (poiFeatureGroup as any).getLayers?.().reduce((acc:number, l:any)=>acc+(l.getLayers?l.getLayers().length:1),0) : 0}
		</div>
	</div>

	<!-- Toast -->
	<div class="toast" aria-live="polite"></div>
</div>

<style lang="scss">
	.map-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
		display: grid;
		grid-template-columns: 360px 1fr;
		grid-template-rows: 1fr;
		gap: 12px;
		padding: 8px;
		box-sizing: border-box;

		@media (max-width: 980px) {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}
	}

	.map-container {
		width: 100%;
		height: 100%;
		border-radius: 12px;
		z-index: 1;
		grid-column: 2;
		grid-row: 1;

		@media (max-width: 980px) {
			grid-column: 1;
			grid-row: 2;
			min-height: 60vh;
		}
	}

	.controls {
		grid-column: 1;
		grid-row: 1;
		background: #fff;
		border-radius: 12px;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		z-index: 2;

		@media (max-width: 980px) {
			grid-column: 1;
			grid-row: 1;
		}
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;

		&.types {
			flex-wrap: wrap;
			align-items: stretch;
		}
		&.toggles {
			flex-wrap: wrap;
			gap: 16px;
		}
		&.actions {
			gap: 8px;
			flex-wrap: wrap;
		}
		&.search {
			gap: 8px;
		}
	}

	.label { min-width: 110px; font-weight: 600; }
	input[type="range"] { flex: 1; }

	.search-input {
		flex: 1;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 8px 10px;
	}

	.search-results {
		margin: -4px 0 6px 0;
		padding: 6px;
		border: 1px solid #eee;
		border-radius: 8px;
		max-height: 180px;
		overflow: auto;
		display: grid;
		gap: 4px;

		li { list-style: none; }
		button {
			width: 100%;
			text-align: left;
			padding: 6px 8px;
			border: 1px solid #f1f5f9;
			border-radius: 6px;
			background: #f8fafc;
			cursor: pointer;
		}
		button:hover { background: #eef2ff; }
	}

	.chip {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 6px 10px; border-radius: 999px;
		background: #f3f4f6; border: 1px solid #e5e7eb;
		cursor: pointer; user-select: none;

		input[type="checkbox"] { accent-color: #d32f2f; }
		.chip-icon { font-size: 18px; line-height: 1; }
	}

	.switch {
		display: inline-flex; align-items: center; gap: 8px;
		input[type="checkbox"] { accent-color: #0ea5e9; }
	}

	.autorefresh {
		margin-left: auto; display: inline-flex; align-items: center; gap: 8px;
	}

	.btn {
		background: #111827; color: #fff;
		border: none; border-radius: 10px;
		padding: 8px 12px; cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		transition: transform 0.12s ease, box-shadow 0.12s ease;

		&:disabled { opacity: .6; cursor: not-allowed; }
		&:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,0.25); }
	}

	.legend {
		position: absolute;
		right: 18px; bottom: 18px;
		background: #fff; border: 1px solid #e5e7eb;
		border-radius: 10px; padding: 8px 10px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.15);
		display: flex; flex-direction: column; gap: 6px; z-index: 3;

		.legend-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
		.legend-row.count { margin-top: 2px; font-weight: 600; }
		.dot { width: 12px; height: 12px; border-radius: 999px; display: inline-block; }
		.dot-high { background: linear-gradient(135deg, #ff0000, #cc0000); }
		.dot-mid { background: linear-gradient(135deg, #ffa500, #ff6b00); }
	}

	:global(.custom-div-icon) { background: transparent !important; border: none !important; }
	:global(.user-marker) {
		font-size: 30px; animation: pulse 2s infinite;
		filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
	}
	:global(.danger-marker) {
		width: 40px; height: 40px; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
		animation: bounce 2s infinite; cursor: pointer;
		transition: transform 0.2s; font-size: 24px;
		&:hover { transform: scale(1.12); }
	}
	:global(.danger-7), :global(.danger-8) { background: linear-gradient(135deg, #ffa500, #ff6b00); }
	:global(.danger-9), :global(.danger-10) { background: linear-gradient(135deg, #ff0000, #cc0000); }
	:global(.leaflet-popup-content-wrapper) {
		border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
	}
	.error {
		background: #fff1f2; color: #9f1239;
		border: 1px solid #fecdd3; border-radius: 10px; padding: 8px 10px;
	}

	/* popup mini buttons */
	:global(button.mini-btn) {
		background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px;
		padding: 4px 6px; cursor: pointer; font-size: 12px;
	}
	:global(button.mini-btn:hover) { background: #e5e7eb; }

	.toast {
		position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%);
		background: rgba(17,24,39,0.9); color: #fff; padding: 6px 10px;
		border-radius: 8px; opacity: 0; pointer-events: none; transition: opacity .2s ease;
		&.show { opacity: 1; }
	}

	@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
	@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
</style>
