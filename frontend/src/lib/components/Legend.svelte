<script lang="ts">
	let isOpen = $state(true);

	function toggleLegend() {
		isOpen = !isOpen;
	}
</script>

<div class="legend-container" class:closed={!isOpen}>
	<button class="legend-toggle" onclick={toggleLegend}>
		{isOpen ? '📖' : '❓'}
	</button>

	{#if isOpen}
		<div class="legend-content">
			<h3>Legenda Zagrożeń</h3>
			<div class="legend-items">
				<div class="legend-item">
					<span class="legend-icon">🍷</span>
					<span>Sklep monopolowy</span>
				</div>
				<div class="legend-item">
					<span class="legend-icon">🎵</span>
					<span>Klub nocny</span>
				</div>
				<div class="legend-item">
					<span class="legend-icon">🍺</span>
					<span>Pub/Bar</span>
				</div>
				<div class="legend-item">
					<span class="legend-icon">🚨</span>
					<span>Zgłoszenie policyjne</span>
				</div>
				<div class="legend-item">
					<span class="legend-icon">⚠️</span>
					<span>User-generated</span>
				</div>
			</div>
			<div class="danger-scale">
				<h4>Skala niebezpieczeństwa:</h4>
				<div class="scale-bar">
					<div class="scale-low">1-6 🟢</div>
					<div class="scale-medium">7-8 🟠</div>
					<div class="scale-high">9-10 🔴</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style lang="scss">
	.legend-container {
		position: fixed;
		bottom: 20px;
		left: 20px;
		background: white;
		border-radius: 12px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
		z-index: 1000;
		transition: all 0.3s ease;
		max-width: 280px;

		&.closed {
			width: 60px;
			height: 60px;
		}
	}

	.legend-toggle {
		position: absolute;
		top: 10px;
		right: 10px;
		background: linear-gradient(135deg, #667eea, #764ba2);
		border: none;
		border-radius: 50%;
		width: 40px;
		height: 40px;
		font-size: 20px;
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		transition: transform 0.2s;

		&:hover {
			transform: scale(1.1);
		}

		&:active {
			transform: scale(0.95);
		}
	}

	.legend-content {
		padding: 15px 15px 20px;

		h3 {
			margin: 0 0 15px 0;
			font-size: 18px;
			color: #1a1a2e;
			font-weight: 700;
			border-bottom: 2px solid #667eea;
			padding-bottom: 8px;
		}

		h4 {
			margin: 15px 0 8px 0;
			font-size: 14px;
			color: #555;
		}
	}

	.legend-items {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
		color: #333;

		.legend-icon {
			font-size: 20px;
			width: 30px;
			text-align: center;
		}
	}

	.danger-scale {
		margin-top: 15px;
		padding-top: 15px;
		border-top: 1px solid #eee;
	}

	.scale-bar {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 12px;

		> div {
			padding: 5px 10px;
			border-radius: 6px;
			font-weight: 600;
		}

		.scale-low {
			background: #e8f5e9;
			color: #2e7d32;
		}

		.scale-medium {
			background: #fff3e0;
			color: #e65100;
		}

		.scale-high {
			background: #ffebee;
			color: #c62828;
		}
	}

	@media (max-width: 480px) {
		.legend-container {
			left: 10px;
			bottom: 10px;
			max-width: 250px;
		}
	}
</style>

