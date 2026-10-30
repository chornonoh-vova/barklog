# Premium device verification

Use this checklist to verify the native purchase flow against a backend you can
inspect. Automated tests cover cap enforcement, webhook processing, server
refresh and device coordination; they do not establish that the configured store,
paywall and deployed webhook work together. See the
[Premium reference](superpowers/specs/2026-09-01-premium-subscription-design.md).

## Setup

- Follow the [README](../README.md) for local dependencies and device builds.
- [Mobile environment selection](../apps/mobile/src/lib/env.ts) uses
  `EXPO_PUBLIC_REVENUECAT_TEST_KEY` when `__DEV__` is true and
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY` otherwise. Choose and inspect the actual build
  accordingly; a development build does not exercise the iOS-key path.
- Confirm the chosen RevenueCat project has the `barklog_premium` entitlement,
  intended offerings and Customer Center configuration. Confirm the API's
  RevenueCat credentials and webhook destination belong to that environment.
- Set `EXPO_PUBLIC_API_URL` to the API whose database you will inspect. A local API
  needs a reachable webhook endpoint to test delivery; a successful device
  purchase alone does not establish that the local API received an event.
- Use the Test Store path for development coverage and separately verify the
  iOS-key path with the intended Apple test distribution. Follow current provider
  configuration for test accounts, purchase acceleration and product eligibility;
  this repository does not define those external settings.
- Record build, API environment, account, product and result for each pass. Local
  purchase simulation alone is insufficient evidence for server reconciliation.

## Checklist

- [ ] **Free-tier cap:** On a free account, fill `FREE_ACTIVE_SLOTS` unfinished
      slots (currently 10). Another slot-consuming add presents the dismissible
      paywall. Completing a game releases a slot and allows another add.
- [ ] **Purchase without relaunch:** Buy an offered subscription. After refresh,
      `GET /api/me` reports Premium and the previously blocked add succeeds in the
      same session. Check the intended price, terms and legal links in the actual
      rendered paywall rather than relying on historical screenshots.
- [ ] **Server evidence:** Confirm the subscription row and the delivered event.
      The subscription has a `sandbox` column; the event's raw payload records
      `environment` (it does not have a separate `sandbox` column). Refresh can
      populate a subscription without proving webhook delivery, so check both.
- [ ] **Renewal and cancellation:** When the configured test subscription renews,
      inspect its updated facts. Turning off renewal should preserve Premium until
      expiry; after expiry the free-tier cap returns without deleting existing
      backlog entries. Exercise trial conversion if the configured offering has a trial.
- [ ] **Restore:** On a second install using the same Clerk account, restore the
      purchase and verify server entitlement refresh without buying again.
- [ ] **Account switch:** Sign out and sign into a different free Clerk account.
      Verify its own entitlement and backlog. Repeat a direct account switch if
      supported by the authentication UI; do not assume a signed-out interval.
- [ ] **Shared-link add:** At the free-tier cap, identify a shared link and add a
      candidate. Verify the same paywall behavior as an ordinary game screen.
- [ ] **Network failure:** Where the advisory slot check allows a request through,
      disconnect and attempt a write. Verify the network error is not treated as
      a server 402. At a known full cap, the cached slot check can open the paywall
      before a network request, so that case cannot prove offline error handling.
- [ ] **Customer Center:** As a Premium account, check the toolbar entry on Home,
      Explore and Search, open it and verify purchase management/restore actions.

A completed pass records observed behavior for that build and environment. It
must not be used to close the separate asynchronous account-isolation gap in
[ADR-0004](adr/0004-account-switch-isolation.md).
