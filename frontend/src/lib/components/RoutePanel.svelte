<script lang="ts">
	import type L from 'leaflet';
	import type { POI } from '$lib/types/poi';

	let {
		map = $bindable(),
		pois = []
	}: {
		map: L.Map | null;
		pois: POI[];
	} = $props();

	let isOpen = $state(false);
	let startAddress = $state('');
	let endAddress = $state('');
	let startCoords = $state<{ lat: number; lng: number } | null>(null);
	let endCoords = $state<{ lat: number; lng: number } | null>(null);
	let route = $state<any>(null);
	let routeLayer = $state<L.Polyline | null>(null);
	let startMarker = $state<L.Marker | null>(null);
	let endMarker = $state<L.Marker | null>(null);
	let isCalculating = $state(false);
	let routeInfo = $state<{
		distance: number;
		duration: number;
		dangers: number;
	} | null>(null);

	let startSuggestions = $state<any[]>([]);
	let endSuggestions = $state<any[]>([]);
	let showStartSuggestions = $state(false);
	let showEndSuggestions = $state(false);
	let isLoadingLocation = $state(false);
	let locationError = $state<string | null>(null);
	let userLocation = $state<{ lat: number; lng: number } | null>(null);

	export function toggle() {
		isOpen = !isOpen;
		// Pobierz lokalizację przy pierwszym otwarciu
		if (isOpen && !userLocation && !isLoadingLocation) {
			getUserLocation();
		}
	}

	async function searchAddress(query: string): Promise<any[]> {
		if (!query.trim()) return [];
		try {
			// Jeśli mamy lokalizację użytkownika, priorytetyzuj wyniki w okolicy
			let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=8&accept-language=pl`;

			if (userLocation) {
				// Dodaj viewbox wokół użytkownika (około 20km w każdą stronę)
				const latDelta = 0.18; // ~20km
				const lngDelta = 0.18;
				const viewbox = `${userLocation.lng - lngDelta},${userLocation.lat + latDelta},${userLocation.lng + lngDelta},${userLocation.lat - latDelta}`;
				url += `&viewbox=${viewbox}&bounded=0`;
			}

			const res = await fetch(url);
			if (!res.ok) return [];
			const results = await res.json();

			// Sortuj wyniki według odległości od użytkownika
			if (userLocation && results.length > 0) {
				return results
					.sort((a: any, b: any) => {
						const distA = calculateDistance(
							userLocation.lat,
							userLocation.lng,
							parseFloat(a.lat),
							parseFloat(a.lon)
						);
						const distB = calculateDistance(
							userLocation.lat,
							userLocation.lng,
							parseFloat(b.lat),
							parseFloat(b.lon)
						);
						return distA - distB;
					})
					.slice(0, 5); // Weź 5 najbliższych
			}

			return results.slice(0, 5);
		} catch {
			return [];
		}
	}

	async function getUserLocation() {
		if (!navigator.geolocation) {
			locationError = 'Geolokalizacja nie jest dostępna';
			return;
		}

		isLoadingLocation = true;
		locationError = null;

		navigator.geolocation.getCurrentPosition(
			async (position) => {
				const { latitude, longitude } = position.coords;
				userLocation = { lat: latitude, lng: longitude };
				startCoords = { lat: latitude, lng: longitude };

				// Pobierz nazwę miejsca
				try {
					const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=pl`;
					const res = await fetch(url);
					const data = await res.json();
					startAddress = data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
				} catch {
					startAddress = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
				}

				updateStartMarker();
				isLoadingLocation = false;

				// Wyśrodkuj mapę na użytkowniku
				if (map) {
					map.setView([latitude, longitude], 15);
				}
			},
			(error) => {
				isLoadingLocation = false;
				locationError = 'Nie udało się pobrać lokalizacji';
				console.error('Geolocation error:', error);
			},
			{
				enableHighAccuracy: true,
				timeout: 10000,
				maximumAge: 300000 // 5 minut cache
			}
		);
	}

	async function onStartInput() {
		startSuggestions = await searchAddress(startAddress);
		showStartSuggestions = true;
	}

	async function onEndInput() {
		endSuggestions = await searchAddress(endAddress);
		showEndSuggestions = true;
	}

	function selectStartSuggestion(item: any) {
		startAddress = item.display_name;
		startCoords = { lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
		showStartSuggestions = false;
		updateStartMarker();
	}

	function selectEndSuggestion(item: any) {
		endAddress = item.display_name;
		endCoords = { lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
		showEndSuggestions = false;
		updateEndMarker();
	}

	function updateStartMarker() {
		if (!map || !startCoords) return;
		const L = (window as any).L;
		if (!L) return;
		if (startMarker) {
			startMarker.setLatLng([startCoords.lat, startCoords.lng]);
		} else {
			const icon = L.divIcon({
				html: '<div style="background: #4CAF50; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">🏁</div>',
				className: 'custom-div-icon',
				iconSize: [36, 36],
				iconAnchor: [18, 18]
			});
			startMarker = L.marker([startCoords.lat, startCoords.lng], { icon }).addTo(map);
			startMarker.bindPopup('Start').openPopup();
		}
	}

	function updateEndMarker() {
		if (!map || !endCoords) return;
		const L = (window as any).L;
		if (!L) return;
		if (endMarker) {
			endMarker.setLatLng([endCoords.lat, endCoords.lng]);
		} else {
			const icon = L.divIcon({
				html: '<div style="background: #f44336; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">🎯</div>',
				className: 'custom-div-icon',
				iconSize: [36, 36],
				iconAnchor: [18, 18]
			});
			endMarker = L.marker([endCoords.lat, endCoords.lng], { icon }).addTo(map);
			endMarker.bindPopup('Cel').openPopup();
		}
	}

	async function calculateRoute() {
		if (!map || !startCoords || !endCoords) {
			alert('Wybierz punkt startowy i końcowy!');
			return;
		}

		isCalculating = true;

		try {
			// Używamy OSRM API do obliczenia trasy
			const url = `https://router.project-osrm.org/route/v1/driving/${startCoords.lng},${startCoords.lat};${endCoords.lng},${endCoords.lat}?overview=full&geometries=geojson`;
			const res = await fetch(url);
			const data = await res.json();

			if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
				alert('Nie udało się obliczyć trasy!');
				return;
			}

			route = data.routes[0];
			const L = (window as any).L;

			// Usuń poprzednią trasę
			if (routeLayer && map) {
				map.removeLayer(routeLayer);
			}

			// Rysuj nową trasę
			const coords = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
			routeLayer = L.polyline(coords, {
				color: '#667eea',
				weight: 5,
				opacity: 0.8,
				lineJoin: 'round'
			}).addTo(map);

			// Dopasuj widok do trasy
			if (routeLayer) {
				map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
			}

			// Policz zagrożenia wzdłuż trasy
			const dangers = countDangersAlongRoute(coords);

			routeInfo = {
				distance: route.distance / 1000, // km
				duration: route.duration / 60, // minuty
				dangers
			};
		} catch (error) {
			console.error('Błąd obliczania trasy:', error);
			alert('Wystąpił błąd podczas obliczania trasy');
		} finally {
			isCalculating = false;
		}
	}

	function countDangersAlongRoute(routeCoords: [number, number][]): number {
		let count = 0;
		const threshold = 0.1; // 100m od trasy

		for (const poi of pois) {
			const poiCoords: [number, number] = [poi.lat, poi.lng];

			// Sprawdź czy POI jest blisko trasy
			for (const routePoint of routeCoords) {
				const distance = calculateDistance(
					poiCoords[0],
					poiCoords[1],
					routePoint[0],
					routePoint[1]
				);
				if (distance < threshold) {
					count++;
					break;
				}
			}
		}

		return count;
	}

	function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
		const R = 6371; // promień Ziemi w km
		const dLat = toRad(lat2 - lat1);
		const dLng = toRad(lng2 - lng1);
		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return R * c;
	}

	function toRad(deg: number): number {
		return deg * (Math.PI / 180);
	}

	function clearRoute() {
		if (routeLayer && map) {
			map.removeLayer(routeLayer);
			routeLayer = null;
		}
		if (startMarker && map) {
			map.removeLayer(startMarker);
			startMarker = null;
		}
		if (endMarker && map) {
			map.removeLayer(endMarker);
			endMarker = null;
		}
		startAddress = '';
		endAddress = '';
		startCoords = null;
		endCoords = null;
		route = null;
		routeInfo = null;
	}

	function useCurrentLocation() {
		getUserLocation();
	}
