# TURFBOOK — Smart Turf Booking & Management Platform

**Book. Play. Repeat.**

TURFBOOK is a full-stack turf discovery, booking and management platform built with **React + Vite + TypeScript + Supabase PostgreSQL/Auth/Storage/RLS**.

## Included modules

- Customer, Owner, Staff and Admin roles
- Supabase email authentication and protected routes
- Turf discovery, sports, facilities and details
- Slot availability and database-side overlap prevention
- Temporary booking lifecycle foundation
- Booking, cancellation, refund and payment records
- UPI / Card / Net Banking / Pay at Turf payment architecture
- Favourites, reviews, coupons and notifications
- Secure booking QR + staff check-in/check-out
- Teams, team bookings and split payments
- Membership plans
- Tournaments, matches and registrations foundation
- Maintenance / blocked slots
- Staff and walk-in booking operations
- Support tickets
- Owner/Admin analytics and reports foundation
- Audit logs and security hardening

## 1. Frontend setup

Requirements: Node.js 20+ recommended.

```bash
npm install
copy .env.example .env
npm run dev
```

For macOS/Linux:

```bash
cp .env.example .env
npm install
npm run dev
```

Set these values in `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

**Never put a Supabase service-role key in `.env` variables beginning with `VITE_` or in browser code.**

## 2. Supabase database setup

Create a Supabase project, then open **SQL Editor** and run migrations in this exact order:

1. `001_initial.sql`
2. `002_owner_signup.sql`
3. `003_availability.sql`
4. `004_booking_lifecycle.sql`
5. `005_engagement_qr.sql`
6. `006_operations.sql`
7. `007_ops_hardening.sql`
8. `008_final_security.sql`
9. `009_public_discovery.sql`
10. `010_owner_application_signup.sql`
11. `011_primary_turf_owner.sql` (only if you intend to promote the verified account configured in this migration)
12. `012_customer_booking_flow.sql`
13. `013_customer_avatars.sql`
14. `014_customer_operations_security.sql`
15. `015_customer_recent_turfs.sql`
16. `016_customer_booking_reschedule.sql`
17. `017_customer_module_repairs.sql`
18. `018_razorpay_booking_payments.sql`
19. `019_admin_dashboard_security.sql`

Run each file once and stop if Supabase reports an SQL error. Fix that migration before moving to the next one.
The owner-promotion migration grants a privileged role to one specific verified email; review its contents before applying it to a different project.

The admin dashboard at `/admin` and compatibility route `/admin/operations` are available only to authenticated users with `public.user_roles.role = 'ADMIN'`. Apply migration `019` before using admin data and management actions.

## 3. Authentication

In Supabase Dashboard:

**Authentication → Providers → Email**

Enable Email/Password authentication.

For a college/demo deployment, email confirmation can be configured according to your project requirements. For production, keep verification enabled.

## 4. Storage buckets

Create these buckets:

- `turf-images`
- `turf-videos`
- `profile-images`
- `review-images`
- `tournament-images`
- `support-attachments`

Keep upload policies restrictive. Public read can be used only for assets intentionally published publicly; private user/support documents should use authenticated access or signed URLs.

## 5. Important booking rules

The frontend must never be the authority for availability.

The database RPC layer checks:

- overlapping bookings
- blocked slots
- maintenance windows
- authenticated ownership
- staff/owner access where applicable

Payment callbacks should be handled by a trusted server-side Supabase Edge Function or payment-provider webhook. Do not mark a booking as paid from a browser-only success page.

## 6. Payment safety

TURFBOOK stores payment metadata such as method, amount, status, transaction ID and gateway reference.

It must **never** store raw card numbers, CVV, PINs or banking passwords.

Gateway transaction/reference IDs should be unique. Migration `008_final_security.sql` adds uniqueness for non-empty gateway references and transaction IDs.

Razorpay Standard Checkout is implemented for booking payments (UPI, cards and net banking) with server-side order creation, signature verification, capture checks and signed webhook handling. Pay at Turf remains available.

Before enabling online payments:

1. In **Supabase → Edge Functions → Secrets**, configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `ALLOWED_ORIGINS`. Use Razorpay test credentials first. `ALLOWED_ORIGINS` must list the exact browser origins, comma-separated.
2. Deploy `razorpay-order`, `razorpay-verify`, `razorpay-failure`, and `razorpay-webhook` from `supabase/functions/`. Keep JWT verification enabled for the first three; `supabase/config.toml` disables it only for the signature-verified webhook.
3. In Razorpay Dashboard, enable UPI, cards, net banking, and automatic capture. Register `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook` as a webhook for `payment.captured` and `payment.failed`; set the webhook secret to the matching Supabase secret.
4. Test successful payment, decline, checkout dismissal, webhook retries, and duplicate callback delivery with Razorpay test mode before switching to live keys.

The browser receives only the Razorpay public key ID; secret keys and payment verification stay server-side. Paid membership checkout and collection of team split payments are not connected to Razorpay yet. Payment status must only change after trusted provider confirmation.

## 7. QR check-in

The booking QR architecture uses a random token whose SHA-256 hash is stored in the database. The raw token is not stored.

Staff access is checked against the assigned turf before check-in/check-out mutation.

Do not put customer passwords, payment credentials or other sensitive information into QR data.

## 8. Roles

### CUSTOMER
Own profile, bookings, payments, favourites, reviews, teams, membership, support and notifications.

### OWNER
Own turfs, slots, bookings, staff, maintenance, coupons, tournaments, reports and revenue operations.

### STAFF
Assigned turf operations, booking verification, QR check-in/out and walk-in bookings. Staff should not receive unrestricted owner/admin financial settings.

### ADMIN
Platform-wide management, approvals, refunds, moderation, reports, settings and audit review.

## 9. Pre-submission test checklist

### Authentication
- [ ] Register
- [ ] Login
- [ ] Logout
- [ ] Protected route redirect
- [ ] Role mismatch is blocked

### Booking
- [ ] Available slot can be booked
- [ ] Same slot cannot be booked twice
- [ ] Blocked slot cannot be booked
- [ ] Maintenance slot cannot be booked
- [ ] Cancellation creates correct refund record
- [ ] Payment failure does not confirm booking

### Owner
- [ ] Owner sees only own turf data
- [ ] Owner can block maintenance time
- [ ] Owner can view bookings/revenue
- [ ] Walk-in booking respects overlap rules

### Staff
- [ ] Unassigned staff cannot operate another turf's booking
- [ ] Valid QR can be verified
- [ ] Check-in works
- [ ] Check-out works
- [ ] Invalid QR is rejected

### Customer
- [ ] Favourite add/remove
- [ ] Review only after the required booking lifecycle
- [ ] Coupon validation
- [ ] Notifications/read state
- [ ] Team and split-payment flow

### Admin
- [ ] Turf approval
- [ ] Refund management
- [ ] User/turf/booking reports
- [ ] Audit log review

## 10. Production checklist

Before deployment:

- Configure Supabase Auth redirect URLs.
- Configure Storage policies.
- Configure payment provider webhooks through Edge Functions.
- Add rate limiting to sensitive Edge Functions.
- Verify every RLS policy using separate customer/owner/staff/admin test accounts.
- Enable database backups according to the Supabase plan.
- Add error monitoring and structured logs.
- Review CORS and redirect settings.
- Never expose service-role credentials.
- Test cancellation/refund rules with real business policy values.

## Build verification

Run the production build with:

```bash
npm run build
```

The production build succeeds in the current workspace. Supabase migrations still need to be applied to the target project and verified using separate customer, owner, staff and admin accounts before production use.
