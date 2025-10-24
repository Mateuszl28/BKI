import type { POI } from '$lib/types/poi';

class POIStore {
	pois = $state<POI[]>([]);
	isLoading = $state(false);
	error = $state<string | null>(null);

	// Dodaj nowy POI
	addPOI(poi: POI) {
		this.pois.push(poi);
		console.log('Dodano POI:', poi);
	}

	// Usuń POI
	removePOI(id: string) {
		this.pois = this.pois.filter((p) => p.id !== id);
	}

	// Znajdź POI w promieniu (w km)
	findNearby(lat: number, lng: number, radiusKm: number = 5): POI[] {
		return this.pois.filter((poi) => {
			const distance = this.calculateDistance(lat, lng, poi.lat, poi.lng);
			return distance <= radiusKm;
		});
	}

	// Oblicz odległość między dwoma punktami (w km)
	calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
		const R = 6371; // Promień Ziemi w km
		const dLat = this.toRad(lat2 - lat1);
		const dLng = this.toRad(lng2 - lng1);
		const a =
			Math.sin(dLat / 2) * Math.sin(dLat / 2) +
			Math.cos(this.toRad(lat1)) *
				Math.cos(this.toRad(lat2)) *
				Math.sin(dLng / 2) *
				Math.sin(dLng / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return R * c;
	}

	private toRad(deg: number): number {
		return deg * (Math.PI / 180);
	}

	// Załaduj demo dane (placeholder przed integracją z API/scraping)
	loadDemoData() {
		this.isLoading = true;

		// Przykładowe dane - Warszawa centrum
		const demoPOIs: POI[] = [
			{
				id: '1',
				name: 'Sklep "U Janusza"',
				type: 'monopolowy',
				lat: 52.2297,
				lng: 21.0122,
				danger: 9,
				description: 'Zawsze pełno wątpliwych osobników',
				verified: true,
				createdBy: 'system'
			},
			{
				id: '2',
				name: 'Klub "Przepity Piątek"',
				type: 'klub',
				lat: 52.232,
				lng: 21.015,
				danger: 8,
				description: 'Awantury w weekendy',
				verified: true,
				createdBy: 'system'
			},
			{
				id: '3',
				name: 'Pub "Ostatnia Szansa"',
				type: 'pub',
				lat: 52.228,
				lng: 21.01,
				danger: 7,
				description: 'Głośno po 22:00',
				verified: true,
				createdBy: 'system'
			},
			{
				id: '4',
				name: 'Nocne zgłoszenie policyjne',
				type: 'policja',
				lat: 52.231,
				lng: 21.013,
				danger: 10,
				description: 'Interwencja policji - zakłócanie spokoju',
				verified: true,
				createdBy: 'system'
			}
		];

		this.pois = demoPOIs;
		this.isLoading = false;
		console.log('Załadowano demo dane:', this.pois.length, 'POI');
	}
}

export const poiStore = new POIStore();
