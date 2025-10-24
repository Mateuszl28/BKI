<script lang="ts">
	import type { MouseEventHandler } from 'svelte/elements';

	let { onMenuClick = () => {} }: { onMenuClick?: () => void } = $props();

	const handleClick: MouseEventHandler<HTMLButtonElement> = (e) => {
		onMenuClick();
	};
</script>

<header class="app-header">
	<div class="header-content">
		<div class="logo">
			<span class="icon">🍺</span>
			<h1>Alko Radar</h1>
		</div>
		<button class="menu-btn" onclick={handleClick}>
			<span>☰</span>
		</button>
	</div>
	<div class="header-subtitle">
		<p>Twój przewodnik po niebezpiecznych terenach</p>
	</div>
</header>

<style lang="scss">
	.app-header {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
		color: white;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
		z-index: 1000;
		padding: 12px 20px 8px;
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 10px;

		.icon {
			font-size: 28px;
			animation: swing 2s ease-in-out infinite;
		}

		h1 {
			margin: 0;
			font-size: 24px;
			font-weight: 700;
			background: linear-gradient(135deg, #f39c12, #e74c3c);
			-webkit-background-clip: text;
			-webkit-text-fill-color: transparent;
			background-clip: text;
		}
	}

	.menu-btn {
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: white;
		font-size: 24px;
		width: 44px;
		height: 44px;
		cursor: pointer;
		transition: all 0.3s;
		display: flex;
		align-items: center;
		justify-content: center;

		&:hover {
			background: rgba(255, 255, 255, 0.2);
			transform: scale(1.05);
		}

		&:active {
			transform: scale(0.95);
		}
	}

	.header-subtitle {
		margin-top: 5px;
		
		p {
			margin: 0;
			font-size: 12px;
			color: rgba(255, 255, 255, 0.7);
			font-style: italic;
		}
	}

	@keyframes swing {
		0%, 100% {
			transform: rotate(0deg);
		}
		25% {
			transform: rotate(10deg);
		}
		75% {
			transform: rotate(-10deg);
		}
	}
</style>

