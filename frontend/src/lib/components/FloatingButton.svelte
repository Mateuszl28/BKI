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
		bottom: 100px;
		right: 20px;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: linear-gradient(135deg, #667eea, #764ba2);
		border: none;
		color: white;
		font-size: 24px;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
		z-index: 1700;

		&:hover {
			transform: scale(1.08);
			box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
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
			bottom: 95px;
			right: 10px;
			width: 54px;
			height: 54px;
			font-size: 22px;
		}
	}
</style>
