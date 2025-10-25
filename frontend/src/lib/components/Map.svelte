<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type L from 'leaflet';
	import { locationStore } from '$lib/stores/location.svelte';
	import { poiStore } from '$lib/stores/poi.svelte';
	import type { POI } from '$lib/types/poi';
	import { fetchPOIsNearby } from '$lib/utils/overpass';

	let mapContainer: HTMLDivElement;
	let map: L.Map | null = null;

	let userMarker: L.Marker | null = null;
	let accuracyCircle: L.Circle | null = null;

	let Lref: typeof import('leaflet') | null = null;

	// Warstwy POI
	let poiFeatureGroup: L.FeatureGroup | null = null; // dla getBounds()
	let poiLayerCurrent: L.Layer | null = null; // tu wkładamy albo layerGroup, albo markerClusterGroup
	let heatLayer: any | null = null; // typ z leaflet.heat

	// UI – stan
	let isLoading = false;
	let errorMsg: string | null = null;

	// Domyślne centrum
	let centerLat = 53.01809179200012;
	let centerLng = 18.607055641182555;

	// Kontrolki
	let radiusKm = 3; // promień wyszukiwania w km
	let minDanger = 7;
	let followUser = false;
	let showHeatmap = false;
	let useClusters = true;
	let autoRefresh = 0; // sekundy; 0 = wyłączone
	let autoRefreshTimer: number | null = null;

	// Typy
	type POIType = 'monopolowy' | 'klub' | 'pub' | 'policja' | 'stacjabenzynowa';
	const allTypes: POIType[] = ['monopolowy', 'klub', 'pub', 'policja', 'stacjabenzynowa'];
	let selectedTypes = new Set<string>(allTypes);

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

	onMount(async () => {
		// Leaflet tylko po stronie klienta
		const L = await import('leaflet');
		await import('leaflet/dist/leaflet.css');
		Lref = L;

		// Inicjalizacja mapy
		map = L.map(mapContainer, {
			center: [centerLat, centerLng],
			zoom: 13,
			zoomControl: true,
			attributionControl: true
		});

		// OSM tiles
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap contributors',
			maxZoom: 19
		}).addTo(map);

		// Kontener na POI
		poiFeatureGroup = L.featureGroup().addTo(map);

		// Pierwsze pobranie
		await refreshPOIs();

		// Śledzenie pozycji ze store (opcjonalnie)
		locationStore.startTracking?.();

		// Ruch na mapie wyłącza follow
		map.on('dragstart zoomstart', () => {
			followUser = false;
		});

		setupAutoRefresh();
	});

	onDestroy(() => {
		locationStore.stopTracking?.();
		if (autoRefreshTimer) {
			clearInterval(autoRefreshTimer);
			autoRefreshTimer = null;
		}
		if (map) {
			map.remove();
			map = null;
		}
	});

	// Reakcje na zmiany
	$: refreshPOIsDebounced(); // filtrowanie / promień / typy / itp.
	$: setupHeatmap();
	$: setupAutoRefresh();

	// ————— Funkcje główne —————
	async function refreshPOIs() {
		if (!map || !Lref) return;
		isLoading = true;
		errorMsg = null;

		try {
			// Pobierz z Overpassa
			const data = await fetchPOIsNearby(centerLat, centerLng, radiusKm);
			poiStore.loadDemoData?.(data);

			// Filtrowanie
			const filtered = data.filter(
				(p) => selectedTypes.has(p.type) && (p.danger ?? 0) >= minDanger
			);

			// Render
			await renderPOIs(filtered);

			// Dopasuj widok
			if (poiFeatureGroup && (poiFeatureGroup as any).getLayers?.().length > 0 && !followUser) {
				const bounds = poiFeatureGroup.getBounds();
				if (bounds.isValid()) map!.fitBounds(bounds.pad(0.2));
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

		// Usuń starą warstwę znaczników z kontenera
		if (poiLayerCurrent) {
			poiFeatureGroup.removeLayer(poiLayerCurrent);
			poiLayerCurrent = null;
		}

		// Tworzymy warstwę: cluster lub zwykła
		let targetLayer: L.LayerGroup<any>;
		if (useClusters) {
			// próbujemy dynamicznie doładować markercluster
			try {
				await import('leaflet.markercluster');
				await import('leaflet.markercluster/dist/MarkerCluster.Default.css');
				await import('leaflet.markercluster/dist/MarkerCluster.css');
				// @ts-ignore
				targetLayer = (Lref as any).markerClusterGroup({ chunkedLoading: true });
			} catch {
				console.warn('leaflet.markercluster nie jest dostępny — użyję zwykłej warstwy.');
				targetLayer = Lref.layerGroup();
				useClusters = false;
			}
		} else {
			targetLayer = Lref.layerGroup();
		}

		// Dodajemy markery
		for (const poi of pois) {
			const icon = Lref.divIcon({
				html: `<div class="danger-marker danger-${poi.danger}">${dangerIcons[poi.type] ?? '📍'}</div>`,
				className: 'custom-div-icon',
				iconSize: [40, 40],
				iconAnchor: [20, 20]
			});

			const popupContent = `
				<div style="text-align:center; padding:10px; max-width:220px;">
					<h3 style="margin:0 0 8px 0; color:#d32f2f; font-size:16px;">${poi.name ?? 'POI'}</h3>
					<p style="margin:4px 0; font-size:14px;"><strong>Poziom:</strong> ${poi.danger ?? '—'}/10 🔴</p>
					${poi.description ? `<p style="margin:4px 0; font-size:13px; color:#666;"><em>${poi.description}</em></p>` : ''}
					${poi.address ? `<p style="margin:4px 0; font-size:12px;">${poi.address}</p>` : ''}
					<p style="margin:8px 0 0 0;">
						<a href="https://www.google.com/maps?q=${poi.lat},${poi.lng}" target="_blank" rel="noopener">Pokaż w Mapach</a>
					</p>
				</div>
			`;

			const marker = Lref.marker([poi.lat, poi.lng], { icon }).bindPopup(popupContent);
			targetLayer.addLayer(marker);
		}

		// Dodajemy nową warstwę do kontenera
		poiLayerCurrent = targetLayer;
		poiFeatureGroup.addLayer(targetLayer);

		// Heatmapa (opcjonalnie)
		if (showHeatmap) {
			addOrUpdateHeatmap(pois);
		} else {
			removeHeatmap();
		}
	}

	async function addOrUpdateHeatmap(pois: POI[]) {
		if (!map || !Lref) return;

		if (!('heatLayer' in (Lref as any))) {
			try {
				await import('leaflet.heat');
			} catch {
				console.warn('leaflet.heat nie jest dostępny — heatmapa wyłączona.');
				showHeatmap = false;
				return;
			}
		}

		const points = pois.map((p) => [p.lat, p.lng, Math.max(0.2, (p.danger ?? 1) / 10)]);
		if (heatLayer) {
			heatLayer.setLatLngs(points);
		} else {
			heatLayer = (Lref as any).heatLayer(points, { radius: 25, blur: 15, maxZoom: 17 }).addTo(map);
		}
	}

	function removeHeatmap() {
		if (map && heatLayer) {
			map.removeLayer(heatLayer);
			heatLayer = null;
		}
	}

	function setupAutoRefresh() {
		if (autoRefreshTimer) {
			clearInterval(autoRefreshTimer);
			autoRefreshTimer = null;
		}
		if (autoRefresh > 0) {
			autoRefreshTimer = window.setInterval(() => refreshPOIs(), autoRefresh * 1000);
		}
	}

	// ————— Użytkownik / geolokalizacja —————
	let geoWatchId: number | null = null;

	function updateUserMarker(L: typeof import('leaflet'), lat: number, lng: number, accuracy?: number) {
		if (!map) return;

		// Usuń stare elementy
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

	async function locateUser() {
		if (!Lref) return;
		if (!('geolocation' in navigator)) {
			errorMsg = 'Twoja przeglądarka nie obsługuje geolokalizacji.';
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
			(err) => {
				errorMsg = `Błąd geolokalizacji: ${err.message}`;
			},
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

	// ————— Handlery UI —————
	function onTypeToggle(type: string) {
		if (selectedTypes.has(type)) selectedTypes.delete(type);
		else selectedTypes.add(type);
		selectedTypes = new Set(selectedTypes); // wymuś reaktywność
	}

	function onRadiusChange(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		radiusKm = Math.max(0.5, Math.min(15, v));
	}

	function onDangerChange(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		minDanger = Math.max(1, Math.min(10, v));
	}
</script>

<div class="map-wrapper">
	<!-- Panel sterowania -->
	<div class="controls" role="region" aria-label="Filtry mapy">
		<div class="row">
			<label class="label">Promień: <strong>{radiusKm} km</strong></label>
			<input type="range" min="0.5" max="15" step="0.5" bind:value={radiusKm} on:input={onRadiusChange} />
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
				<span>Heatmapa</span>
			</label>
			<label class="switch">
				<input type="checkbox" bind:checked={useClusters} />
				<span>Klastrowanie</span>
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
			<button class="btn" on:click={locateUser}>📡 Zlokalizuj mnie</button>
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
</div>

<style lang="scss">
	.map-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
		display: grid;
		grid-template-columns: 320px 1fr;
		grid-template-rows: 1fr;
		gap: 12px;
		padding: 8px;
		box-sizing: border-box;

		@media (max-width: 900px) {
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

		@media (max-width: 900px) {
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

		@media (max-width: 900px) {
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
		}
	}

	.label {
		min-width: 110px;
		font-weight: 600;
	}

	input[type="range"] { flex: 1; }

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border-radius: 999px;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		cursor: pointer;
		user-select: none;

		input[type="checkbox"] { accent-color: #d32f2f; }
		.chip-icon { font-size: 18px; line-height: 1; }
	}

	.switch {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		input[type="checkbox"] { accent-color: #0ea5e9; }
	}

	.autorefresh {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	.btn {
		background: #111827;
		color: #fff;
		border: none;
		border-radius: 10px;
		padding: 8px 12px;
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		transition: transform 0.12s ease, box-shadow 0.12s ease;

		&:disabled { opacity: 0.6; cursor: not-allowed; }
		&:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,0.25); }
	}

	.legend {
		position: absolute;
		right: 18px;
		bottom: 18px;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		padding: 8px 10px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.15);
		display: flex;
		flex-direction: column;
		gap: 6px;
		z-index: 3;

		.legend-row {
			display: flex;
			align-items: center;
			gap: 8px;
			font-size: 12px;

			&.count { margin-top: 2px; font-weight: 600; }
		}

		.dot {
			width: 12px; height: 12px; border-radius: 999px; display: inline-block;
			&.dot-high { background: linear-gradient(135deg, #ff0000, #cc0000); }
			&.dot-mid { background: linear-gradient(135deg, #ffa500, #ff6b00); }
		}
	}

	:global(.custom-div-icon) {
		background: transparent !important;
		border: none !important;
	}

	:global(.user-marker) {
		font-size: 30px;
		animation: pulse 2s infinite;
		filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
	}

	:global(.danger-marker) {
		width: 40px; height: 40px; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		border: 3px solid #fff;
		box-shadow: 0 2px 8px rgba(0,0,0,0.3);
		animation: bounce 2s infinite;
		cursor: pointer; transition: transform 0.2s; font-size: 24px;
		&:hover { transform: scale(1.12); }
	}

	:global(.danger-7), :global(.danger-8) {
		background: linear-gradient(135deg, #ffa500, #ff6b00);
	}
	:global(.danger-9), :global(.danger-10) {
		background: linear-gradient(135deg, #ff0000, #cc0000);
	}

	:global(.leaflet-popup-content-wrapper) {
		border-radius: 12px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.2);
	}

	.error {
		background: #fff1f2; color: #9f1239;
		border: 1px solid #fecdd3; border-radius: 10px;
		padding: 8px 10px;
	}

	@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
	@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
</style>
