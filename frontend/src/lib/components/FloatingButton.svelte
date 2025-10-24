<script lang="ts">
	import type { MouseEventHandler } from 'svelte/elements';

	let { 
		icon = '➕', 
		label = 'Dodaj', 
		onclick = () => {} 
	}: { 
		icon?: string; 
		label?: string; 
		onclick?: () => void;
	} = $props();

	const handleClick: MouseEventHandler<HTMLButtonElement> = (e) => {
		onclick();
	};
</script>

<button class="floating-btn" onclick={handleClick} title={label}>
	<span class="icon">{icon}</span>
</button>

<style lang="scss">
	.floating-btn {
		position: fixed;
		bottom: 20px;
		right: 20px;
		width: 60px;
		height: 60px;
		border-radius: 50%;
		background: linear-gradient(135deg, #e74c3c, #c0392b);
		border: none;
		color: white;
		font-size: 28px;
		box-shadow: 0 4px 16px rgba(231, 76, 60, 0.4);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
		z-index: 1000;

		&:hover {
			transform: scale(1.1) rotate(90deg);
			box-shadow: 0 6px 20px rgba(231, 76, 60, 0.6);
		}

		&:active {
			transform: scale(0.95);
		}

		.icon {
			transition: transform 0.3s;
		}
	}

	@media (max-width: 480px) {
		.floating-btn {
			bottom: 10px;
			right: 10px;
			width: 56px;
			height: 56px;
			font-size: 24px;
		}
	}
</style>

