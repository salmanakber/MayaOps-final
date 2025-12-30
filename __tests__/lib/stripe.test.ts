import { calculateBillingAmount } from '@/lib/stripe';

describe('Stripe Utilities', () => {
  describe('calculateBillingAmount', () => {
    it('should calculate base price only for zero properties', () => {
      const amount = calculateBillingAmount(0);
      expect(amount).toBe(55.00);
    });

    it('should calculate base + property cost', () => {
      const amount = calculateBillingAmount(10);
      expect(amount).toBe(65.00); // 55 + 10*1
    });

    it('should handle large property counts', () => {
      const amount = calculateBillingAmount(100);
      expect(amount).toBe(155.00); // 55 + 100*1
    });
  });
});
