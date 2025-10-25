<script lang="ts">
	import Map from '$lib/components/Map.svelte';
	import Header from '$lib/components/Header.svelte';
	import Legend from '$lib/components/Legend.svelte';
	import FloatingButton from '$lib/components/FloatingButton.svelte';
	import LocationButton from '$lib/components/LocationButton.svelte';
	import RoutePanel from '$lib/components/RoutePanel.svelte';
	import { poiStore } from '$lib/stores/poi.svelte';

	let mapInstance = $state<any>(null);
	let routePanelRef: any;

	function handleRouteClick() {
		if (routePanelRef) {
			routePanelRef.toggle();
		}
	}
</script>

<div class="app-container">
	<Header />

	<main class="map-view">
		<Map bind:mapInstance />
	</main>

	<Legend />
	<LocationButton />
	<FloatingButton icon="🗺️" label="Zaplanuj trasę" onclick={handleRouteClick} />
	<RoutePanel bind:this={routePanelRef} bind:map={mapInstance} pois={poiStore.pois} />
</div>

<style lang="scss">
	.app-container {
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: #f5f5f5;
	}

	.map-view {
		flex: 1;
		margin-top: 85px;
		width: 100%;
		height: calc(100vh - 85px);
		position: relative;
	}

	@media (max-width: 480px) {
		.map-view {
			margin-top: 80px;
			height: calc(100vh - 80px);
		}
	}
</style>
