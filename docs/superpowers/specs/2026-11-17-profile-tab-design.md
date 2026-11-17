# Profile tab

Designed on 2026-11-17. Status: **agreed design, not implemented**. Tracks
[#72](https://github.com/chornonoh-vova/barklog/issues/72) under the Profile
tab epic [#65](https://github.com/chornonoh-vova/barklog/issues/65). It refines
the _Profile tab_ section of the
[release alerts design](2026-11-13-release-alerts-and-countdowns-design.md) and
**changes one decision there**: the Premium star leaves the toolbars and lives
only in Profile (see [Premium](#premium)).

Reviewed against Apple's Human Interface Guidelines:
[tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars),
[settings](https://developer.apple.com/design/human-interface-guidelines/settings),
[managing accounts](https://developer.apple.com/design/human-interface-guidelines/managing-accounts),
[alerts](https://developer.apple.com/design/human-interface-guidelines/alerts),
[action sheets](https://developer.apple.com/design/human-interface-guidelines/action-sheets)
and [playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics),
and the account deletion requirement in App Review Guideline 5.1.1(v).

## Intent

Account deletion has been rejected twice by App Review (5.1.1(v)) because it
sits behind the toolbar account button → Account → Security → bottom of the
page. Separately, the app has no place for per-user settings, and the release
alert time ([#83](https://github.com/chornonoh-vova/barklog/issues/83)) and
backlog stats ([#82](https://github.com/chornonoh-vova/barklog/issues/82)) need
one.

The Profile tab is that place. It should **look and behave like iOS Settings**
so it feels familiar without explanation: an account group at the top, then
content sections, then the account actions at the bottom. Moving the account
button and the Premium star here also leaves Home, Explore and Search with
cleaner toolbars.

### Goals

- A fourth tab, Profile, always visible and never disabled.
- Account deletion reachable in two taps from launch (Profile tab → Delete
  Account), followed by one confirmation.
- Sign Out and Delete Account are visually distinct and both confirmed, so
  neither happens by accident.
- Premium status and management live here; the toolbars carry no account or
  Premium buttons.
- Works on iPhone and on iPad with `sidebarAdaptable`; all five languages;
  accessibility text sizes.
- Sign-out and account switch behave as before (ADR-0004).

### Non-goals

- Stats content (#82) and the Release alerts section (#83). This design fixes
  their position only.
- Editing name, email, password or sessions in our own UI; Clerk's profile view
  keeps doing that.
- An in-app haptics or notifications switch.
- Changes to the server's deletion handling (already done, see below).

### Anti-goals

- A sign-out or deletion that can happen with a single stray tap.
- A Delete Account path that still requires knowing Clerk's Security page.
- Signing out or deleting an account leaving the previous account's data on the
  device (ADR-0004).
- Deleting the account while implying the App Store subscription is cancelled.

## Approaches considered (account deletion)

`UserProfileView` (`@clerk/expo-native-components` 0.4.4) cannot open on its
delete page: it takes only `customPages`, `customDestinations`,
`isDismissible`, `onDismiss` and `onHostBack`. So "a row that opens Clerk's
deletion flow" is not possible as such.

1. **Our alert, then `user.delete()` — chosen.** Profile → Delete Account →
   destructive alert → Clerk JS `user.delete()`. Meets two taps, uses the alert
   weight iOS users know, and lets us state the subscription caveat.
2. **Our own confirmation page with "type DELETE".** Strongest guard, but
   heavier than anything in iOS Settings; the alert plus a separate red group
   already prevents accidents.
3. **Open Clerk's profile.** Lands on the root, not the delete page: Security →
   scroll → type DELETE. This is the path App Review missed twice.

## Shipping

Ships on its own from `main` as an app release, ahead of the release alerts
work, because it is the App Review 5.1.1(v) fix. That release has only the
account group (account + Premium), Sign Out, Delete Account and the version
footer. Stats (#82) and Release alerts (#83) arrive in later releases in the
positions fixed below; this deviates from step 4 of the release alerts
rollout, which bundled the Profile tab with notifications.

## Screen

```
Profile                                  (large title, no toolbar items)
┌───────────────────────────────────────┐
│ (avatar)  Name                        │
│           email@example.com         › │  → Clerk profile (pushed)
├───────────────────────────────────────┤
│ ★  Barklog Premium          Active  › │  subscriber → Customer Center
│ ☆  Get Barklog Premium              › │  free → paywall
└───────────────────────────────────────┘
 STATS                                       (#82)
 RELEASE ALERTS                              (#83)
┌───────────────────────────────────────┐
│ ⇥  Sign Out                           │  normal tint
└───────────────────────────────────────┘
┌───────────────────────────────────────┐
│ 🗑  Delete Account                     │  red
└───────────────────────────────────────┘
            Barklog 1.4.0 (123)
```

A grouped, inset list like iOS Settings, built with `@expo/ui` SwiftUI
(`Form`/`List`, `Section`, `Button`, `ConfirmationDialog`, `Alert`) so it gets
native row metrics, Dynamic Type and dark mode. Section order is fixed: account
group, Stats, Release alerts, later settings, Sign Out, Delete Account, version
footer. A section with no content yet is simply absent, never an empty header.

### Tab

- Fourth `NativeTabs` trigger after Search: label "Profile",
  `person.crop.circle` / `person.crop.circle.fill`, Material `person`.
- Route `src/app/(tabs)/profile/` with its own `Stack`, like Explore; screen in
  `src/features/profile/`.
- iPad: with `sidebarAdaptable` it appears as a sidebar item. The list stays a
  single readable column (the existing column-width helpers), not full width.

### Account group

- **Account row**: avatar (Clerk `imageUrl`, falling back to
  `person.crop.circle`), full name or, if absent, the primary email as the
  title, with the email as a secondary line when a name exists. Disclosure
  chevron.
- Tapping **pushes** `UserProfileView` on the Profile stack, with the route's
  header hidden, `isDismissible={false}` and `onHostBack={() => router.back()}`,
  so Clerk's own navigation chrome and swipe-back take over. This replaces the
  `Modal` in `ProfileToolbar`, which existed only because there was no stack to
  push into.
- Signing out from inside Clerk's view keeps working: the auth gate already
  reacts to the session ending.
- Untested risk, so spike it first: today's `Modal` was chosen because Clerk
  dismissed its own view and left a pushed route with nothing to pop (before
  `onHostBack` existed); the iOS 26 toolbar wipe recorded in
  `profile-toolbar.tsx` came from Clerk's `UserButton`, not this view. _Builder's
  call:_ if the push misbehaves (title or toolbar lost, double back, sign-out
  leaving a stale route), keep today's sheet presentation from the account row.
  Deletion does not depend on it, since Delete Account is our own row.

### Premium

Decision changed from the release alerts design: the Premium star **leaves
the toolbars**. Free users still meet the paywall at the point of need (the
slots counter on Home and the slot-limit / 402 path); subscribers manage
subscriptions from a settings-like place, as on iOS.

- Premium row in the account group, with `star.fill` / `star` like the old
  star (`usePremiumStar` logic):
  - subscriber: "Barklog Premium", trailing "Active", opens RevenueCat Customer
    Center;
  - free: "Get Barklog Premium", opens the paywall;
  - entitlement unknown: row hidden, so a subscriber never sees it flip.

### Sign Out

- Own section, `rectangle.portrait.and.arrow.right`, normal tint (not red), so
  it reads differently from Delete Account.
- Tapping shows a **confirmation dialog** (action sheet; a popover anchored to
  the row on iPad): title "Sign out of Barklog?", buttons "Sign Out"
  (destructive) and Cancel. An action sheet is HIG's form for confirming a
  destructive action the person started; sign-out is recoverable, so it gets
  the lighter form.
- Confirming calls Clerk `signOut()`; the auth gate clears personal data per
  ADR-0004, exactly as when signing out from Clerk's view.

### Delete Account

- Own section, last, `trash`, red (destructive role).
- Tapping shows an **alert**:
  - title "Delete your account?";
  - message: the backlog, ratings and release alerts are permanently deleted
    and cannot be restored; an active Barklog Premium subscription is not
    cancelled by this and must be cancelled in App Store subscriptions
    (shown to everyone, not only known subscribers: the entitlement can be
    unknown or stale, and ADR-0006 records that deletion never cancels it);
  - buttons Cancel and "Delete Account" (destructive). The destructive button is
    never the default/preferred action.
- Confirming calls Clerk JS `user.delete()` with a progress state on the row
  (disabled, no second tap). On success Clerk ends the session and the auth
  gate shows sign-in and clears local data (ADR-0004).
- On failure: error alert plus the existing `writeFailed` haptic event.
- The server needs nothing new: `apps/api/src/routes/webhooks.ts` handles
  Clerk's `user.deleted` and scrubs the user's data in one transaction,
  regardless of where deletion started.
- **Reverification.** Expected not to be needed: clerk-ios's own delete
  section calls the same `DELETE /me` after only typing `DELETE`, verified with
  no re-auth on both instances on 2026-09-10. Still verify `user.delete()` on
  the dev **and** production instances (Clerk settings are per instance) as the
  first step, including that "Allow users to delete their accounts" is on.
  If reverification turns out to be required, the agreed fallback is: present
  Clerk's own reverification prompt from the alert's confirm step (via
  `useReverification`) if Clerk supplies a native UI for it; if it does not,
  the Delete Account row opens Clerk's profile view instead (whose own delete
  flow handles re-authentication) and the App Review notes describe that path.
  No custom re-sign-in screen.

### Haptics

Per the [haptic rule](2026-08-27-barklog-mobile-design.md#haptics)
(`lib/haptics/decision.ts`): no new events.

| Event                         | Haptic                                         |
| ----------------------------- | ---------------------------------------------- |
| Sign out confirmed            | none (the dialog and sign-in screen are it)    |
| Account deleted               | none (the alert and sign-in screen are it)     |
| Account deletion failed       | error, via `writeFailed`, with the error alert |
| Rows, navigation, Premium row | none / native                                  |

### Toolbars

- Remove `ProfileToolbar` from Home, Explore and Search, and delete the
  component, its test and `usePremiumStar` (logic moves into the Premium row).
- Strings `profile.openAccount` and the star's accessibility labels go; new
  `profile.*` strings are added in all five locales.

### Version footer

"Barklog {version} ({build})" from `expo-constants`/native app info, small and
secondary, below the last section. Selectable is not required.

## Accessibility

- Rows are buttons with their visible text as the label; icons are decorative.
- Premium row's accessibility label combines title and status ("Barklog
  Premium, active").
- Layout must hold at accessibility text sizes: account row wraps, no truncated
  email at the largest size beyond a tail truncation.

## Acceptance (from #72)

- Tab always visible, never disabled; content explains itself when empty.
- Delete Account reachable in two taps from launch.
- Five languages, accessibility sizes, iPhone and iPad checked.
- Sign-out and account switch behave as before (ADR-0004).
- Human step: design review of the screen before merge.

## Documentation updates (part of the work)

- ADR-0006: deletion is initiated through Clerk, from either Clerk's native
  account controls, the app's own Delete Account row (Clerk JS
  `user.delete()`), or the dashboard; webhook processing unchanged.
- Release alerts design, _Profile tab_: link here and record that the Premium
  star no longer stays in toolbars, and that the tab shipped separately.

## Left to the builder

- Exact `@expo/ui` composition (`Form` vs `List` with inset grouped style) and
  how the avatar image is rendered.
- Exact string wording in each language, keeping the meaning above.
- Test split: pure helpers (row titles, Premium row state) unit-tested; screen
  behavior with the existing Jest render helpers.
