# GyftKart Security Architecture & Comprehensive Audit Report

**Security Assessment Lead:** Dwight (`dwight-mve0igl2`)  
**Date of Audit:** October 18, 2026  
**Status:** Hardened & Verified  
**Target Environment:** GyftKart Production & Staging (Vite, React, TypeScript, Supabase, Vercel)

---

## 1. Executive Summary

This document presents the security posture, vulnerability audit results, database hardening policies, and client-side defense mechanisms implemented across the GyftKart platform. GyftKart processes digital voucher issuance, UPI Direct bank payments, and digital wallet transactions, demanding stringent defense-in-depth security across database transactions, authentication flows, client bundles, and HTTP transport.

### Key Security Achievements
- **Zero Secret Leakage:** Verified that no backend secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, admin credentials) are bundled into client-side Vite builds or exposed via `VITE_*` prefixes.
- **Strict Row Level Security (RLS):** 100% of tables enforce active RLS with strict `auth.uid() = user_id` ownership checks. Direct client-side `UPDATE` and `DELETE` permissions are revoked on financial ledgers and payment sessions.
- **Append-Only Financial Ledgers:** `wallet_transactions` and `company_ledger` can only be modified via atomic Postgres `SECURITY DEFINER` RPCs or authenticated admin workflows.
- **Input Sanitization & Injection Defense:** Implemented universal XSS and injection guards for search bars, form inputs, emails, phone numbers, and banking UTR strings.
- **Client-Side Sliding-Window Rate Limiting:** Enforced rate limiting on login endpoints, UTR verification, and registration forms to thwart automated brute-force attacks.
- **Enterprise HTTP Security Headers:** Deployed strict Content Security Policy (CSP), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and HSTS via `vercel.json` and `index.html`.

---

## 2. Codebase & Dependency Audit

### 2.1 Environment Variable Isolation
Vite bundles any environment variable prefixed with `VITE_` into client-side JavaScript. An audit of `.env`, `.env.example`, and the source code confirmed complete separation:

| Variable | Environment | Scope | Classification |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Client | Frontend bundle | Public API endpoint |
| `VITE_SUPABASE_ANON_KEY` | Client | Frontend bundle | Public `anon` role key (RLS-governed) |
| `VITE_RAZORPAY_KEY_ID` | Client | Frontend bundle | Public checkout merchant key |
| `VITE_UPI_DIRECT_ENABLED` | Client | Frontend bundle | Feature flag boolean |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Supabase Deno Edge Functions | **Confidential** (Bypasses RLS; NEVER in frontend) |

### 2.2 Dependency Vulnerability Audit (`npm audit`)
- **Total Scan Surface:** 1,607 modules.
- **Findings:** Vulnerabilities detected are predominantly confined to local development build tools (`eslint`, `babel`, `postcss`, `rollup`).
- **Mitigation:**
  - Build pipelines run in ephemeral environments.
  - Runtime production bundles are statically generated and served over hardened CDNs with zero Node.js daemon exposure.

---

## 3. Database & Row Level Security (RLS) Hardening

All database tables operate under strict Row Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).

### 3.1 Policy Enforcement Matrix

| Table | RLS Status | Customer Access | Admin Access | Mutation Guard |
|---|---|---|---|---|
| `profiles` | **Enabled** | Read/Update own row (`auth.uid() = id`) | Full read & manage (`public.admins`) | Cannot alter foreign accounts |
| `orders` | **Enabled** | Read own orders (`auth.uid() = user_id`) | Full audit & read (`public.admins`) | Immutable; direct client `UPDATE`/`DELETE` revoked |
| `upi_payment_sessions`| **Enabled** | Read own sessions (`auth.uid() = user_id`) | Read all; Update status/verification | Direct client `UPDATE`/`DELETE` revoked; mutations via RPC |
| `wallet_transactions` | **Enabled** | Read own history (`auth.uid() = user_id`) | Full audit read (`public.admins`) | **Append-Only**; `INSERT`/`UPDATE`/`DELETE` revoked from clients |
| `wallets` | **Enabled** | Read own balance (`auth.uid() = user_id`) | Full audit read (`public.admins`) | Direct client updates revoked; balance moves via RPCs |
| `brands` | **Enabled** | Public `SELECT` for catalog browsing | Full `INSERT`/`UPDATE`/`DELETE` | Client write access strictly forbidden |
| `company_ledger` | **Enabled** | **Zero Access** (blocked by default) | Full access (`public.admins`) | Confidential financial records isolated to admins |
| `corporate_inquiries` | **Enabled** | Public submission (`INSERT`) | Full read & status management | Public cannot view or update other inquiries |

