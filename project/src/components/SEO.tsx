import { useEffect } from 'react';
import type { SEOProps } from '@/lib/seo';

const DEFAULT_TITLE = "GyftKart | India's Leading Digital E-Gift Cards & Instant UPI Vouchers";
const DEFAULT_DESCRIPTION =
  'Buy e-gift cards and vouchers instantly with UPI Direct on GyftKart. Top brand discounts, secure digital wallet, and fast delivery for corporate & personal gifting.';
const DEFAULT_KEYWORDS =
  'e-gift cards, digital vouchers, UPI gift card, instant gift vouchers India, buy gift cards online, corporate gifting, Amazon gift voucher, Flipkart voucher, Myntra card, Swiggy voucher, Zomato gift cards';
const DEFAULT_CANONICAL = 'https://gyftkart.in/';
const DEFAULT_OG_IMAGE = 'https://gyftkart.in/images/banners/gift-card-rewards.png';

function setMetaTag(selector: string, attribute: 'name' | 'property', attrValue: string, content: string) {
  let element = document.querySelector(selector) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, attrValue);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setCanonicalLink(href: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

export function SEO({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  keywords = DEFAULT_KEYWORDS,
  canonical = DEFAULT_CANONICAL,
  ogTitle,
  ogDescription,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
  twitterCard = 'summary_large_image',
  noindex = false,
  schema,
}: SEOProps) {
  useEffect(() => {
    // 1. Title
    document.title = title;

    // 2. Standard Meta Tags
    setMetaTag('meta[name="description"]', 'name', 'description', description);
    setMetaTag('meta[name="keywords"]', 'name', 'keywords', keywords);

    // 3. Robots
    const robotsContent = noindex
      ? 'noindex, nofollow'
      : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
    setMetaTag('meta[name="robots"]', 'name', 'robots', robotsContent);
    setMetaTag('meta[name="googlebot"]', 'name', 'googlebot', robotsContent);

    // 4. Canonical URL
    setCanonicalLink(canonical);

    // 5. OpenGraph Tags
    const effectiveOgTitle = ogTitle || title;
    const effectiveOgDesc = ogDescription || description;
    setMetaTag('meta[property="og:title"]', 'property', 'og:title', effectiveOgTitle);
    setMetaTag('meta[property="og:description"]', 'property', 'og:description', effectiveOgDesc);
    setMetaTag('meta[property="og:url"]', 'property', 'og:url', canonical);
    setMetaTag('meta[property="og:image"]', 'property', 'og:image', ogImage);
    setMetaTag('meta[property="og:type"]', 'property', 'og:type', ogType);
    setMetaTag('meta[property="og:site_name"]', 'property', 'og:site_name', 'GyftKart');
    setMetaTag('meta[property="og:locale"]', 'property', 'og:locale', 'en_IN');

    // 6. Twitter Card Tags
    setMetaTag('meta[name="twitter:card"]', 'name', 'twitter:card', twitterCard);
    setMetaTag('meta[name="twitter:site"]', 'name', 'twitter:site', '@GyftKart');
    setMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', effectiveOgTitle);
    setMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', effectiveOgDesc);
    setMetaTag('meta[name="twitter:image"]', 'name', 'twitter:image', ogImage);

    // 7. JSON-LD Dynamic Schema Script
    const scriptId = 'gyftkart-dynamic-jsonld';
    let scriptElement = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (schema) {
      if (!scriptElement) {
        scriptElement = document.createElement('script');
        scriptElement.id = scriptId;
        scriptElement.type = 'application/ld+json';
        document.head.appendChild(scriptElement);
      }
      scriptElement.textContent = JSON.stringify(schema, null, 2);
    } else if (scriptElement) {
      scriptElement.remove();
    }

    return () => {
      // Clean up dynamic schema on unmount if needed
      const existingScript = document.getElementById(scriptId);
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [
    title,
    description,
    keywords,
    canonical,
    ogTitle,
    ogDescription,
    ogImage,
    ogType,
    twitterCard,
    noindex,
    schema,
  ]);

  return null;
}
