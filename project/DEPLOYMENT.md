# GyftKart Production Deployment Guide & Verification Checklist

This document details the production architecture, hosting configurations, DNS records, environment variables, and verification protocol for deploying **GyftKart** (`https://gyftkart.in`).

---

## 1. Production Architecture & Performance Verification

GyftKart is built with **Vite 5**, **React 18**, **TypeScript**, **Tailwind CSS**, and **Supabase (PostgreSQL + Edge Functions)**.

### Performance & Bundle Optimization
To achieve sub-second page loads on both mobile 4G/5G and broadband, all non-critical and administrative routes are code-split and lazy-loaded via React `Suspense`:

| Bundle / Chunk | Size (Uncompressed) | Size (Gzip) | Loading Strategy |
| :--- | :--- | :--- | :--- |
| **`index-*.js` (Core App)** | **117.4 kB** | **30.4 kB** | Eager (First Paint) |
| **`vendor-react-*.js`** | 180.2 kB | 59.2 kB | Cached Vendor Chunk |
| **`vendor-supabase-*.js`** | 125.9 kB | 34.3 kB | Cached Vendor Chunk |
| **`vendor-lucide-*.js`** | 36.4 kB | 7.5 kB | Cached Vendor Chunk |
| **`AdminUpiDirectPage-*.js`** | 52.5 kB | 12.1 kB | Lazy-loaded on `/admin/upi-direct` |
| **`AdminCustomerLedger-*.js`** | 44.1 kB | 10.1 kB | Lazy-loaded on `/admin/customer-ledger` |
| **`AdminB2bCustomers-*.js`** | 39.5 kB | 7.7 kB | Lazy-loaded on `/admin/b2b-customers` |
| **`AdminCompanyLedger-*.js`** | 30.0 kB | 7.6 kB | Lazy-loaded on `/admin/company-ledger` |
| **`CheckoutPage-*.js`** | 21.5 kB | 6.1 kB | Lazy-loaded on `/checkout` |
| **`WalletPage-*.js`** | 19.8 kB | 5.0 kB | Lazy-loaded on `/wallet` |
| **`OrdersPage-*.js`** | 17.3 kB | 4.4 kB | Lazy-loaded on `/orders` |

### Quality Gates Verification
Before deploying to production, execute the automated quality suite inside `project/`:
```bash
# 1. TypeScript Strict Verification (Zero errors)
npm run typecheck

# 2. ESLint Static Analysis (Zero errors)
npm run lint

# 3. Production Vite Build (Sub-2s compile)
npm run build
```

---

## 2. Production Hosting & Routing Configurations

