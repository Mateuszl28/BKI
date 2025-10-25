<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type L from 'leaflet';
	import { locationStore } from '$lib/stores/location.svelte';
	import { poiStore } from '$lib/stores/poi.svelte';
	import type { POI } from '$lib/types/poi'
	import { mapToPlaces } from '$lib/stores/services/staticDataQueryService';
	import { fetchPOIsNearby } from '$lib/utils/overpass';

	let mapContainer: HTMLDivElement;
	let map: L.Map | null = null;
	let userMarker: L.Marker | null = null;
	let poiMarkers: L.Marker[] = [];

	// Ikony dla różnych typów lokacji
	const dangerIcons = {
		monopolowy: '🍷',
		klub: '🎵',
		pub: '🍺',
		policja: '🚨',
		user: '⚠️',
		stacjabenzynowa: '⛽'
	};

	onMount(async () => {
		// Dynamiczny import Leaflet (client-side only)
		const L = await import('leaflet');
		await import('leaflet/dist/leaflet.css');

		const lat = 53.01809179200012;
		const lng = 18.607055641182555;
		const newPOIs = await fetchPOIsNearby(lat, lng, 3);

		// Inicjalizacja mapy - centrum na Warszawie domyślnie
		map = L.map(mapContainer, {
			center: [53.01812167, 18.60666329],
			zoom: 13,
			zoomControl: true,
			attributionControl: true
		});

		for (let i = 0; i < newPOIs.length; i++ ) {
			const marker = L.marker([newPOIs[i].lat, newPOIs[i].lng]).addTo(map);
			// marker.bindPopup(markers[i].name);
			// bounds.push([markers[i].latitude, markers[i].longitude]);
		}

		// Dodanie warstwy OpenStreetMap
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap contributors',
			maxZoom: 19
		}).addTo(map);

		// Załaduj demo dane POI
		poiStore.loadDemoData(newPOIs);

		// Obserwuj zmiany lokalizacji użytkownika
		// $effect(() => {
		// 	const location = locationStore.userLocation;
		// 	if (location && map) {
		// 		updateUserMarker(L, location.lat, location.lng, location.accuracy);
		// 		map.setView([location.lat, location.lng], 15);
		// 	}
		// });

		// Obserwuj zmiany POI i aktualizuj markery
		$effect(() => {
			const pois = poiStore.pois;
			if (pois.length > 0 && map) {
				console.log('Aktualizacja markerów POI na mapie...');
				updatePOIMarkers(L, pois);
			}
		});
	});

	function updateUserMarker(L: any, lat: number, lng: number, accuracy?: number) {
		if (!map) return;

		// Usuń stary marker
		if (userMarker) {
			map.removeLayer(userMarker);
		}

		// Dodaj nowy marker
		const userIcon = L.divIcon({
			html: `<div class="user-marker">📍</div>`,
			className: 'custom-div-icon',
			iconSize: [30, 30],
			iconAnchor: [15, 15]
		});

		userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map).bindPopup(`
				<div style="text-align: center; padding: 5px;">
					<strong>Jesteś tutaj!</strong><br>
					${accuracy ? `Dokładność: ${Math.round(accuracy)}m` : ''}
				</div>
			`);

		// Dodaj okrąg dokładności
		if (accuracy) {
			L.circle([lat, lng], {
				radius: accuracy,
				color: '#3388ff',
				fillColor: '#3388ff',
				fillOpacity: 0.15,
				weight: 2
			}).addTo(map);
		}
	}

	function updatePOIMarkers(L: any, pois: POI[]) {
		if (!map) return;

		// Usuń stare markery POI
		poiMarkers.forEach((marker) => map!.removeLayer(marker));
		poiMarkers = [];

		// Dodaj nowe markery
		pois.forEach((poi) => {
			const icon = L.divIcon({
				html: `<div class="danger-marker danger-${poi.danger}">${dangerIcons[poi.type]}</div>`,
				className: 'custom-div-icon',
				iconSize: [40, 40],
				iconAnchor: [20, 20]
			});

			const popupContent = `
				<div style="text-align: center; padding: 10px;">
					<h3 style="margin: 0 0 10px 0; color: #d32f2f; font-size: 16px;">${poi.name}</h3>
					<p style="margin: 5px 0; font-size: 14px;"><strong>Poziom zagrożenia:</strong> ${poi.danger}/10 🔴</p>
					${poi.description ? `<p style="margin: 5px 0; font-size: 13px; color: #666;"><em>${poi.description}</em></p>` : ''}
					${poi.address ? `<p style="margin: 5px 0; font-size: 12px;">${poi.address}</p>` : ''}
				</div>
			`;

			const marker = L.marker([poi.lat, poi.lng], { icon }).addTo(map!).bindPopup(popupContent);

			poiMarkers.push(marker);
		});

		console.log(`Dodano ${poiMarkers.length} markerów POI na mapę`);
	}

	onDestroy(() => {
		locationStore.stopTracking();
		if (map) {
			map.remove();
			map = null;
		}
	});
