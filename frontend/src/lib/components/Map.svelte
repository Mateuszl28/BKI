<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type L from 'leaflet';
	import { poiStore } from '$lib/stores/poi.svelte';
	import type { POI } from '$lib/types/poi';

	let mapContainer: HTMLDivElement;
	let map: L.Map | null = null;
	let poiLayer: L.LayerGroup | null = null;
	let radiusCircle: L.Circle | null = null;
	let Llib: typeof import('leaflet') | null = null;

	// ---- STAN (Svelte 5 runes)
	let isSheetOpen = $state(false);      // Filtry
	let isLegendOpen = $state(false);     // Legenda
	let humorMode = $state(true);         // Tryb humoru (domyślnie włączony, bo czemu nie?)
	let toast = $state<string | null>(null);

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

	// ——— żarciki ———
	const jokes = [
		'Mapa mówi prawdę. Czasem aż za bardzo.',
		'Jeśli zgubisz się na mapie, zgubisz się stylowo.',
		'W promieniu 3 km rośnie szansa na przygodę.',
		'Zachowaj spokój i przesuń mapę.',
		'Kto pyta, nie błądzi — najwyżej zoomuje.'
	];
	const typeQuips: Record<PoiType, string[]> = {
		monopolowy: ['Tu butelki mają marzenia.', 'Półka z wodą — tylko dla pozoru.', 'Promocja na „korki do zmartwień”.'],
		klub: ['Wejście wolne, wyjście… jak wyjdziesz.', 'DJ prosi o ciszę — na 3 sekundy.', 'Toaleta zna najwięcej historii.'],
		pub: ['Tu pianka szybciej znika niż honor po drugiej.', 'Hasło do Wi-Fi: „jeszczedwa”.', 'Zamknęli o 22… w innym wszechświecie.'],
		policja: ['Tu zakończyła się niejedna kariera rajdowca.', 'Mandat — pamiątka na lata.', 'Nie testuj sprintu.'],
		stacjabenzynowa: ['Kawa +95 oktanów.', 'Hot-dog tu bywa filozofem.', 'Zapach sukcesu i benzyny.']
	};
	function rand<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)] as T; }

	// ——— zapisywanie widoku ———
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

	// ——— Overpass (lokalny, bez dodatkowych plików) ———
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
				const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: `data=${encodeURIComponent(q)}` });
				if (res.ok) { json = await res.json(); break; }
			} catch {}
		}
		if (!json) return [];
		const mapType = (t: any): POI['type'] =>
			t.shop === 'alcohol' ? 'monopolowy' :
			t.amenity === 'nightclub' ? 'klub' :
			t.amenity === 'pub' ? 'pub' :
			t.amenity === 'police' ? 'policja' : 'stacjabenzynowa';
		return (json.elements || []).filter((e: any) => e.lat && e.lon).map((e: any) => ({
			lat: e.lat,
			lng: e.lon,
			name: e.tags?.name || 'Miejsce',
			type: mapType(e.tags || {}),
			danger: e.tags?.amenity === 'nightclub' ? 9 : e.tags?.amenity === 'police' ? 7 : e.tags?.shop === 'alcohol' ? 8 : 7,
			description: e.tags?.brand || e.tags?.operator || ''
		}));
	}

	// ——— Nominatim ———
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
			const res = await fetch(url, { headers: { Accept: 'application/json' } });
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
		showToast(rand(jokes));
	}

	// ——— Map init ———
	onMount(async () => {
		if (!browser) return;
		Llib = await import('leaflet');
		await import('leaflet/dist/leaflet.css');
		const L = Llib!;
		const view = loadView();

		map = L.map(mapContainer, { center: [view.lat, view.lng], zoom: view.zoom, zoomControl: false });
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
		L.control.zoom({ position: 'bottomright' }).addTo(map);
		poiLayer = L.layerGroup().addTo(map);

		const pois = await fetchPOIsNearbyLocal(view.lat, view.lng, 3);
		poiStore.loadDemoData(pois);

		filterCenter = { lat: view.lat, lng: view.lng };
		drawRadiusCircle();

		map.on('moveend', saveView);
		map.on('zoomend', saveView);
		map.on('click', (e: any) => { filterCenter = { lat: e.latlng.lat, lng: e.latlng.lng }; drawRadiusCircle(); refreshPOIMarkers(); });

		// Easter eggs (konami + „beer”)
		if (typeof window !== 'undefined') {
			setupKonami();
			window.addEventListener('keydown', (e) => {
				if (!map) return;
				const target = e.target as HTMLElement;
				if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
				if (e.key.toLowerCase() === 'b') secretWord += 'b';
				else if (e.key.toLowerCase() === 'e') secretWord += 'e';
				else if (e.key.toLowerCase() === 'r') secretWord += 'r';
				else if (e.key.toLowerCase() === 'a') secretWord += 'a';
				else secretWord = '';
				if (secretWord.endsWith('beer')) rainEmojis(['🍺','🎵','🚨','⛽'], 1200);
			});
		}

		refreshPOIMarkers();
		showToast('Mapa gotowa! 🗺️');
	});

	onDestroy(() => { if (map) { map.remove(); map = null; } });

	// ——— Rysowanie
	function drawRadiusCircle() {
		const L = Llib!; if (!map || !filterCenter) return;
		if (radiusCircle) { radiusCircle.setLatLng([filterCenter.lat, filterCenter.lng]); radiusCircle.setRadius(filterRadiusKm * 1000); }
		else {
			radiusCircle = L.circle([filterCenter.lat, filterCenter.lng], {
				radius: filterRadiusKm * 1000, color: '#ff5722', fillColor: '#ff5722', fillOpacity: 0.08, weight: 2, dashArray: '4 6'
			}).addTo(map);
		}
	}

	// ——— Markery
	function refreshPOIMarkers() {
		const L = Llib!; if (!map || !poiLayer) return;
		poiLayer.clearLayers();

		let pois: POI[] = poiStore.pois ?? [];
		pois = pois.filter((p) => enabledTypes[p.type as PoiType] && (p.danger ?? 0) >= minDanger);

		for (const poi of pois) {
			const icon = L.divIcon({
				html: `<div class="danger-marker danger-${Math.min(10, Math.max(0, poi.danger ?? 0))}${humorMode ? ' wiggle' : ''}">${dangerIcons[poi.type]}</div>`,
				className: 'custom-div-icon', iconSize: [44, 44], iconAnchor: [22, 22]
			});

			const copyId = `copy-${poi.lat.toFixed(5)}-${poi.lng.toFixed(5)}`.replace(/[^\w-]/g, '');
			const quip = humorMode ? `<p style="margin:6px 0 0 0;font-size:12px;opacity:.8;">${rand(typeQuips[poi.type])}</p>` : '';

			const popup = `
				<div style="text-align:center;padding:8px;min-width:220px">
					<h3 style="margin:0 0 6px 0;color:#d32f2f;font-size:16px;">${poi.name ?? 'Miejsce'}</h3>
					<p style="margin:2px 0;font-size:14px;"><strong>Poziom:</strong> ${poi.danger ?? '?'} / 10 🔴</p>
					${poi.description ? `<p style="margin:4px 0;font-size:13px;color:#666;"><em>${poi.description}</em></p>` : ''}
					<p style="margin:6px 0 0 0;font-size:14px;">
						<a href="https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${poi.lat}%2C${poi.lng}" target="_blank" rel="noopener">Nawiguj ↗</a> •
						<a id="${copyId}" href="#" data-lat="${poi.lat}" data-lng="${poi.lng}">Kopiuj</a>
					</p>
					${quip}
				</div>
			`;

			const m = L.marker([poi.lat, poi.lng], { icon }).bindPopup(popup, { closeButton: true });
			m.on('popupopen', () => {
				setTimeout(() => {
					const el = document.getElementById(copyId);
					if (el) {
						el.addEventListener('click', (ev) => {
							ev.preventDefault();
							const lat = el.getAttribute('data-lat'); const lng = el.getAttribute('data-lng');
							navigator.clipboard?.writeText(`${lat},${lng}`);
							el.textContent = humorMode ? 'Skopiowano, nie mów nikomu 🤫' : 'Skopiowano!';
							showToast('Współrzędne uciekły do schowka ✨');
							setTimeout(() => (el.textContent = 'Kopiuj'), 1600);
						}, { once: true } as any);
					}
				}, 0);
			});

			m.addTo(poiLayer);
		}
	}

	// ——— Żart dnia (w legendzie)
	const dadJokes = [
		'Kupiłem mapę. Teraz wiem, gdzie zgubiłem poprzednią.',
		'Dlaczego mapa się uśmiecha? Bo ma fajne kontury.',
		'GPS mówi „skręć w lewo”… ja mówię „gdzie?”.',
		'Kiedy mapa jest smutna? Gdy ją ciągle składamy.',
		'Kompas na diecie: trzyma się północy.'
	];
	let currentJoke = $state(rand(dadJokes));
	function newJoke() { currentJoke = rand(dadJokes); }

	// ——— Toasty
	let toastTimer: any;
	function showToast(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 2200);
	}

	// ——— Konami & emoji rain
	let secretWord = '';
	function setupKonami() {
		const seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
		let idx = 0;
		window.addEventListener('keydown', (e) => {
			const t = e.target as HTMLElement;
			if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
			const k = e.key;
			if (k === seq[idx] || k.toLowerCase() === seq[idx]) { idx++; if (idx === seq.length) { idx = 0; rainEmojis(['🍺','🎵','🚨','⛽','🗺️'], 1800); } }
			else idx = 0;
		});
	}
	function rainEmojis(emojis: string[], duration = 1500) {
		const container = document.createElement('div');
		container.className = 'emoji-rain';
		for (let i = 0; i < 24; i++) {
			const span = document.createElement('span');
			span.textContent = rand(emojis);
			span.style.left = Math.random() * 100 + 'vw';
			span.style.animationDelay = Math.random() * 0.6 + 's';
			span.style.fontSize = 18 + Math.random() * 12 + 'px';
			container.appendChild(span);
		}
		document.body.appendChild(container);
		setTimeout(() => container.remove(), duration);
	}
