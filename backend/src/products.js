// Simple product catalog for plaque ecommerce
// Sizes in inches, base prices USD
module.exports = {
  products: [
    {
      id: 'plaque-standard',
      name: 'Custom Spotify Plaque',
      description: 'Personalized laser-engraved Spotify style plaque with your chosen track.',
      basePrice: 24.99,
      options: {
        size: [
          { id: 'small', label: 'Small 5x7"', priceDelta: -5 },
          { id: 'standard', label: 'Standard 8.5x11"', priceDelta: 0, default: true },
          { id: 'large', label: 'Large 11x14"', priceDelta: 12 }
        ],
        material: [
          { id: 'acrylic-clear', label: 'Clear Acrylic', priceDelta: 0, default: true },
            { id: 'acrylic-black', label: 'Black Acrylic', priceDelta: 6 },
          { id: 'bamboo', label: 'Bamboo Wood', priceDelta: 8 }
        ],
        stand: [
          { id: 'none', label: 'No Stand', priceDelta: 0, default: true },
          { id: 'basic', label: 'Basic Stand', priceDelta: 4 },
          { id: 'premium', label: 'Premium LED Base', priceDelta: 16 }
        ]
      }
    }
  ],
  discounts: [
    { code: 'STUDENT10', percent: 10, description: 'Student 10% Off' },
    { code: 'WELCOME5', amount: 5, description: '$5 Launch Discount' }
  ]
};
