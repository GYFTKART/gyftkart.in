/*
# GiftVerse marketplace schema + brand catalog seed

## Overview
Creates the core tables for the GiftVerse e-gift card marketplace: a brand
catalog, gift card purchases (which also power the user wallet / purchase
history), and corporate gifting inquiries. Seeds a catalog of 16 popular
Indian brands.

## 1. New Tables

### brands
- id (uuid, pk)
- slug (text, unique) — url-friendly identifier e.g. "amazon"
- name (text)
- category (text) — Shopping / Fashion / Beauty / Food & Dining / Travel / Entertainment
- tagline (text) — short marketing line
- description (text) — longer brand description
- color (text) — primary hex color for branding
- color2 (text) — secondary hex color for gradients
- text_on_color (text) — 'white' or 'dark' for contrast on brand color
- offer_badge (text) — e.g. "Up to 10% Off"
- discount_percent (int) — max discount shown
- denominations (int[]) — preset gift card amounts
- min_amount (int) — minimum custom amount
- max_amount (int) — maximum custom amount
- trending (bool) — shown on homepage trending section
- popularity (int) — sort weight
- created_at (timestamptz)

### purchases
- id (uuid, pk)
- session_id (text) — browser-local session id (identifies the "user" without auth)
- brand_slug (text)
- brand_name (text)
- brand_color (text)
- brand_color2 (text)
- amount (numeric) — gift card face value
- quantity (int) — number of cards
- recipient_name (text)
- recipient_email (text)
- recipient_phone (text)
- message (text)
- occasion (text)
- gift_card_code (text) — generated code
- status (text) — 'active'
- balance (numeric) — simulated remaining balance (defaults to amount*quantity)
- created_at (timestamptz)

### corporate_inquiries
- id (uuid, pk)
- company_name (text)
- contact_name (text)
- email (text)
- phone (text)
- employee_count (text)
- budget (text)
- occasions (text)
- message (text)
- status (text) — 'new'
- created_at (timestamptz)

## 2. Security (RLS)
This is a no-auth marketplace demo (no sign-in screen). Per Bolt database
guidance, all policies use TO anon, authenticated so the anon-key frontend can
read/write its own data. Ownership-by-session is enforced client-side by
filtering on session_id.
- brands: public read (anon + authenticated), no public write.
- purchases: full CRUD for anon + authenticated (client filters by session_id).
- corporate_inquiries: INSERT for anon + authenticated only (private to admin).

## 3. Seed
Inserts 16 brands (Amazon, Flipkart, Myntra, Nykaa, Swiggy, Zomato, BookMyShow,
MakeMyTrip, Uber, Tata CLiQ, Ajio, Netflix, Cleartrip, Pantaloons, Croma,
Starbucks) with ON CONFLICT (slug) DO UPDATE so the catalog stays authoritative
across re-runs.
*/

CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  tagline text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#6b21a8',
  color2 text NOT NULL DEFAULT '#3b0764',
  text_on_color text NOT NULL DEFAULT 'white',
  offer_badge text NOT NULL DEFAULT '',
  discount_percent int NOT NULL DEFAULT 0,
  denominations int[] NOT NULL DEFAULT '{250,500,1000,5000}',
  min_amount int NOT NULL DEFAULT 250,
  max_amount int NOT NULL DEFAULT 25000,
  trending boolean NOT NULL DEFAULT false,
  popularity int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_brands" ON brands;
CREATE POLICY "anon_read_brands" ON brands FOR SELECT
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  brand_slug text NOT NULL,
  brand_name text NOT NULL,
  brand_color text NOT NULL DEFAULT '#6b21a8',
  brand_color2 text NOT NULL DEFAULT '#3b0764',
  amount numeric NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  recipient_name text NOT NULL DEFAULT '',
  recipient_email text NOT NULL DEFAULT '',
  recipient_phone text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  occasion text NOT NULL DEFAULT '',
  gift_card_code text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_purchases" ON purchases;
CREATE POLICY "anon_select_purchases" ON purchases FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_purchases" ON purchases;
CREATE POLICY "anon_insert_purchases" ON purchases FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_purchases" ON purchases;
CREATE POLICY "anon_update_purchases" ON purchases FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_purchases" ON purchases;
CREATE POLICY "anon_delete_purchases" ON purchases FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS purchases_session_idx ON purchases(session_id);

CREATE TABLE IF NOT EXISTS corporate_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  employee_count text NOT NULL DEFAULT '',
  budget text NOT NULL DEFAULT '',
  occasions text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE corporate_inquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_insert_inquiries" ON corporate_inquiries;
CREATE POLICY "anon_insert_inquiries" ON corporate_inquiries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

