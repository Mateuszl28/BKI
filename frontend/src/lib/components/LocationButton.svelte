<script lang="ts">
	import type { MouseEventHandler } from 'svelte/elements';
	import { locationStore } from '$lib/stores/location.svelte';

	const handleClick: MouseEventHandler<HTMLButtonElement> = (e) => {
		if (!locationStore.isTracking) {
			locationStore.startTracking();
		}
	};
</script>

<button class="location-btn" onclick={handleClick} class:active={locationStore.isTracking}>
	<span class="icon">{locationStore.isTracking ? '📍' : '🔍'}</span>
</button>

{#if locationStore.error}
	<div class="error-toast">
		⚠️ {locationStore.error}
	</div>
{/if}

<style lang="scss">
	.location-btn {
		position: fixed;
		bottom: 100px;
		right: 20px;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: white;
		border: 2px solid #667eea;
		color: #667eea;
		font-size: 24px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
		z-index: 1000;

		&:hover {
			transform: scale(1.1);
			box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
		}

		&:active {
			transform: scale(0.95);
		}

		&.active {
			background: #667eea;
			color: white;
			animation: pulse 2s infinite;
		}

		.icon {
			transition: transform 0.3s;
		}
	}

	.error-toast {
		position: fixed;
		bottom: 170px;
		right: 20px;
		background: #ff5252;
		color: white;
		padding: 12px 16px;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		font-size: 14px;
		max-width: 280px;
		z-index: 1001;
		animation: slideIn 0.3s ease;
	}

	@keyframes pulse {
		0%,
		100% {
			box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
		}
		50% {
			box-shadow: 0 4px 20px rgba(102, 126, 234, 0.8);
		}
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	@media (max-width: 480px) {
		.location-btn {
			bottom: 80px;
			right: 10px;
			width: 52px;
			height: 52px;
		}

		.error-toast {
			bottom: 145px;
			right: 10px;
			max-width: calc(100vw - 20px);
		}
	}
</style>
