<script lang="ts">
	import type { MouseEventHandler } from 'svelte/elements';
	import { poiStore } from '$lib/stores/poi.svelte';
	import { locationStore } from '$lib/stores/location.svelte';
	import { fetchPOIsNearby } from '$lib/utils/overpass';

	let isLoading = $state(false);

	const handleClick: MouseEventHandler<HTMLButtonElement> = async (e) => {
		if (!locationStore.userLocation) {
			alert('⚠️ Najpierw włącz geolokalizację!');
			return;
		}

		isLoading = true;

		try {
			const { lat, lng } = locationStore.userLocation;
			const newPOIs = await fetchPOIsNearby(lat, lng, 2);

			// Wyczyść stare dane i dodaj nowe
			poiStore.pois = newPOIs;

			console.log(`Załadowano ${newPOIs.length} rzeczywistych POI z OpenStreetMap`);
		} catch (error) {
			console.error('Błąd pobierania danych:', error);
			alert('❌ Nie udało się pobrać danych. Sprawdź połączenie.');
		} finally {
			isLoading = false;
		}
	};
</script>

<button class="load-btn" onclick={handleClick} disabled={isLoading}>
	<span class="icon">{isLoading ? '⏳' : '📡'}</span>
	<span class="label">{isLoading ? 'Ładowanie...' : 'Załaduj dane'}</span>
</button>

<style lang="scss">
	.load-btn {
		position: fixed;
		top: 100px;
		right: 20px;
		background: linear-gradient(135deg, #667eea, #764ba2);
		border: none;
		border-radius: 12px;
		color: white;
		padding: 12px 20px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		transition: all 0.3s ease;
		z-index: 1000;

		&:hover:not(:disabled) {
			transform: translateY(-2px);
			box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
		}

		&:active:not(:disabled) {
			transform: translateY(0);
		}

		&:disabled {
			opacity: 0.6;
			cursor: not-allowed;
		}

		.icon {
			font-size: 18px;
			animation: rotate 2s linear infinite;
		}

		.label {
			white-space: nowrap;
		}
	}

	@keyframes rotate {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 480px) {
		.load-btn {
			top: 90px;
			right: 10px;
			padding: 10px 16px;
			font-size: 13px;
		}
	}
</style>
