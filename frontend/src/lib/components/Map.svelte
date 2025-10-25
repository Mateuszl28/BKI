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

	let isTracking = $state(false);
	let isSheetOpen = $state(false);
	let isLegendOpen = $state(false);

	let searchQuery = $state('');
	let searchResults = $state<Array<{ display_name: string; lat: string; lon: string }>>([]);
	let showSuggestions = $state(false);

	const allTypes = ['monopolowy', 'klub', 'pub', 'policja', 'stacjabenzynowa'] as const;
	type PoiType = typeof allTypes[number];

	let enabledTypes = $state<Record<PoiType, boolean>>({
		monopolowy: true,
		klub: true,
		pub: true,
		policja: true,
		stacjabenzynowa: true
	});
	let minDanger = $state(7);
	let filterRadiusKm = $state(3);
	let filterCenter = $state<{ lat: number; lng: number } | null>(null);

	const dangerIcons: Record<PoiType | 'user', string> = {
		monopolowy: '🍷',
		klub: '🎵',
		pub: '🍺',
		policja: '🚨',
		stacjabenzynowa: '⛽',
		user: '📍'
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
		} catch {
			return DEFAULT_VIEW;
		}
	}

	// --- fetch POI (Overpass) ---
	async function fetchPOIsNearbyLocal(lat: number, lng: number, radiusKm: number): Promise<POI[]> {
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

		let json: any = null;
		for (const ep of eps) {
			try {
				const res = await fetch(ep, {
					method: 'POST',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
					body: `data=${encodeURIComponent(q)}`
				});
				if (res.ok) {
					json = await res.json();
					break;
				}
			} catch {
				continue;
			}
		}
		if (!json) return [];
		return (json.elements || []).map((e: any) => ({
			lat: e.lat,
			lng: e.lon,
			name: e.tags.name || 'Miejsce',
			type:
				e.tags.shop === 'alcohol'
					? 'monopolowy'
					: e.tags.amenity === 'nightclub'
					? 'klub'
					: e.tags.amenity === 'pub'
					? 'pub'
					: e.tags.amenity === 'police'
					? 'policja'
					: 'stacjabenzynowa',
			danger:
				e.tags.amenity === 'nightclub'
					? 9
					: e.tags.amenity === 'police'
					? 7
					: e.tags.shop === 'alcohol'
					? 8
					: 7
		}));
	}

	onMount(async () => {
		if (!browser) return;
		Llib = await import('leaflet');
		await import('leaflet/dist/leaflet.css');
		const L = Llib!;
		const view = loadView();
		map = L.map(mapContainer, {
			center: [view.lat, view.lng],
			zoom: view.zoom
		});
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap contributors'
		}).addTo(map);
		poiLayer = L.layerGroup().addTo(map);

		const pois = await fetchPOIsNearbyLocal(view.lat, view.lng, 3);
		poiStore.loadDemoData(pois);
		refreshPOIMarkers();
	});

	onDestroy(() => {
		if (map) map.remove();
	});

	function refreshPOIMarkers() {
		if (!map || !poiLayer) return;
		const L = Llib!;
		poiLayer.clearLayers();
		const pois: POI[] = poiStore.pois ?? [];
		for (const poi of pois) {
			const icon = L.divIcon({
				html: `<div class="danger-marker danger-${poi.danger}">${dangerIcons[poi.type]}</div>`,
				className: 'custom-div-icon',
				iconSize: [40, 40],
				iconAnchor: [20, 20]
			});
			L.marker([poi.lat, poi.lng], { icon }).addTo(poiLayer);
		}
	}
</script>

<!-- FABY -->
<div class="fabs">
	<button class="fab" on:click={() => (isSheetOpen = !isSheetOpen)}>⚙️</button>
	<button class="fab" on:click={() => (isLegendOpen = !isLegendOpen)}>📘</button>
</div>

<!-- PANEL FILTRÓW -->
<div class="sheet {isSheetOpen ? 'open' : ''}">
	<div class="sheet-handle" on:click={() => (isSheetOpen = !isSheetOpen)}></div>
	<div class="sheet-content">
		<h3>Filtry (demo)</h3>
		<p>Tu możesz wstawić swoje filtry POI itp.</p>
	</div>
</div>

<!-- PANEL LEGENDY (bez tytułu) -->
<div class="sheet legend {isLegendOpen ? 'open' : ''}">
	<div class="sheet-handle" on:click={() => (isLegendOpen = !isLegendOpen)}></div>
	<div class="sheet-content legend-content">
		<ul class="legend-list">
			<li><span class="ico">🍷</span> Sklep monopolowy</li>
			<li><span class="ico">🎵</span> Klub nocny</li>
			<li><span class="ico">🍺</span> Pub/Bar</li>
			<li><span class="ico">🚨</span> Zgłoszenie policyjne</li>
			<li><span class="ico">⚠️</span> User-generated</li>
		</ul>

		<div class="legend-scale">
			<p>Skala niebezpieczeństwa:</p>
			<div class="scale-row"><span class="chip chip-low"></span><span>1–6</span></div>
			<div class="scale-row"><span class="chip chip-mid"></span><span>7–8</span></div>
			<div class="scale-row"><span class="chip chip-high"></span><span>9–10</span></div>
		</div>
	</div>
</div>

<!-- MAPA -->
<div class="map-wrapper">
	<div bind:this={mapContainer} class="map-container"></div>
</div>

<style>
	.map-wrapper {
		width: 100%;
		height: 100dvh;
		position: relative;
	}
	.map-container {
		width: 100%;
		height: 100%;
		z-index: 1;
	}

	.fabs {
		position: fixed;
		right: 14px;
		bottom: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		z-index: 1200;
	}
	.fab {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		border: none;
		background: #1a73e8;
		color: #fff;
		font-size: 22px;
		cursor: pointer;
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
	}

	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: -55vh;
		height: 55vh;
		background: rgba(255, 255, 255, 0.97);
		backdrop-filter: blur(6px);
		border-top-left-radius: 16px;
		border-top-right-radius: 16px;
		box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.2);
		transition: transform 0.3s ease;
		transform: translateY(0);
	}
	.sheet.open {
		transform: translateY(-55vh);
	}
	.sheet-handle {
		width: 50px;
		height: 5px;
		border-radius: 3px;
		background: #ccc;
		margin: 8px auto;
	}
	.sheet-content {
		padding: 12px 16px;
	}

	.legend-content {
		padding-top: 4px;
	}
	.legend-list {
		list-style: none;
		margin: 4px 0 12px;
		padding: 0;
	}
	.legend-list li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 0;
		font-size: 15px;
	}
	.legend-list .ico {
		width: 22px;
		text-align: center;
		font-size: 18px;
	}
	.legend-scale .scale-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 4px 0;
	}
	.legend-scale .chip {
		display: inline-block;
		width: 80px;
		height: 14px;
		border-radius: 6px;
	}
	.chip-low {
		background: #dff3e3;
		border: 1px solid #b8e1c1;
	}
	.chip-mid {
		background: #ffe9cc;
		border: 1px solid #ffd19b;
	}
	.chip-high {
		background: #ffd6d9;
		border: 1px solid #ffb3ba;
	}

	.custom-div-icon {
		background: transparent !important;
		border: none !important;
	}
	.danger-marker {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 3px solid #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		font-size: 24px;
	}
	.danger-7,
	.danger-8 {
		background: linear-gradient(135deg, #ffa500, #ff6b00);
	}
	.danger-9,
	.danger-10 {
		background: linear-gradient(135deg, #ff0000, #cc0000);
	}
</style>
