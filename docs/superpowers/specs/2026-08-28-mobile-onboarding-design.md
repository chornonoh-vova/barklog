# Mobile onboarding reference

Originally designed on 2026-08-28; reconciled with the implementation on 2026-10-29.
This replaces the original four-page implementation proposal.

## Purpose and behavior

Explain Barklog before asking a first-time visitor to authenticate. Onboarding is
an install-local introduction, not a server account attribute. A restored session
skips it, including when the session survives an app reinstall.

[OnboardingGate](../../../apps/mobile/src/features/onboarding/onboarding-gate.tsx)
wraps `AuthGate` in the [root layout](../../../apps/mobile/src/app/_layout.tsx).
The [decision function](../../../apps/mobile/src/features/onboarding/should-show-onboarding.ts)
uses the stored flag and Clerk's loaded sign-in state:

| Stored flag | Session    | Outcome                             |
| ----------- | ---------- | ----------------------------------- |
| Unknown     | Any        | Hold the splash while storage loads |
| Seen        | Any        | Continue to authentication          |
| Not seen    | Unknown    | Wait for session restoration        |
| Not seen    | Signed in  | Continue and mark onboarding seen   |
| Not seen    | Signed out | Show onboarding                     |

Clerk pending authentication is not treated as sign-out. The shared
[splash helper](../../../apps/mobile/src/lib/splash.ts) owns holding/releasing
the splash; each gate reports readiness. On auto-completion, the gate updates
its local state as well as storage so a later sign-out does not show the pages.

## Storage and presentation

[Storage](../../../apps/mobile/src/features/onboarding/storage.ts) uses the
shared [persistent flag](../../../apps/mobile/src/lib/storage/flag.ts) with key
`barklog.onboarding.seen`. Any stored value means seen; a missing value means
unseen. Read failures resolve to seen to avoid repeated introductions when
storage is broken. Write failures are swallowed, and Skip/Start completes
locally immediately. Consequently, a failed write can allow onboarding to return
on a later launch; persistence is best-effort.

The [page definitions](../../../apps/mobile/src/features/onboarding/pages.ts)
now contain **five** localized pages: welcome, backlog, Explore, shared links,
and IGDB attribution. The first four use mascot illustrations hosted through
`RNHostView`; attribution uses an SF Symbol and an `igdb.com` link. Copy comes
from the [locale resources](../../../apps/mobile/src/lib/i18n/locales/en.json).
The original symbol-only, English, four-page proposal is historical.

The [screen](../../../apps/mobile/src/features/onboarding/onboarding-screen.tsx)
uses a controlled SwiftUI page-style `TabView` with dots. Continue advances the
selection; Start completes the last page. Skip completes from earlier pages and
is hidden on the last while retaining its layout space. The SwiftUI host handles
the safe area; actual clipping, paging and accessibility must be checked natively.
There is no implemented settings replay control.

## Evidence and remaining verification

Jest covers the [decision](../../../apps/mobile/src/features/onboarding/should-show-onboarding.test.ts),
[gate](../../../apps/mobile/src/features/onboarding/onboarding-gate.test.tsx),
[pages](../../../apps/mobile/src/features/onboarding/pages.test.ts),
[screen](../../../apps/mobile/src/features/onboarding/onboarding-screen.test.tsx),
and [storage](../../../apps/mobile/src/features/onboarding/storage.test.ts).
These replace the original pure-only test plan; native mocks do not establish
real pager gestures, safe areas or splash timing.

Use the [device checklist](../../mobile-device-verification.md) for fresh,
returning and reinstalled sessions, light/dark appearance, large text and
landscape. To reproduce first-run onboarding, distinguish app-container storage
from a retained keychain session; deleting the app alone may still restore a
signed-in user and correctly skip onboarding.