</script>

<!-- Overlay -->
{#if isOpen}
	<div class="overlay" onclick={toggle}></div>
{/if}

<!-- Route Panel -->
<div class="route-panel" class:open={isOpen}>
	<button class="panel-handle" onclick={toggle}>
		<div class="handle-bar"></div>
		<span class="handle-text">{isOpen ? 'Zwiń' : 'Planuj trasę'}</span>
		<span class="handle-icon">🗺️</span>
	</button>

	<div class="panel-content">
		<div class="header">
			<h2>🗺️ Planowanie Trasy</h2>
			<p class="subtitle">Sprawdź jak bezpiecznie dojść do celu</p>
		</div>

		{#if isLoadingLocation}
			<div class="location-loading">
				<div class="spinner"></div>
				<p>Pobieram Twoją lokalizację...</p>
			</div>
		{/if}

		{#if locationError}
			<div class="location-error">
				<span>⚠️</span>
				<p>{locationError}</p>
				<button class="retry-btn" onclick={getUserLocation}>Spróbuj ponownie</button>
			</div>
		{/if}

		{#if userLocation && !isLoadingLocation}
			<div class="location-success">
				<span>✅</span>
				<p>Lokalizacja znaleziona - wyniki będą w Twojej okolicy!</p>
			</div>
		{/if}

		<div class="inputs">
			<div class="input-group">
				<label>
					<span class="label-icon">🏁</span>
					Start
				</label>
				<div class="input-wrapper">
					<input
						type="text"
						placeholder="Adres początkowy..."
						bind:value={startAddress}
						oninput={onStartInput}
						onfocus={() => (showStartSuggestions = true)}
						onblur={() => setTimeout(() => (showStartSuggestions = false), 200)}
					/>
					<button class="location-btn" onclick={useCurrentLocation} title="Użyj mojej lokalizacji">
						📍
					</button>
				</div>
				{#if showStartSuggestions && startSuggestions.length > 0}
					<ul class="suggestions">
						{#each startSuggestions as item, idx}
							<li onmousedown={() => selectStartSuggestion(item)}>
								{#if userLocation}
									<span class="distance-badge">
										{calculateDistance(
											userLocation.lat,
											userLocation.lng,
											parseFloat(item.lat),
											parseFloat(item.lon)
										).toFixed(1)} km
									</span>
								{/if}
								<span class="suggestion-text">{item.display_name}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="input-group">
				<label>
					<span class="label-icon">🎯</span>
					Cel
				</label>
				<input
					type="text"
					placeholder="Adres docelowy..."
					bind:value={endAddress}
					oninput={onEndInput}
					onfocus={() => (showEndSuggestions = true)}
					onblur={() => setTimeout(() => (showEndSuggestions = false), 200)}
				/>
				{#if showEndSuggestions && endSuggestions.length > 0}
					<ul class="suggestions">
						{#each endSuggestions as item, idx}
							<li onmousedown={() => selectEndSuggestion(item)}>
								{#if userLocation}
									<span class="distance-badge">
										{calculateDistance(
											userLocation.lat,
											userLocation.lng,
											parseFloat(item.lat),
											parseFloat(item.lon)
										).toFixed(1)} km
									</span>
								{/if}
								<span class="suggestion-text">{item.display_name}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<div class="actions">
			<button
				class="btn primary"
				onclick={calculateRoute}
				disabled={isCalculating || !startCoords || !endCoords}
			>
				{isCalculating ? '⏳ Obliczanie...' : '🚀 Znajdź trasę'}
			</button>
			<button class="btn secondary" onclick={clearRoute}>🗑️ Wyczyść</button>
		</div>

		{#if routeInfo}
			<div class="route-info">
				<h3>📊 Informacje o trasie</h3>
				<div class="info-grid">
					<div class="info-card">
						<div class="info-icon">📏</div>
						<div class="info-details">
							<div class="info-value">{routeInfo.distance.toFixed(2)} km</div>
							<div class="info-label">Dystans</div>
						</div>
					</div>
					<div class="info-card">
						<div class="info-icon">⏱️</div>
						<div class="info-details">
							<div class="info-value">{Math.round(routeInfo.duration)} min</div>
							<div class="info-label">Czas jazdy</div>
						</div>
					</div>
					<div class="info-card danger">
						<div class="info-icon">⚠️</div>
						<div class="info-details">
							<div class="info-value">{routeInfo.dangers}</div>
							<div class="info-label">Zagrożenia</div>
						</div>
					</div>
				</div>
				{#if routeInfo.dangers > 0}
					<div class="warning-box">
						<strong>🚨 Uwaga!</strong> Na trasie znajduje się <strong>{routeInfo.dangers}</strong>
						{routeInfo.dangers === 1 ? 'miejsce' : routeInfo.dangers < 5 ? 'miejsca' : 'miejsc'}
						wysokiego ryzyka (sklepy, puby, kluby). Zachowaj czujność! 🍺
					</div>
				{:else}
					<div class="success-box">
						<strong>✅ Brawo!</strong> Trasa jest względnie bezpieczna - brak miejsc wysokiego ryzyka
						w pobliżu!
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style lang="scss">
	.overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 1400;
		animation: fadeIn 0.3s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.route-panel {
		position: fixed;
		top: 0;
		right: 0;
		width: 420px;
		height: 100vh;
		background: linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%);
		box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
		z-index: 1500;
		transform: translateX(100%);
		transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		overflow-y: auto;

		&.open {
			transform: translateX(0);
		}
	}

	.panel-handle {
		position: absolute;
		top: 50%;
		left: -50px;
		transform: translateY(-50%);
		width: 50px;
		height: 120px;
		background: linear-gradient(135deg, #667eea, #764ba2);
		border: none;
		border-radius: 8px 0 0 8px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		transition: all 0.3s ease;
		box-shadow: -2px 2px 10px rgba(102, 126, 234, 0.3);
		writing-mode: vertical-rl;
		color: white;

		&:hover {
			left: -48px;
			background: linear-gradient(135deg, #7b8ff5, #865bc4);
		}

		.handle-bar {
			width: 30px;
			height: 4px;
			background: rgba(255, 255, 255, 0.5);
			border-radius: 2px;
			writing-mode: horizontal-tb;
		}

		.handle-text {
			font-weight: 700;
			font-size: 12px;
			text-transform: uppercase;
			letter-spacing: 1px;
		}

		.handle-icon {
			font-size: 20px;
			writing-mode: horizontal-tb;
		}
	}

	.panel-content {
		padding: 24px;
	}

	.header {
		margin-bottom: 24px;

		h2 {
			margin: 0 0 8px 0;
			font-size: 24px;
			font-weight: 800;
			color: #1a1a2e;
		}

		.subtitle {
			margin: 0;
			font-size: 14px;
			color: #666;
		}
	}

	.inputs {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-bottom: 20px;
	}

	.input-group {
		position: relative;

		label {
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 14px;
			font-weight: 600;
			color: #333;
			margin-bottom: 8px;

			.label-icon {
				font-size: 16px;
			}
		}

		.input-wrapper {
			display: flex;
			gap: 8px;
		}

		input {
			flex: 1;
			padding: 12px 14px;
			font-size: 15px;
			border: 2px solid #e0e0e0;
			border-radius: 10px;
			outline: none;
			transition: border-color 0.3s ease;

			&:focus {
				border-color: #667eea;
			}

			&::placeholder {
				color: #999;
			}
		}

		.location-btn {
			width: 46px;
			height: 46px;
			border: 2px solid #667eea;
			background: white;
			border-radius: 10px;
			font-size: 20px;
			cursor: pointer;
			transition: all 0.3s ease;

			&:hover {
				background: #667eea;
				transform: scale(1.05);
			}
		}
	}

	.suggestions {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		max-height: 250px;
		overflow-y: auto;
		background: white;
		border: 2px solid #e0e0e0;
		border-radius: 10px;
		margin-top: 4px;
		list-style: none;
		padding: 0;
		z-index: 10;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);

		li {
			padding: 10px 14px;
			cursor: pointer;
			font-size: 13px;
			border-bottom: 1px solid #f0f0f0;
			transition: background 0.2s ease;
			display: flex;
			align-items: center;
			gap: 8px;

			&:last-child {
				border-bottom: none;
			}

			&:hover {
				background: #f5f5f5;
			}

			.distance-badge {
				background: linear-gradient(135deg, #667eea, #764ba2);
				color: white;
				padding: 3px 8px;
				border-radius: 12px;
				font-size: 11px;
				font-weight: 600;
				flex-shrink: 0;
			}

			.suggestion-text {
				flex: 1;
				line-height: 1.4;
			}
		}
	}

	.location-loading {
		background: linear-gradient(135deg, #e3f2fd, #bbdefb);
		border-radius: 10px;
		padding: 16px;
		margin-bottom: 20px;
		display: flex;
		align-items: center;
		gap: 12px;

		.spinner {
			width: 20px;
			height: 20px;
			border: 3px solid #2196f3;
			border-top-color: transparent;
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
		}

		p {
			margin: 0;
			color: #1565c0;
			font-size: 14px;
			font-weight: 500;
		}
	}

	.location-error {
		background: linear-gradient(135deg, #ffebee, #ffcdd2);
		border-radius: 10px;
		padding: 16px;
		margin-bottom: 20px;
		display: flex;
		align-items: center;
		gap: 12px;

		span {
			font-size: 24px;
			flex-shrink: 0;
		}

		p {
			margin: 0;
			color: #c62828;
			font-size: 14px;
			flex: 1;
		}

		.retry-btn {
			background: #f44336;
			color: white;
			border: none;
			padding: 6px 12px;
			border-radius: 6px;
			font-size: 12px;
			font-weight: 600;
			cursor: pointer;
			white-space: nowrap;

			&:hover {
				background: #d32f2f;
			}
		}
	}

	.location-success {
		background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
		border-radius: 10px;
		padding: 12px 16px;
		margin-bottom: 20px;
		display: flex;
		align-items: center;
		gap: 10px;

		span {
			font-size: 20px;
			flex-shrink: 0;
		}

		p {
			margin: 0;
			color: #2e7d32;
			font-size: 13px;
			font-weight: 500;
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.actions {
		display: flex;
		gap: 10px;
		margin-bottom: 20px;
	}

	.btn {
		flex: 1;
		padding: 14px 20px;
		border: none;
		border-radius: 10px;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;

		&.primary {
			background: linear-gradient(135deg, #667eea, #764ba2);
			color: white;

			&:hover:not(:disabled) {
				transform: translateY(-2px);
				box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
			}

			&:disabled {
				opacity: 0.6;
				cursor: not-allowed;
			}
		}

		&.secondary {
			background: #e0e0e0;
			color: #333;

			&:hover {
				background: #d0d0d0;
			}
		}
	}

	.route-info {
		background: white;
		border-radius: 12px;
		padding: 20px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

		h3 {
			margin: 0 0 16px 0;
			font-size: 18px;
			font-weight: 700;
			color: #1a1a2e;
		}
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin-bottom: 16px;
	}

	.info-card {
		background: linear-gradient(135deg, #f5f7fa, #e8eef5);
		border-radius: 10px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 8px;

		&.danger {
			background: linear-gradient(135deg, #ffebee, #ffcdd2);
		}

		.info-icon {
			font-size: 28px;
		}

		.info-value {
			font-size: 18px;
			font-weight: 700;
			color: #1a1a2e;
		}

		.info-label {
			font-size: 12px;
			color: #666;
		}
	}

	.warning-box {
		background: linear-gradient(135deg, #fff3e0, #ffe0b2);
		border-left: 4px solid #ff9800;
		padding: 14px;
		border-radius: 8px;
		font-size: 14px;
		color: #e65100;
		line-height: 1.5;

		strong {
			color: #bf360c;
		}
	}

	.success-box {
		background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
		border-left: 4px solid #4caf50;
		padding: 14px;
		border-radius: 8px;
		font-size: 14px;
		color: #2e7d32;
		line-height: 1.5;

		strong {
			color: #1b5e20;
		}
	}

	@media (max-width: 768px) {
		.route-panel {
			width: 100%;
		}

		.panel-handle {
			display: none;
		}

		.info-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (prefers-color-scheme: dark) {
		.route-panel {
			background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
		}

		.header h2 {
			color: #ffffff;
		}

		.header .subtitle {
			color: #b0b0b0;
		}

		.input-group label {
			color: #e0e0e0;
		}

		.input-group input {
			background: #2a2a3e;
			border-color: #3a3a4e;
			color: #e0e0e0;

			&:focus {
				border-color: #667eea;
			}
		}

		.suggestions {
			background: #2a2a3e;
			border-color: #3a3a4e;

			li {
				border-bottom-color: #3a3a4e;
				color: #e0e0e0;

				&:hover {
					background: #3a3a4e;
				}
			}
		}

		.route-info {
			background: #2a2a3e;
		}

		.info-card {
			background: linear-gradient(135deg, #2a2a3e, #3a3a4e);

			.info-value {
				color: #ffffff;
			}

			.info-label {
				color: #b0b0b0;
			}
		}
	}
</style>