INSERT INTO brands (slug, name, category, tagline, description, color, color2, text_on_color, offer_badge, discount_percent, denominations, min_amount, max_amount, trending, popularity) VALUES
('amazon','Amazon','Shopping','Shop millions of products','Redeem on Amazon.in for electronics, fashion, groceries and more across millions of products. The gift card that fits every occasion.','#232F3E','#FF9900','white','Up to 10% Off',10,'{250,500,1000,5000}',250,10000,true,100),
('flipkart','Flipkart','Shopping','The ultimate shopping destination','Use on Flipkart for electronics, appliances, fashion and home. Fast delivery and big billion deals.','#2874F0','#1A56DB','white','Up to 12% Off',12,'{250,500,1000,5000}',250,10000,true,95),
('myntra','Myntra','Fashion','Fashion & lifestyle destination','Redeem on Myntra for fashion, beauty and lifestyle from top brands. India''s largest fashion e-store.','#E91E63','#AD1457','white','Up to 15% Off',15,'{250,500,1000,5000}',250,10000,true,90),
('nykaa','Nykaa','Beauty','Beauty & wellness expert','Use on Nykaa for cosmetics, skincare, wellness and luxury beauty. India''s favourite beauty destination.','#FC2779','#C2185B','white','Up to 18% Off',18,'{250,500,1000,5000}',250,10000,true,88),
('swiggy','Swiggy','Food & Dining','Food delivery & dining','Redeem on Swiggy for food delivery, Instamart and Dineout. For every craving, anytime.','#FC8019','#E65100','white','Up to 10% Off',10,'{250,500,1000,5000}',250,5000,true,80),
('zomato','Zomato','Food & Dining','Food delivery & dining','Use on Zomato for food delivery and dining out. Eat what you love, from restaurants you love.','#E23744','#B71C1C','white','Up to 11% Off',11,'{250,500,1000,5000}',250,5000,false,75),
('bookmyshow','BookMyShow','Entertainment','Movies, events & plays','Redeem on BookMyShow for movie tickets, events, plays and live experiences.','#E6136B','#AD1457','white','Up to 12% Off',12,'{250,500,1000,5000}',250,5000,false,70),
('makemytrip','MakeMyTrip','Travel','Flights, hotels & holidays','Use on MakeMyTrip for flights, hotels, holidays and bus bookings. Travel anywhere, anytime.','#EB2026','#B71C1C','white','Up to 14% Off',14,'{500,1000,2000,5000}',500,25000,false,72),
('uber','Uber','Travel','Rides & food delivery','Redeem on Uber for rides and Uber Eats. Get moving across cities.','#000000','#1A1A1A','white','Up to 8% Off',8,'{250,500,1000,5000}',250,5000,false,60),
('tatacliq','Tata CLiQ','Shopping','Electronics & lifestyle','Use on Tata CLiQ for electronics, fashion and lifestyle from trusted Tata brands.','#1A1A1A','#333333','white','Up to 12% Off',12,'{250,500,1000,5000}',250,10000,false,55),
('ajio','Ajio','Fashion','Fashion & lifestyle','Redeem on Ajio for fashion, ethnic wear and luxury brands. Curated styles for every season.','#2E2E2E','#555555','white','Up to 16% Off',16,'{250,500,1000,5000}',250,10000,false,65),
('netflix','Netflix','Entertainment','Streaming entertainment','Use on Netflix for streaming subscription. Gift endless entertainment.','#E50914','#B20710','white','Up to 9% Off',9,'{250,500,1000,5000}',250,5000,false,78),
('cleartrip','Cleartrip','Travel','Flights & hotels','Redeem on Cleartrip for flights, hotels and activities. Simple travel booking.','#FF6F00','#E65100','white','Up to 13% Off',13,'{500,1000,2000,5000}',500,25000,false,50),
('pantaloons','Pantaloons','Fashion','Fashion & lifestyle','Use on Pantaloons for fashion and lifestyle across 100s of stores.','#2E2E2E','#444444','white','Up to 15% Off',15,'{250,500,1000,5000}',250,10000,false,58),
('croma','Croma','Shopping','Electronics & gadgets','Redeem on Croma for electronics, appliances and gadgets. Tech for everyone.','#0A8B5A','#066B45','white','Up to 10% Off',10,'{500,1000,2000,5000}',500,25000,false,62),
('starbucks','Starbucks','Food & Dining','Coffee & café','Use at Starbucks for coffee, food and merchandise. The perfect little treat.','#00704A','#005C3D','white','Up to 12% Off',12,'{250,500,1000,5000}',250,5000,true,68)
ON CONFLICT (slug) DO UPDATE SET
  name=EXCLUDED.name,
  category=EXCLUDED.category,
  tagline=EXCLUDED.tagline,
  description=EXCLUDED.description,
  color=EXCLUDED.color,
  color2=EXCLUDED.color2,
  text_on_color=EXCLUDED.text_on_color,
  offer_badge=EXCLUDED.offer_badge,
  discount_percent=EXCLUDED.discount_percent,
  denominations=EXCLUDED.denominations,
  min_amount=EXCLUDED.min_amount,
  max_amount=EXCLUDED.max_amount,
  trending=EXCLUDED.trending,
  popularity=EXCLUDED.popularity;
