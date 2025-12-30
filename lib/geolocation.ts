export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeofenceValidation {
  isWithinGeofence: boolean;
  distance: number;
  geofenceRadius: number;
}

export function calculateDistance(
  point1: Coordinates,
  point2: Coordinates
): number {
  // Haversine formula to calculate distance between two coordinates
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (point1.latitude * Math.PI) / 180;
  const φ2 = (point2.latitude * Math.PI) / 180;
  const Δφ = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const Δλ = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // Distance in meters
  return distance;
}

export function validateGeofence(
  userLocation: Coordinates,
  propertyLocation: Coordinates,
  radiusMeters: number = 150
): GeofenceValidation {
  const distance = calculateDistance(userLocation, propertyLocation);
  const isWithinGeofence = distance <= radiusMeters;

  return {
    isWithinGeofence,
    distance: Math.round(distance),
    geofenceRadius: radiusMeters,
  };
}

export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  // In production, use Google Maps Geocoding API or similar
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    console.warn('Google Maps API key not configured');
    return null;
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        latitude: location.lat,
        longitude: location.lng,
      };
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(2)}km`;
}
