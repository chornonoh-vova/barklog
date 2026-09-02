# Premium device verification

None of this runs in the test suite. `apps/api`'s cap enforcement, the webhook,
and `/api/subscription/refresh` are covered by integration tests against a
real Postgres — but a _purchase_ only exists once Apple's or RevenueCat's own
servers agree it happened, and nothing in CI can make that call.

Two things shape everything below:

**StoreKit configuration files cannot be used.** A `.storekit` file simulates
purchases entirely on-device, so RevenueCat never sees them and its
server-side validation has nothing to check. Every step here runs against a
real backend — either Apple's sandbox or RevenueCat's Test Store — never a
local file.

**Two environments, on purpose.** RevenueCat's **Test Store** needs no Apple
sandbox account, shows the real App Store Connect prices, and accelerates
renewals to roughly 5 minutes for a weekly period and an hour for a yearly
one, auto-renewing five times before it cancels itself — which is what turns
the trial → renewal → cancellation steps into an afternoon's work instead of
a real subscription term. Its purchases still arrive tagged
`environment: SANDBOX`, and `isPremium` never looks at that flag, so they
exercise the real webhook, write a real `subscriptions` row, and answer
`GET /api/me` for real. What it cannot prove is that StoreKit itself works —
the native purchase sheet, App Store Connect's product configuration, trial
eligibility — because the Test Store never talks to Apple at all. Apple's own
**sandbox** does, and it has its own, slower acceleration: a weekly period
renews roughly every 3 minutes and a yearly one every hour, for up to 6
renewals before expiring.

Run the checklist once against the Test Store, then run steps 1–4 and 7–10
again against Apple's sandbox before submission. Steps 5 and 6 do not need a
second run there — they prove the server's handling of a renewal or
cancellation event, which is identical regardless of which store produced it;
only Apple's sandbox proves the purchase sheet and product configuration.

## Prerequisites

1. `EXPO_PUBLIC_REVENUECAT_TEST_KEY` in `apps/mobile/.env`, set to the Test
   Store API key from RevenueCat's dashboard. `src/env.ts` only reads this key
   under `__DEV__`, so an ordinary development build is enough for the Test
   Store pass:

   ```bash
   pnpm deps:up
   pnpm --filter api dev
   pnpm --filter mobile prebuild
   pnpm --filter mobile ios:device
   ```

2. In RevenueCat's Test Store project, `barklog_premium` exists with both
   products attached and a `default` offering pointing at them — the same
   shape as the App Store project, configured separately.

3. For the Apple sandbox pass: `expo run:ios` and `build:dev` (the
   `development` EAS profile) always build a dev client, so `__DEV__` is
   always `true` and the app always picks the Test Store key — that build can
   never reach Apple's sandbox no matter what account is signed in. Reaching
   it needs a build from a profile other than `development` (`preview`, or
   `production`), which is the first build in this feature that reads
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY` — confirm that key is set in that
   profile's EAS environment before building. Install it via TestFlight or ad
   hoc distribution, then sign a fresh sandbox Apple Account in under
   Settings → App Store → Sandbox Account (Settings → Developer on older
   iOS).

4. `EXPO_PUBLIC_API_URL` pointed at a server RevenueCat can reach. A dev build
   pointed at `localhost` will still show a successful purchase on-device, but
   no `subscriptions` row will ever appear — RevenueCat's webhook POSTs to
   `https://api.barklog.gg`, not to your machine. Either point
   `EXPO_PUBLIC_API_URL` at the deployed API for this checklist, or skip the
   row checks and verify the webhook separately with **Send test event** in
   RevenueCat's dashboard.

## Checklist

- [ ] **1. Fresh sandbox Apple Account signed in under Settings → Developer.**
      Add 10 games. Expected: the 11th add presents the paywall sheet, not an
      error.
- [ ] **2. At 10/10, finish a game.** Expected: the previously blocked add now
      succeeds — `completed` doesn't hold a slot.
- [ ] **3. Purchase yearly.** Expected: the sheet dismisses and the 11th add
      succeeds **without relaunching the app**. Relaunching is the natural
      thing to try next and it is exactly what would hide a broken listener:
      the unlock comes from `customerInfoUpdateListener` calling
      `refreshSubscription`, which invalidates `GET /api/me` — a relaunch
      re-fetches everything from scratch regardless of whether that chain
      works, so it would pass this step even with the listener silently
      broken.
- [ ] **4. Confirm rows landed.** Expected: a `subscriptions` row and a
      `subscription_events` row for the purchase, both with `sandbox: true`.
- [ ] **5. Let the trial lapse without cancelling.** Expected: a renewal
      event arrives and the `subscriptions` row's `period_type` moves from
      `trial` to `normal`.
- [ ] **6. Cancel the subscription.** Expected: `will_renew` goes `false`
      immediately while premium still holds — cancelling stops the next
      renewal, it doesn't revoke what was already paid for. After the current
      period's `expires_at` passes, confirm the free cap returns: the 11th
      slot is blocked again.
- [ ] **7. Restore purchases on a second install, same Clerk account.** Open
      the paywall (a fresh install, or a second simulator, signed into the
      same Clerk account) and use its built-in restore action. Expected: the
      cap lifts there too, with no separate purchase.
- [ ] **8. Sign out, sign in as a different Clerk user.** Expected: premium
      does **not** carry over to the new account. This is the failure that
      would otherwise only show up on a shared device, in front of a real
      user — `PurchasesProvider` calls `Purchases.logOut()` then
      `Purchases.logIn()` with the new Clerk `sub` on this transition
      specifically so RevenueCat's App User ID follows the session instead of
      the device.
- [ ] **9. Share a video into the app at 10/10.** Expected: resolving to a
      candidate and adding it presents the same paywall sheet as an ordinary
      add — not an `Alert` — proving the 402 handling is wired from
      `/shared/game/[id]` too, not only from the three tab-rooted detail
      screens.
- [ ] **10. Airplane mode, at 10/10.** Expected: attempting an add shows the
      "You're offline" copy, not the paywall — a network failure must not be
      mistaken for a blocked slot.
