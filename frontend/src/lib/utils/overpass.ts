import type { POI, POIType } from '$lib/types/poi';

// Overpass API - służy do pobierania danych z OpenStreetMap
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

interface OverpassQuery {
	type: POIType;
	osmTag: string;
	dangerLevel: number;
}

// Mapowanie typów POI na tagi OSM
const OSM_QUERIES: OverpassQuery[] = [
	{ type: 'monopolowy', osmTag: 'shop=alcohol', dangerLevel: 8 },
	{ type: 'pub', osmTag: 'amenity=pub', dangerLevel: 7 },
	{ type: 'pub', osmTag: 'amenity=bar', dangerLevel: 7 },
	{ type: 'klub', osmTag: 'amenity=nightclub', dangerLevel: 8 }
];

/**
 * Pobiera POI w promieniu wokół danej lokalizacji
 * @param lat Szerokość geograficzna
 * @param lng Długość geograficzna
 * @param radiusKm Promień w kilometrach (domyślnie 2km)
 */
export async function fetchPOIsNearby(
	lat: number,
	lng: number,
	radiusKm: number = 2
): Promise<POI[]> {
	const radiusMeters = radiusKm * 1000;
	const allPOIs: POI[] = [];

	for (const query of OSM_QUERIES) {
		try {
			const pois = await fetchPOIsByTag(lat, lng, radiusMeters, query);
			allPOIs.push(...pois);
		} catch (error) {
			console.error(`Błąd pobierania ${query.type}:`, error);
		}
	}

	return allPOIs;
}

async function fetchPOIsByTag(
	lat: number,
	lng: number,
	radius: number,
	query: OverpassQuery
): Promise<POI[]> {
	// Zapytanie Overpass QL
	const overpassQuery = `
		[out:json][timeout:25];
		(
			node["${query.osmTag}"](around:${radius},${lat},${lng});
			way["${query.osmTag}"](around:${radius},${lat},${lng});
			relation["${query.osmTag}"](around:${radius},${lat},${lng});
		);
		out center;
	`;

	const response = await fetch(OVERPASS_API, {
		method: 'POST',
		body: `data=${encodeURIComponent(overpassQuery)}`
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}

	const data = await response.json();
	const pois: POI[] = [];

	data.elements.forEach((element: any) => {
		const lat = element.lat || element.center?.lat;
		const lng = element.lon || element.center?.lon;

		if (!lat || !lng) return;

		const name =
			element.tags?.name || element.tags?.['name:pl'] || `${getTypeName(query.type)} ${element.id}`;

		pois.push({
			id: `osm-${element.id}`,
			name,
			type: query.type,
			lat,
			lng,
			danger: query.dangerLevel,
			address: formatAddress(element.tags),
			verified: true,
			createdBy: 'system',
			createdAt: new Date()
		});
	});

	console.log(`Pobrano ${pois.length} POI typu ${query.type}`);
	return pois;
}

function getTypeName(type: POIType): string {
	const names: Record<POIType, string> = {
		monopolowy: 'Sklep alkoholowy',
		klub: 'Klub nocny',
		pub: 'Pub',
		policja: 'Zgłoszenie',
		user: 'Miejsce'
	};
	return names[type] || 'Miejsce';
}

function formatAddress(tags: any): string | undefined {
	if (!tags) return undefined;

	const parts = [];
	if (tags['addr:street']) parts.push(tags['addr:street']);
	if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
	if (tags['addr:city']) parts.push(tags['addr:city']);

	return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * Tworzy markery "bezpieczeństwa" - losowe punkty w bezpiecznych miejscach (dla humoru)
 */
export function generateSafeZones(lat: number, lng: number, count: number = 3): POI[] {
	const safeZones: POI[] = [];
	const safeNames = [
		'Posterunek Policji',
		'Remiza OSP',
		'Kościół',
		'Biblioteka',
		'Park miejski',
		'Szkoła podstawowa'
	];

	for (let i = 0; i < count; i++) {
		// Losowe przesunięcie do 1km
		const offset = 0.01; // ~1km
		const randomLat = lat + (Math.random() - 0.5) * offset;
		const randomLng = lng + (Math.random() - 0.5) * offset;

		safeZones.push({
			id: `safe-${i}`,
			name: safeNames[Math.floor(Math.random() * safeNames.length)],
			type: 'user',
			lat: randomLat,
			lng: randomLng,
			danger: 1,
			description: 'Bezpieczna strefa 🛡️',
			verified: false,
			createdBy: 'system'
		});
	}

	return safeZones;
}
