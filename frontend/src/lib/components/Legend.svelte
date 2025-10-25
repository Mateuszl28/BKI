<script lang="ts">
	let isOpen = $state(false);

	function toggleLegend() {
		isOpen = !isOpen;
	}
</script>

<!-- Overlay -->
{#if isOpen}
	<div class="overlay" onclick={toggleLegend}></div>
{/if}

<!-- Bottom Drawer -->
<div class="drawer" class:open={isOpen}>
	<button class="drawer-handle" onclick={toggleLegend}>
		<div class="handle-bar"></div>
		<span class="handle-text">{isOpen ? 'Zwiń' : 'Strefy Ryzyka'}</span>
	</button>

	<div class="drawer-content">
		<div class="header">
			<h2>🚨 ALKO-RADAR: Strefy Ryzyka</h2>
			<p class="subtitle">
				Miejsca, których lepiej unikać, jeśli nie chcesz "przypadkowo" się najebać 🍺
			</p>
		</div>

		<div class="zones-grid">
			<div class="zone-card red">
				<div class="zone-icon">🍷</div>
				<div class="zone-info">
					<h4>Sklepy monopolowe</h4>
					<p>UWAGA! Wysoka koncentracja butelek</p>
				</div>
			</div>

			<div class="zone-card orange">
				<div class="zone-icon">🎵</div>
				<div class="zone-info">
					<h4>Kluby nocne</h4>
					<p>Strefa podwyższonego ryzyka libacji</p>
				</div>
			</div>

			<div class="zone-card yellow">
				<div class="zone-icon">🍺</div>
				<div class="zone-info">
					<h4>Puby i bary</h4>
					<p>"Tylko jedno piwo" - klasyk gatunku</p>
				</div>
			</div>

			<div class="zone-card orange">
				<div class="zone-icon">⛽</div>
				<div class="zone-info">
					<h4>Stacje benzynowe</h4>
					<p>Nocne zakupy? Wiadomo co... 🌙</p>
				</div>
			</div>
		</div>

		<div class="pro-tip">
			<strong>💡 Pro tip:</strong> Im więcej pomarańczowych pinezek widzisz, tym większe prawdopodobieństwo,
			że "wpadniesz na chwilę"
		</div>
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
		z-index: 1500;
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

	.drawer {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: 50vh;
		background: linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%);
		border-radius: 20px 20px 0 0;
		box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
		z-index: 1600;
		transform: translateY(calc(100% - 60px));
		transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);

		&.open {
			transform: translateY(0);
		}
	}

	.drawer-handle {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 60px;
		background: linear-gradient(135deg, #667eea, #764ba2);
		border: none;
		border-radius: 20px 20px 0 0;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		transition: all 0.3s ease;
		box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);

		&:hover {
			background: linear-gradient(135deg, #7b8ff5, #865bc4);
		}

		.handle-bar {
			width: 50px;
			height: 4px;
			background: rgba(255, 255, 255, 0.5);
			border-radius: 2px;
		}

		.handle-text {
			color: white;
			font-weight: 700;
			font-size: 14px;
			text-transform: uppercase;
			letter-spacing: 1px;
		}
	}

	.drawer-content {
		padding: 75px 20px 20px;
		height: 100%;
		overflow-y: auto;

		&::-webkit-scrollbar {
			width: 6px;
		}

		&::-webkit-scrollbar-track {
			background: #f1f1f1;
		}

		&::-webkit-scrollbar-thumb {
			background: #888;
			border-radius: 3px;
		}
	}

	.header {
		text-align: center;
		margin-bottom: 24px;

		h2 {
			margin: 0 0 8px 0;
			font-size: 24px;
			font-weight: 800;
			color: #1a1a2e;
			background: linear-gradient(135deg, #667eea, #764ba2);
			-webkit-background-clip: text;
			-webkit-text-fill-color: transparent;
			background-clip: text;
		}

		.subtitle {
			margin: 0;
			font-size: 14px;
			color: #666;
			line-height: 1.5;
		}
	}

	.zones-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 12px;
		margin-bottom: 20px;
	}

	.zone-card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		border-radius: 12px;
		border: 2px solid;
		transition: all 0.3s ease;

		&:hover {
			transform: translateY(-2px);
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		}

		&.red {
			background: linear-gradient(135deg, #ffebee, #ffcdd2);
			border-color: #e57373;
		}

		&.orange {
			background: linear-gradient(135deg, #fff3e0, #ffe0b2);
			border-color: #ffb74d;
		}

		&.yellow {
			background: linear-gradient(135deg, #fffde7, #fff9c4);
			border-color: #ffd54f;
		}

		.zone-icon {
			font-size: 36px;
			flex-shrink: 0;
		}

		.zone-info {
			h4 {
				margin: 0 0 4px 0;
				font-size: 15px;
				font-weight: 700;
				color: #1a1a2e;
			}

			p {
				margin: 0;
				font-size: 13px;
				color: #555;
				line-height: 1.4;
			}
		}
	}

	.pro-tip {
		background: linear-gradient(135deg, #e3f2fd, #bbdefb);
		border-left: 4px solid #2196f3;
		padding: 14px 16px;
		border-radius: 8px;
		font-size: 13px;
		color: #1565c0;
		line-height: 1.5;

		strong {
			color: #0d47a1;
		}
	}

	@media (max-width: 768px) {
		.drawer {
			height: 60vh;
		}

		.zones-grid {
			grid-template-columns: 1fr;
		}

		.header h2 {
			font-size: 20px;
		}

		.header .subtitle {
			font-size: 13px;
		}
	}

	@media (max-width: 480px) {
		.drawer {
			height: 70vh;
		}

		.drawer-content {
			padding: 70px 15px 15px;
		}

		.zone-card {
			padding: 12px;
			gap: 10px;

			.zone-icon {
				font-size: 30px;
			}

			.zone-info h4 {
				font-size: 14px;
			}

			.zone-info p {
				font-size: 12px;
			}
		}
	}
</style>
