# Direct booking system

Stage 1 of moving direct bookings off Lodgify. It runs alongside Lodgify: the
live site keeps the Lodgify widget until the switch-over below is done.

## How it fits together

| Part | Where | Notes |
|---|---|---|
| Database | Neon project `gamrie-bookings` | Branches: `main` (production, empty until switch-over), `dev` (dev site), `test` (automated tests only) |
| Schema | `db/migrations/*.sql`, applied with `npm run db:migrate` | Edits to applied migrations are refused; add a new file |
| Availability | `lib/booking/availability*.ts` | One answer combining bookings, live holds, imported calendars and owner blocks |
| Pricing | `lib/pricing/*` | Rate rules > nightly rates (Lodgify copy or admin) > base rate; integer pence |
| Holds | `lib/booking/holds.ts` | 30 min for guests (35 internally); per-property lock + database exclusion constraint |
| Payments | `lib/payments/*` | Stripe Checkout, manual capture, webhooks confirm bookings, daily balance charges |
| Gift vouchers | `lib/vouchers/*` | Gift Up! codes, redeemed at checkout; see below |
| Email | `lib/email/*` | Microsoft Graph from welcome@ via an outbox (sent exactly once, retried) |
| Calendar import | `lib/calendar/*` | Lodgify via its API (`/v2/availability`, one feed per property, bookings and closed dates) plus any iCal feeds; every 15 min on production, and on booking-page visits when over 10 min old; not real-time |
| Calendar export | `/api/ical/<token>.ics` | Bookings taken here + owner blocks for other channels; no guest details; links revocable |
| Admin | `/admin` | Microsoft 365 sign-in, allowlist in `admin_users` |
| Public pages | `/book/[slug]`, `/book/[slug]/confirmation` | Only exist where `DIRECT_BOOKING_ENABLED=true`; there, property pages and search link here instead of Lodgify |

The double-booking guarantees, from strongest down:

1. A Postgres exclusion constraint makes overlapping live reservations (holds
   and confirmed bookings, including turnover nights) impossible.
2. Every change to a property's availability takes a per-property advisory
   lock and re-checks availability inside it.
3. Payment is only captured after the booking is confirmed under that lock;
   if the dates were lost, the card authorisation is released uncharged.

## Running the tests

```
npm test                  # unit tests (no network)
npm run test:integration  # database tests on the Neon "test" branch (TEST_DATABASE_URL)
npm run test:e2e          # real-browser tests against a local site on the test branch
```

The integration and e2e suites refuse to run against `DATABASE_URL`, so they can
never touch dev or production data.

## Environment variables

`P` = Production, `D` = Preview/`dev` branch.