</script>

<!-- FAB-y -->
<div class="fabs" role="toolbar" aria-label="Nawigacja">
	<button class="fab" onclick={() => (isSheetOpen = !isSheetOpen)} title="Filtry">⚙️</button>
	<button class="fab" onclick={() => (isLegendOpen = !isLegendOpen)} title="Legenda">📘</button>
	<button class="fab" onclick={() => { humorMode = !humorMode; showToast(humorMode ? 'Humor włączony 🤡' : 'Humor wyłączony 😶'); }} title="Tryb humoru">
		{humorMode ? '🤡' : '🙂'}
	</button>
</div>

<!-- Odznaka „Humor ON” -->
{#if humorMode}
<div class="humor-badge">Humor ON 🤡</div>
{/if}

<!-- PANEL FILTRÓW -->
<div class="sheet {isSheetOpen ? 'open' : ''}" role="dialog" aria-modal="false" aria-label="Filtry">
	<div class="sheet-handle" onclick={() => (isSheetOpen = !isSheetOpen)}></div>
	<div class="sheet-content">
		<div class="row">
			<input
				type="text"
				placeholder="Szukaj adresu / miejsca…"
				bind:value={searchQuery}
				oninput={onSearchInput}
				onfocus={() => (showSuggestions = true)}
				onblur={() => setTimeout(() => (showSuggestions = false), 150)}
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
			<input id="minDanger" type="range" min="0" max="10" step="1" bind:value={minDanger} onchange={() => { refreshPOIMarkers(); humorMode && showToast('Podkręciłeś dramatyzm. 🎭'); }} />
		</div>

		<div class="row">
			<label for="radius">Promień: <strong>{filterRadiusKm} km</strong></label>
			<input id="radius" type="range" min="0" max="15" step="0.5" bind:value={filterRadiusKm} oninput={drawRadiusCircle} onchange={() => { refreshPOIMarkers(); humorMode && showToast('Horyzont się rozszerzył. 🌌'); }} />
		</div>

		<div class="row tags">
			{#each allTypes as t}
				<label class="tag">
					<input type="checkbox" bind:checked={enabledTypes[t]} onchange={() => { refreshPOIMarkers(); humorMode && showToast(`Filtr: ${t} ${enabledTypes[t] ? 'ON' : 'OFF'}`); }} aria-label={`Filtr typu ${t}`} />
					<span>{dangerIcons[t]} {t}</span>
				</label>
			{/each}
		</div>

		<div class="row buttons">
			<button class="btn secondary" onclick={() => { refreshPOIMarkers(); showToast('Dopasowano do POI. 📌'); }}>Dopasuj do POI</button>
			<button class="btn secondary" onclick={() => { minDanger = 7; filterRadiusKm = 3; enabledTypes = { monopolowy: true, klub: true, pub: true, policja: true, stacjabenzynowa: true }; refreshPOIMarkers(); showToast('Zresetowano filtry. ♻️'); }}>Reset filtrów</button>
		</div>
	</div>
</div>

<!-- PANEL LEGENDY (bez nagłówka, z żartem dnia) -->
<div class="sheet legend {isLegendOpen ? 'open' : ''}" role="dialog" aria-modal="false" aria-label="Legenda">
	<div class="sheet-handle" onclick={() => (isLegendOpen = !isLegendOpen)}></div>
	<div class="sheet-content legend-content">
		<ul class="legend-list">
			<li><span class="ico">🍷</span> Sklep monopolowy <small class="hint">{humorMode ? '„Nic tak nie łączy jak kolejka przy kasie.”' : ''}</small></li>
			<li><span class="ico">🎵</span> Klub nocny <small class="hint">{humorMode ? '„DJ ma rację — zawsze.”' : ''}</small></li>
			<li><span class="ico">🍺</span> Pub/Bar <small class="hint">{humorMode ? '„Pianka dziś w formie.”' : ''}</small></li>
			<li><span class="ico">🚨</span> Zgłoszenie policyjne <small class="hint">{humorMode ? '„Prawko w szachy nie gra.”' : ''}</small></li>
			<li><span class="ico">⚠️</span> User-generated <small class="hint">{humorMode ? '„Nie pytaj. Po prostu uważaj.”' : ''}</small></li>
		</ul>

		<div class="legend-scale">
			<p>Skala niebezpieczeństwa:</p>
			<div class="scale-row"><span class="chip chip-low"></span><span>1–6</span></div>
			<div class="scale-row"><span class="chip chip-mid"></span><span>7–8</span></div>
			<div class="scale-row"><span class="chip chip-high"></span><span>9–10</span></div>
		</div>

		<div class="joke-box">
			<p class="joke-title">Żart dnia:</p>
			<p class="joke">{currentJoke}</p>
			<button class="btn tiny" onclick={newJoke}>Jeszcze! 😄</button>
		</div>
	</div>
</div> -->

<!-- TOAST -->
{#if toast}
<div class="toast">{toast}</div>
{/if}

<!-- MAPA -->
<div class="map-wrapper">
	<div bind:this={mapContainer} class="map-container" aria-label="Mapa"></div>
</div>

<style>
	.map-wrapper { width: 100%; height: 100dvh; position: relative; }
	.map-container { width: 100%; height: 100%; z-index: 1; }

	/* FABs */
	.fabs { position: fixed; right: 14px; bottom: 14px; display: flex; flex-direction: column; gap: 10px; z-index: 1200; }
	.fab { width: 56px; height: 56px; border-radius: 50%; border: none; background: #1a73e8; color: #fff; font-size: 22px; cursor: pointer; box-shadow: 0 6px 16px rgba(0,0,0,.25); }
	.humor-badge { position: fixed; left: 12px; top: 12px; z-index: 1200; background: #1a73e8; color: #fff; padding: 6px 10px; border-radius: 999px; font-size: 12px; box-shadow: 0 3px 10px rgba(0,0,0,.2); }

	/* Bottom sheet */
	.sheet { position: fixed; left: 0; right: 0; bottom: -55vh; height: 55vh; background: rgba(255,255,255,0.97); backdrop-filter: blur(6px); border-top-left-radius: 16px; border-top-right-radius: 16px; box-shadow: 0 -6px 20px rgba(0,0,0,.2); transition: transform .3s ease; transform: translateY(0); z-index: 1100; }
	.sheet.open { transform: translateY(-55vh); }
	.sheet-handle { width: 50px; height: 5px; border-radius: 3px; background: #ccc; margin: 8px auto; }
	.sheet-content { padding: 12px 16px; }
	.legend-content { padding-top: 4px; }
	.row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
	input[type="text"] { flex: 1; min-height: 44px; padding: 10px 12px; font-size: 16px; border: 1px solid #ddd; border-radius: 10px; outline: none; }
	.btn { min-height: 44px; padding: 0 14px; border-radius: 10px; border: none; background: #1a73e8; color: #fff; font-size: 15px; cursor: pointer; }
	.btn.secondary { background: #e0e0e0; color: #222; }
	.btn.tiny { min-height: 34px; font-size: 14px; padding: 0 12px; }

	/* Sugestie */
	.suggestions { width: 100%; max-height: 35vh; overflow: auto; list-style: none; margin: -2px 0 8px; padding: 0; border: 1px solid #e5e5e5; border-radius: 10px; background: #fff; }
	.suggestions li { padding: 12px; font-size: 15px; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
	.suggestions li:last-child { border-bottom: none; }

	/* Tag switchy */
	.tags { gap: 8px; }
	.tag { display: inline-flex; align-items: center; gap: 6px; background: #f7f7f7; border: 1px solid #eee; border-radius: 999px; padding: 8px 12px; font-size: 14px; }
	.tag input { accent-color: #1a73e8; width: 18px; height: 18px; }

	/* Legenda */
	.legend-list { list-style: none; margin: 4px 0 12px; padding: 0; }
	.legend-list li { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 15px; }
	.legend-list .ico { width: 22px; text-align: center; font-size: 18px; }
	.legend-list .hint { color: #6b7280; margin-left: auto; font-size: 12px; }

	.legend-scale .scale-row { display: flex; align-items: center; gap: 10px; margin: 4px 0; }
	.legend-scale .chip { display: inline-block; width: 80px; height: 14px; border-radius: 6px; }
	.chip-low  { background: #dff3e3; border: 1px solid #b8e1c1; }
	.chip-mid  { background: #ffe9cc; border: 1px solid #ffd19b; }
	.chip-high { background: #ffd6d9; border: 1px solid #ffb3ba; }

	/* Toast */
	.toast { position: fixed; left: 50%; bottom: 80px; transform: translateX(-50%); background: #111; color: #fff; padding: 8px 12px; border-radius: 10px; z-index: 2000; box-shadow: 0 6px 16px rgba(0,0,0,.35); font-size: 14px; }

	/* Leaflet ikony */
	:global(.custom-div-icon) { background: transparent !important; border: none !important; }
	:global(.danger-marker) {
		width: 44px; height: 44px; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.3);
		font-size: 26px; transition: transform .15s ease;
	}
	:global(.danger-marker.wiggle) { animation: wiggle 1.6s infinite; }
	:global(.danger-7), :global(.danger-8) { background: linear-gradient(135deg, #ffa500, #ff6b00); }
	:global(.danger-9), :global(.danger-10) { background: linear-gradient(135deg, #ff0000, #cc0000); }

	@keyframes wiggle {
		0% { transform: rotate(0deg) }
		25% { transform: rotate(-3.5deg) }
		50% { transform: rotate(0deg) }
		75% { transform: rotate(3.5deg) }
		100% { transform: rotate(0deg) }
	}

	/* Emoji rain */
	.emoji-rain { position: fixed; inset: 0; pointer-events: none; z-index: 3000; overflow: hidden; }
	.emoji-rain span { position: absolute; top: -40px; animation: fall 1.6s linear forwards; }
	@keyframes fall { to { transform: translateY(110vh) rotate(360deg); opacity: .9; } }

	/* Ciemny motyw */
	@media (prefers-color-scheme: dark) {
		.sheet { background: rgba(23,23,23,0.98); color: #eaeaea; }
		input[type="text"] { background: #141414; color: #eaeaea; border-color: #333; }
		.btn.secondary { background: #333; color: #eaeaea; }
		.suggestions { background: #141414; border-color: #333; }
		.suggestions li { border-bottom-color: #222; }
		.tag { background: #141414; border-color: #333; }
		.toast { background: #eaeaea; color: #111; }
	}
</style>