### A. Vercel (Current Production Platform)
The configuration is saved in [`project/vercel.json`](file:///Users/mohdsaad/Documents/Website/GyftKart/project-bolt-sb1-oqncpyjw/project/vercel.json):
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/index.html",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache, no-store, must-revalidate"
        }
      ]
    }
  ]
}
```

### B. Netlify / Cloudflare Pages / Static Hosts
Static routing redirects are configured in [`project/public/_redirects`](file:///Users/mohdsaad/Documents/Website/GyftKart/project-bolt-sb1-oqncpyjw/project/public/_redirects):
```
/*    /index.html   200
```

### C. Docker / Nginx Self-Hosted Configuration (Optional)
If running inside a standalone VPS or Docker container:
```nginx
server {
    listen 80;
    server_name gyftkart.in www.gyftkart.in;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gyftkart.in www.gyftkart.in;

    ssl_certificate /etc/letsencrypt/live/gyftkart.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gyftkart.in/privkey.pem;

    root /var/www/gyftkart/dist;
    index index.html;

    # Static assets immutable caching
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, no-transform, immutable";
    }

    # SPA Fallback
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

---

## 3. Domain Mapping & DNS Records

To connect `gyftkart.in` to the production server:

| Type | Name / Host | Target / Value | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `@` (apex) | `76.76.21.21` | Automatic / 300 | Routes apex `gyftkart.in` to Vercel |
| **CNAME** | `www` | `cname.vercel-dns.com` | Automatic / 300 | Routes `www.gyftkart.in` |
| **TXT** | `_vercel` | *(Vercel verification string)* | Automatic | Domain ownership challenge (if required) |

> [!NOTE]
> Ensure **HTTP to HTTPS redirect** is enforced in the DNS / Hosting dashboard. Both apex `gyftkart.in` and `www.gyftkart.in` will automatically provision SSL certificates via Let's Encrypt.

---

## 4. Production Environment Variables (.env.production)

Configure these variables in your hosting environment (e.g., Vercel Project Settings → Environment Variables):

| Variable Name | Required | Example / Default | Description |
| :--- | :--- | :--- | :--- |
| `VITE_SITE_URL` | **Yes** | `https://gyftkart.in` | Primary public canonical origin |
| `VITE_SUPABASE_URL` | **Yes** | `https://xyzcompany.supabase.co` | Production Supabase Project URL (Strict HTTPS) |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | `eyJhbGciOi...` | Supabase Public Anonymous Key |
| `VITE_RAZORPAY_KEY_ID` | **Yes** | `rzp_live_...` | Live Razorpay Key for Cards & NetBanking |
| `VITE_UPI_DIRECT_ENABLED` | **Yes** | `true` | Enables zero-fee serverless UPI Direct payment method |
| `VITE_YOUPI_PUBLIC_KEY` | Optional | `yp_pk_live_...` | Optional self-hosted YouPI-PG Gateway Public Key |
| `VITE_YOUPI_API_URL` | Optional | `https://pay.gyftkart.in` | Optional YouPI-PG API origin (leave empty to hide) |
| `VITE_YOUPI_PORTAL_URL`| Optional | `https://checkout.gyftkart.in` | Optional YouPI-PG Modal checkout origin |

---

## 5. SSL, Security & Resilience Architecture

1. **Strict HTTPS API Transport**:
   - The Supabase client in [`src/lib/supabase.ts`](file:///Users/mohdsaad/Documents/Website/GyftKart/project-bolt-sb1-oqncpyjw/project/src/lib/supabase.ts) and Edge Function caller in [`src/components/AdminPaymentsTab.tsx`](file:///Users/mohdsaad/Documents/Website/GyftKart/project-bolt-sb1-oqncpyjw/project/src/components/AdminPaymentsTab.tsx) automatically rewrite non-localhost `http://` API calls to `https://`.
2. **Global Error Boundary**:
   - [`src/components/ErrorBoundary.tsx`](file:///Users/mohdsaad/Documents/Website/GyftKart/project-bolt-sb1-oqncpyjw/project/src/components/ErrorBoundary.tsx) wraps the entire application root in [`src/main.tsx`](file:///Users/mohdsaad/Documents/Website/GyftKart/project-bolt-sb1-oqncpyjw/project/src/main.tsx).
   - If an unhandled JavaScript exception occurs, users are shown an on-brand recovery screen with "Reload Page" and "Back to Home" actions, ensuring no blank screens.
3. **Database Security (RLS)**:
   - All critical tables (`wallets`, `wallet_transactions`, `orders`, `purchases`, `upi_payment_sessions`, `profiles`) enforce Row-Level Security (RLS).
   - Ledger adjustments and session reconciliations are protected by `SECURITY DEFINER` Postgres RPCs (`admin_reopen_payment_session`, `admin_revert_payment_session`, `admin_create_b2b_customer`, `admin_adjust_customer_balance`).

---

## 6. Post-Deployment Smoke Test Protocol

Perform this 5-minute sanity check on `https://gyftkart.in` after deployment:

1. [ ] **Homepage & Brands**: Verify top brands load from Supabase with correct discount badges and denominations.
2. [ ] **Cart & Checkout**: Add a brand voucher (e.g. Amazon / Flipkart) to cart and proceed to `/checkout`.
3. [ ] **Payment Methods**: Confirm UPI Direct QR code and Razorpay buttons render as expected.
4. [ ] **Customer Profile & Orders**: Check `/orders` table shows descending S. No. indexing, status filters, and GST Tax Invoices.
5. [ ] **Customer Wallet**: Verify `/wallet` displays available balance, top-up modal, and dual timestamps (`Created` / `Completed`).
6. [ ] **Admin Portal**: Log in at `/admin` (`gyftkart@gmail.com`). Verify navigation tabs:
   - `/admin/gift-card-sales`
   - `/admin/brands`
   - `/admin/corporate-inquiries`
   - `/admin/customer-ledger`
   - `/admin/company-ledger`
   - `/admin/b2b-customers`
   - `/admin/b2b-ledger`
   - `/admin/upi-direct`
7. [ ] **Invoice PDF Generation**: Open any delivered order and click "Invoice" to confirm A4 printable view renders without header/footer distortion.