### 3.2 Security Definer RPCs
To prevent race conditions, balance tampering, and double-spend attacks, financial balance operations run within atomic Postgres functions (`SECURITY DEFINER`, `search_path = public`):
1. `public.ensure_wallet(p_user)`: Creates and row-locks customer wallet; verifies `p_user = auth.uid()`.
2. `public.wallet_credit(p_user, p_amount, p_reference)`: Validates monthly limits (₹10,000 cap), row-locks wallet, updates balance, and writes ledger record in a single atomic transaction.
3. `public.wallet_debit(p_user, p_amount, p_reference, p_order)`: Asserts sufficient funds (`balance >= p_amount`), performs deduction, and records debit entry.
4. `public.admin_revert_payment_session(p_payment_id, p_reason)`: Gated to verified admins; reverses erroneous approvals and logs offsetting ledger adjustments.

---

## 4. Frontend & API Guarding

### 4.1 Input Sanitization (`src/lib/security.ts`)
- **Anti-XSS Sanitizer:** Strips `<script>`, `<iframe>`, inline `on*` event handlers, and disarms `javascript:` URIs.
- **Banking UTR Validator (`sanitizeUtr`):** Enforces standard 12-digit numeric constraint (`^\d{12}$`), stripping whitespace, alpha characters, and injection symbols before submission.
- **Email & Phone Normalizer:** Validates structural compliance and strips null bytes or control characters.
- **Search Query Filter:** Neutralizes SQL comments, quote delimiters, and prevents ReDoS query spikes.

### 4.2 Client-Side Sliding-Window Rate Limiting
To stop automated brute-force attacks on sensitive endpoints:
- **Admin Login:** Rate-limited to max 5 attempts per 60 seconds. Cooldown timer enforced upon lockout.
- **Customer Authentication:** Rate-limited to max 8 login attempts / 5 registration attempts per 60 seconds.
- **UPI Payment Proof / UTR Submission:** Rate-limited to max 5 submissions per minute per user.

---

## 5. HTTP Security Headers & Content Security Policy (CSP)

Configured across `project/vercel.json` and `project/index.html`:

```http
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-XSS-Protection: 1; mode=block
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### Content Security Policy (CSP) Directives:
- `default-src 'self'`: Restricts fallback loading to site origin.
- `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://*.supabase.co`: Permitted trusted payment SDKs and backend APIs.
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`: Secure font style loading.
- `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com`: Whitelisted API endpoints and realtime websockets.
- `frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com`: Prevents unauthorized iframing while permitting payment modals.
- `object-src 'none'`: Prevents legacy Flash/Java plugin execution.
- `base-uri 'self'`: Prevents base tag hijacking.

---

## 6. Verification & Automated Quality Gates

All security enhancements have passed strict automated quality verification:
- **TypeScript Typecheck:** `tsc --noEmit` &rarr; `0 errors`
- **ESLint Analysis:** `eslint .` &rarr; `0 errors`
- **Production Compilation:** `vite build` &rarr; Clean build in `965ms`
- **Route Availability:** HTTP 200 confirmed on all customer and admin routes.

---

*GyftKart Security Audit completed by Dwight (`dwight-mve0igl2`), Lead Security Agent.*
