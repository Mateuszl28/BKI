<script lang="ts">
	import Map from '$lib/components/Map.svelte';
	import Header from '$lib/components/Header.svelte';
	import Legend from '$lib/components/Legend.svelte';
	import FloatingButton from '$lib/components/FloatingButton.svelte';
	import LocationButton from '$lib/components/LocationButton.svelte';
	import LoadDataButton from '$lib/components/LoadDataButton.svelte';

	let showMenu = $state(false);

	function handleMenuClick() {
		showMenu = !showMenu;
		console.log('Menu kliknięte');
	}

	function handleAddDanger() {
		alert('🚨 Funkcja dodawania niebezpiecznych miejsc - wkrótce!');
	}
</script>

<div class="app-container">
	<Header onMenuClick={handleMenuClick} />

	<main class="map-view">
		<Map />
	</main>

	<Legend />
	<LocationButton />
	<LoadDataButton />
	<FloatingButton icon="⚠️" label="Zgłoś niebezpieczne miejsce" onclick={handleAddDanger} />
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
