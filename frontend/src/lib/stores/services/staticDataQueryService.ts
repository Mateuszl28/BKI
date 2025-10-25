// types.ts
export interface GpsCoordinates {
  latitude: number;
  longitude: number;
}

export interface OperatingHours {
  saturday?: string;
  sunday?: string;
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
}

export interface RawPlace {
  position: number;
  title: string;
  place_id: string;
  gps_coordinates: GpsCoordinates;
  rating?: number;
  reviews?: number;
  operating_hours?: OperatingHours;
  open_state?: string;
  hours?: string;
  address?: string;
  phone?: string;
  website?: string;
  type?: string;
  types?: string[];
}

// Extracted simplified interface
export interface Place {
  id: string;
  name: string;
  geolocation: GpsCoordinates;
  rating: number | null;
  reviewsCount: number;
  openingHours: OperatingHours | null;
  currentStatus?: string; // e.g., "Open ⋅ Closes 11 PM"
}

// Transform raw data to simplified structure
export function extractPlaceData(raw: any): Place {
  return {
    id: raw.place_id,
    name: raw.title,
    geolocation: raw.gps_coordinates,
    rating: raw.rating ?? null,
    reviewsCount: raw.reviews ?? 0,
    openingHours: raw.operating_hours ?? null,
    currentStatus: raw.open_state || raw.hours
  };
}

export function mapToPlaces(rawData: any[]): Place[] {
  return rawData.map(item => ({
    id: item.place_id,
    name: item.title || '',
    geolocation: item.gps_coordinates || { latitude: 0, longitude: 0 },
    rating: item.rating ?? null,
    reviewsCount: item.reviews ?? 0,
    openingHours: item.operating_hours ?? null,
    currentStatus: item.open_state || item.hours
  }));
}

// Filter utilities
export function filterByMinRating(places: Place[], minRating: number): Place[] {
  return places.filter(place => place.rating !== null && place.rating >= minRating);
}

export function filterByMinReviews(places: Place[], minReviews: number): Place[] {
  return places.filter(place => place.reviewsCount >= minReviews);
}

export function filterByDistance(
  places: Place[], 
  centerLat: number, 
  centerLng: number, 
  maxDistanceKm: number
): Place[] {
  return places.filter(place => {
    const distance = calculateDistance(
      centerLat, 
      centerLng, 
      place.geolocation.latitude, 
      place.geolocation.longitude
    );
    return distance <= maxDistanceKm;
  });
}

// Haversine formula for distance calculation
function calculateDistance(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// Check if place is currently open (based on day)
export function isOpenToday(place: Place): boolean {
  if (!place.openingHours) return false;
  
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[new Date().getDay()] as keyof OperatingHours;
  
  return !!place.openingHours[today];
}

// Sort utilities
export function sortByRating(places: Place[], desc = true): Place[] {
  return [...places].sort((a, b) => {
    const ratingA = a.rating ?? 0;
    const ratingB = b.rating ?? 0;
    return desc ? ratingB - ratingA : ratingA - ratingB;
  });
}

export function sortByReviewCount(places: Place[], desc = true): Place[] {
  return [...places].sort((a, b) => 
    desc ? b.reviewsCount - a.reviewsCount : a.reviewsCount - b.reviewsCount
  );
}