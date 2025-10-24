import type { UserLocation } from '$lib/types/poi';

class LocationStore {
	userLocation = $state<UserLocation | null>(null);
	isTracking = $state(false);
	error = $state<string | null>(null);
	watchId: number | null = null;

	startTracking() {
		if (!navigator.geolocation) {
			this.error = 'Geolokalizacja niedostępna w tej przeglądarce';
			return;
		}

		this.isTracking = true;
		this.error = null;

		// Jednorazowe pobranie lokalizacji
		navigator.geolocation.getCurrentPosition(
			(position) => {
				this.userLocation = {
					lat: position.coords.latitude,
					lng: position.coords.longitude,
					accuracy: position.coords.accuracy,
					timestamp: position.timestamp
				};
				console.log('Lokalizacja pobrana:', this.userLocation);
			},
			(error) => {
				this.handleError(error);
			},
			{
				enableHighAccuracy: true,
				timeout: 10000,
				maximumAge: 0
			}
		);

		// Ciągłe śledzenie lokalizacji
		this.watchId = navigator.geolocation.watchPosition(
			(position) => {
				this.userLocation = {
					lat: position.coords.latitude,
					lng: position.coords.longitude,
					accuracy: position.coords.accuracy,
					timestamp: position.timestamp
				};
			},
			(error) => {
				this.handleError(error);
			},
			{
				enableHighAccuracy: true,
				timeout: 10000,
				maximumAge: 30000
			}
		);
	}

	stopTracking() {
		if (this.watchId !== null) {
			navigator.geolocation.clearWatch(this.watchId);
			this.watchId = null;
		}
		this.isTracking = false;
	}

	private handleError(error: GeolocationPositionError) {
		switch (error.code) {
			case error.PERMISSION_DENIED:
				this.error = 'Dostęp do lokalizacji odrzucony. Włącz uprawnienia w ustawieniach.';
				break;
			case error.POSITION_UNAVAILABLE:
				this.error = 'Lokalizacja niedostępna';
				break;
			case error.TIMEOUT:
				this.error = 'Timeout podczas pobierania lokalizacji';
				break;
			default:
				this.error = 'Nieznany błąd geolokalizacji';
		}
		console.error('Błąd geolokalizacji:', error);
		this.isTracking = false;
	}
}

export const locationStore = new LocationStore();
