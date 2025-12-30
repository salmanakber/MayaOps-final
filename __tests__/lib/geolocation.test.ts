import { calculateDistance, isWithinGeofence } from '@/lib/geolocation';

describe('Geolocation Utilities', () => {
  describe('calculateDistance', () => {
    it('should calculate distance between two coordinates', () => {
      const distance = calculateDistance(51.5074, -0.1278, 51.5074, -0.1278);
      expect(distance).toBe(0);
    });

    it('should calculate distance in meters', () => {
      const distance = calculateDistance(51.5074, -0.1278, 51.5174, -0.1278);
      expect(distance).toBeGreaterThan(1000);
      expect(distance).toBeLessThan(1200);
    });
  });

  describe('isWithinGeofence', () => {
    it('should return true if within radius', () => {
      const result = isWithinGeofence(
        51.5074, -0.1278,
        51.5075, -0.1279,
        200
      );
      expect(result).toBe(true);
    });

    it('should return false if outside radius', () => {
      const result = isWithinGeofence(
        51.5074, -0.1278,
        51.6074, -0.1278,
        100
      );
      expect(result).toBe(false);
    });
  });
});