</script>

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

		&:hover {
			transform: scale(1.2);
		}
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
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.1);
		}
	}

	@keyframes bounce {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-5px);
		}
	}
	<!-- 🔹 GENERATOR KAWAŁÓW 🔹 -->
<script>
	import { onMount } from 'svelte';

	onMount(() => {
		// --- Wstawiamy generator kawałów na stronę ---
		const script = document.createElement('script');
		script.type = 'text/javascript';
		script.innerHTML = `
			(() => {
			  const JOKES = [
			    { t: "Dlaczego programiści mylą Halloween i Boże Narodzenie? Bo 31 OCT = 25 DEC.", c: "programistyczny" },
			    { t: "Panie doktorze, wszyscy mnie ignorują! — Następny proszę.", c: "suchar" },
			    { t: "— Tato, zimno! — To się ociepl. — Ale jak? — No weź weźli i weźli weź.", c: "papa" },
			    { t: "Debugowanie: jak bycie detektywem w filmie, w którym sam jesteś mordercą.", c: "programistyczny" },
			    { t: "Nie odkładam na później. Po prostu planuję na nieokreśloną przyszłość.", c: "życiowy" },
			    { t: "Kelner! W mojej zupie jest błąd! — To nie błąd, to feature.", c: "programistyczny" },
			    { t: "Moje hasło jest jak cebula: doprowadza mnie do łez.", c: "programistyczny" },
			  ];

			  const css = \`
			    .joke-popup {
			      position: fixed;
			      padding: 12px 16px;
			      background: #141a2e;
			      color: #e8edff;
			      border-radius: 12px;
			      border: 1px solid rgba(122,162,255,0.3);
			      box-shadow: 0 8px 24px rgba(0,0,0,.35);
			      z-index: 9999;
			      max-width: 320px;
			      line-height: 1.4;
			      font-family: system-ui, sans-serif;
			      animation: popupIn 0.3s ease;
			    }
			    .joke-popup button {
			      margin-top: 8px;
			      background: #1a2342;
			      color: #fff;
			      border: none;
			      border-radius: 6px;
			      padding: 4px 8px;
			      cursor: pointer;
			    }
			    @keyframes popupIn {
			      from { opacity: 0; transform: scale(0.9); }
			      to { opacity: 1; transform: scale(1); }
			    }
			  \`;

			  const style = document.createElement('style');
			  style.innerHTML = css;
			  document.head.appendChild(style);

			  function randomJoke() {
			    const j = JOKES[Math.floor(Math.random() * JOKES.length)];
			    showPopup(j.t);
			  }

			  function showPopup(text) {
			    const popup = document.createElement('div');
			    popup.className = 'joke-popup';
			    popup.textContent = text;
			    const btn = document.createElement('button');
			    btn.textContent = '😂 Jeszcze jeden';
			    btn.onclick = () => {
			      popup.remove();
			      randomJoke();
			    };
			    popup.appendChild(document.createElement('br'));
			    popup.appendChild(btn);

			    // losowa pozycja na ekranie
			    const vw = window.innerWidth;
			    const vh = window.innerHeight;
			    popup.style.left = Math.floor(Math.random() * (vw - 350)) + 'px';
			    popup.style.top = Math.floor(Math.random() * (vh - 200)) + 'px';
			    document.body.appendChild(popup);

			    setTimeout(() => popup.remove(), 8000);
			  }

			  // pokaz pierwszy kawał po 5 sekundach i co 20 sekund nowy
			  setTimeout(randomJoke, 5000);
			  setInterval(randomJoke, 20000);
			})();
		`;
		document.body.appendChild(script);
	});
</script>
<!-- 🔹 KONIEC BLOKU 🔹 -->

</style>