| Variable | P | D | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✓ | ✓ | Neon pooled string for that environment's branch (`main` / `dev`) |
| `DATABASE_URL_UNPOOLED` | ✓ | ✓ | Same, pooling off; used by migrations |
| `DIRECT_BOOKING_ENABLED` | at switch-over | `true` | Turns the public booking pages on |
| `AUTH_SECRET` | ✓ | ✓ | Different random value per environment |
| `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_ISSUER` | ✓ | ✓ | "Gamrie Chalets Admin Sign-in" app registration; secret expires after 24 months |
| `STRIPE_SECRET_KEY` | `sk_live_` | `sk_test_` | Live keys are refused anywhere but production |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_` | `pk_test_` | |
| `STRIPE_WEBHOOK_SECRET` | live endpoint | test endpoint | Each endpoint has its own `whsec_` |
| `CRON_SECRET` | ✓ | – | Scheduled jobs only run on production |
| `LODGIFY_API_KEY` | ✓ | ✓ | Prices, calendars and guest details; also creates direct bookings when `LODGIFY_BOOKING_PUSH` is on |
| `LODGIFY_BOOKING_PUSH` | `on` at switch-over | unset | Creates paid direct bookings in Lodgify. There's only one Lodgify account, so leave it off on dev except for a deliberate test |
| `EMAILOCTOPUS_API_KEY` / `EMAILOCTOPUS_LIST_ID` | ✓ | optional | Mailing list sign-ups from checkout. Without them, sign-ups wait in the database and are sent once they're set |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `CONTACT_MAILBOX` | ✓ | ✓ | Contact-form app registration; sends from welcome@ |
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | ✓ | optional | Required on production: protects holds from abuse |
| `GIFTUP_API_KEY` | ✓ | ✓ | Gift Up! API key. Everywhere but production uses Gift Up's test mode, so dev bookings can't spend real vouchers |

## Scheduled jobs (production only, `vercel.json`)

| Job | When | Does |
|---|---|---|
| `/api/cron/sync-calendars` | every 15 min | Imports external iCal feeds |
| `/api/cron/expire-holds` | every 5 min | Tidies lapsed holds (availability ignores them anyway) and gives back their gift vouchers |
| `/api/cron/send-emails` | every 5 min | Sends/retries queued email |
| `/api/cron/import-rates` | 04:00 daily | Copies nightly prices and stay limits from Lodgify |
| `/api/cron/import-lodgify-bookings` | 04:30 daily | Copies Lodgify's bookings (guest name, party size, country from the phone's dialling code; no contact details) for the admin bookings list |
| `/api/cron/charge-balances` | 09:00 daily | Charges balances due, to the saved card |
| `/api/cron/send-to-lodgify` | every 5 min | Sends paid direct bookings to Lodgify and newsletter sign-ups to EmailOctopus that weren't sent straight after payment |

## Gift vouchers

Vouchers are sold by Gift Up! (the embed on /gift-vouchers) and redeemed when
a guest books here. Only money-value vouchers work online; vouchers for a set
stay still go through the contact form.

1. The quote and hold endpoints look the code up at Gift Up; the browser's
   idea of the balance is never trusted.
2. A voucher pays what it can of the total. Anything left is paid by card
   in full when booking: no deposit, so there's never a later balance for a
   guest whose card wasn't taken.
3. The hold is created first (dates reserved), then the amount is redeemed at
   Gift Up. If Gift Up refuses, or doesn't answer clearly, the hold is
   released. An unclear answer is listed under *Needs attention* to check
   by hand in Gift Up.
4. Fully covered: confirmed straight away, no Stripe. Otherwise the guest
   pays the rest on Stripe, and the booking is confirmed only if the voucher
   redemption still stands.
5. Holds that don't become bookings (released, expired, payment failed) have
   their redemption undone at Gift Up. This runs when a hold is released,
   every time a new hold is made, and in the expire-holds job; failures are
   retried and listed under *Needs attention*.
6. Cancelling a confirmed booking in the admin area does **not** give the
   voucher back, like card payments aren't refunded automatically. Do it
   in Gift Up if you want to.

In the database a voucher is a payment with provider `GIFTUP` and kind
`VOUCHER` (states described in `db/migrations/0010_gift_vouchers.sql`), so
it counts towards what's been paid.

## Lodgify and the mailing list

Once a direct booking's first payment is taken (deposit, full payment or gift
voucher), it's created in Lodgify as **Booked** with the guest's name, email,
phone and address, the party size, the total, and an internal note giving the
reference, what's been paid, and that the website collects the balance. Lodgify
then sends its own guest emails and passes the dates on to the channels
straight away. Our site still takes every payment and sends its confirmation
email as the receipt.

- Lodgify's API can't record a payment, so the booking looks unpaid there.
  **Switch off Lodgify's automatic payment requests and reminders**, or guests
  may be asked to pay twice.
- A booking is never sent twice. If Lodgify refuses (for example the dates are
  already taken there) or doesn't answer clearly, it's listed under *Needs
  attention*. Check Lodgify, then on the booking page either send it again or
  enter its Lodgify booking number.
- Cancelling here doesn't cancel it in Lodgify: the admin page reminds you to.
- Lodgify's calendar then contains our own booking too. The admin area
  recognises it by its Lodgify booking number and doesn't list it twice or as
  a clash. Availability still counts it, which is harmless and keeps the dates
  blocked if it's left in Lodgify after a cancellation here.

Guests who tick the newsletter box at checkout are added to the EmailOctopus
list as subscribed (tag `website-booking`) once their booking is paid. Sign-ups
are queued in `newsletter_signups` and retried until EmailOctopus accepts them.

## Switch-over checklist

Do these in order, and only when you're ready to take real direct bookings.
Nothing here is reversible-by-accident: each step can be checked before the next.

**Before (no guest-visible change)**

1. Update the privacy policy to cover storing guests' booking details and address, Stripe
   processing, passing bookings to Lodgify, and the EmailOctopus mailing list.
2. In Stripe **live** mode: set the public business name (shown on the payment page and
   statements) to Gamrie Chalets; create a webhook endpoint
   `https://gamriechalets.co.uk/api/stripe/webhook` with the 7 events listed in the code
   (`lib/payments/webhook.ts`); note its signing secret.
3. In Neon, apply migrations to the `main` branch: `DATABASE_URL_UNPOOLED=<main> npm run db:migrate`.
   Set up properties, extras and rate rules in the admin area once it's live (step 5).
4. In Vercel **Production**, add every variable in the table above, with live Stripe keys,
   a new `AUTH_SECRET` and a random `CRON_SECRET`. Leave `DIRECT_BOOKING_ENABLED` unset.
5. Merge `dev` into `main`. The admin area, calendar import and price import now run on the
   live site; the public booking pages still don't exist.
6. Sign in to the live admin, add the Lodgify iCal feeds, import prices, and check the
   calendar and availability checker against Lodgify.

**Close the double-booking gap before taking bookings**

7. Other channels learn about direct bookings only through calendar sync. In the admin area
   (Calendar sync → Export links), create an export link per property and add it in Lodgify
   as an imported calendar for that property (Lodgify then passes the block on to Airbnb and
   Booking.com). Check Lodgify shows a test block within its sync interval. Channels only
   check imported calendars every so often, so a short double-booking window always remains;
   Lodgify's own sync frequency decides how short. With `LODGIFY_BOOKING_PUSH=on` (next
   step), paid bookings reach Lodgify within seconds instead, and the export link is a backup.
7a. In Lodgify, switch off automatic payment requests and reminders, and check which guest
   emails it sends for a new booking. Set `LODGIFY_BOOKING_PUSH=on` in Production.

**Go live**

8. Set `DIRECT_BOOKING_ENABLED=true` in Production and redeploy.
9. Tick **Directly bookable** for each property in the admin area.
10. Make one real booking with a real card, confirm the emails and Stripe payment, then
    cancel and refund it in Stripe.
11. Only then point the website's "Book" buttons and search at the new booking pages
    instead of Lodgify (a code change, made on request).

**After**

12. Rotate the test-mode secrets that were shared during setup (Stripe test webhook secret,
    Vercel protection-bypass secret).
13. Calendar reminder: the admin sign-in client secret expires 24 months after creation.

## Later (out of scope for Stage 1)

- Admin-created manual bookings (phone/email) with the `MANUAL` source.
- A Stripe payment link for guests whose balance charge fails (currently: email +
  "Retry balance charge" / "Record payment" in the admin area).
- Separate admin layout without the public header/footer.
- Rename `middleware.ts` to `proxy.ts` (Next 16 deprecation).
- A least-privilege database role for the app instead of the owner role.
