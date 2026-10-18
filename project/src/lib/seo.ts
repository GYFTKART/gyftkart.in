/**
 * Builds standard Schema.org Product & AggregateOffer JSON-LD markup for a brand voucher.
 */
export function buildBrandProductSchema(brand: {
  name: string;
  slug: string;
  description?: string;
  category?: string;
  image_url?: string;
  min_amount?: number;
  max_amount?: number;
  denominations?: number[];
  discount_percent?: number;
}) {
  const minPrice =
    brand.min_amount ||
    (brand.denominations && brand.denominations.length > 0 ? Math.min(...brand.denominations) : 100);
  const maxPrice =
    brand.max_amount ||
    (brand.denominations && brand.denominations.length > 0 ? Math.max(...brand.denominations) : 10000);
  const offersCount = brand.denominations && brand.denominations.length > 0 ? brand.denominations.length : 5;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${brand.name} E-Gift Card`,
    image: brand.image_url
      ? brand.image_url.startsWith('http')
        ? brand.image_url
        : `https://gyftkart.in${brand.image_url}`
      : 'https://gyftkart.in/images/banners/gift-card-rewards.png',
    description:
      brand.description ||
      `Buy ${brand.name} digital e-gift card and vouchers online with instant UPI delivery on GyftKart.`,
    brand: {
      '@type': 'Brand',
      name: brand.name,
    },
    category: brand.category || 'Gift Cards',
    sku: `GK-${brand.slug.toUpperCase()}`,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'INR',
      lowPrice: minPrice,
      highPrice: maxPrice,
      offerCount: offersCount,
      availability: 'https://schema.org/InStock',
      url: `https://gyftkart.in/brand/${brand.slug}`,
      seller: {
        '@type': 'Organization',
        name: 'GyftKart',
        url: 'https://gyftkart.in',
      },
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '154',
      bestRating: '5',
      worstRating: '1',
    },
  };
}
