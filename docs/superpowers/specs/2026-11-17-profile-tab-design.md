# Profile tab

Designed on 2026-11-17. Status: **agreed design, implemented on `feat/profile-tab` (pending device check)**. Tracks
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
work, because it is the App Review 5.1.1(v) fix. That release has the account
group (account + Premium), the Barklog section (Rate on the App Store, Send
Feedback, About), Sign Out and Delete Account. Stats (#82) and Release alerts (#83) arrive in later releases in the
positions fixed below; this deviates from step 4 of the release alerts
rollout, which bundled the Profile tab with notifications.

The website's privacy, support and terms pages already describe Profile →
Delete Account, so deploy the site together with this app release, not before.
The delete alert names release alerts among the data removed; that is
intended, since #83 follows in a later release and the copy need not change
then.

## Screen

```
Profile                                  (large title, no toolbar items)
┌───────────────────────────────────────┐
│ (avatar)  **Name**                    │  title3, semibold
│           Profile, email and security › │  → Clerk profile (pushed)
├───────────────────────────────────────┤
│ [★] Barklog Premium            Active │  orange tile; → Customer Center
│ [☆] Get Barklog Premium               │  orange tile; → paywall
└───────────────────────────────────────┘
 STATS                                       (#82)
 RELEASE ALERTS                              (#83)
 BARKLOG
┌───────────────────────────────────────┐
│ [💬] Rate on the App Store           ↗ │  blue tile; → App Store review
│ [✈] Send Feedback                     │  green tile; → mail compose sheet
│ [i] About                           › │  indigo tile; → About Barklog (pushed)
└───────────────────────────────────────┘
 Suggest a feature or report a problem. I read every message.
┌───────────────────────────────────────┐
│ [⇥] Sign Out                          │  grey tile
└───────────────────────────────────────┘
┌───────────────────────────────────────┐
│ [🗑] Delete Account                    │  red tile, red text
└───────────────────────────────────────┘
```

A grouped, inset list like iOS Settings, built with `@expo/ui` SwiftUI
(`Form`, `Section`, `Button`) and React Native `Alert` for confirmations, so it gets
native row metrics, Dynamic Type and dark mode. Section order is fixed: account
group, Stats, Release alerts, later settings, the Barklog section (Rate, Send
Feedback, About), Sign Out, Delete Account.

The Barklog section (changed in design review, 2026-11-17) has a "Barklog"
header, so its rows drop the app name and fit one line in all five languages
at the default text size; the longest is "Valorar en la App Store". "Send
Feedback" is Apple's own wording; the footer says what it is for: "Suggest a
feature or report a problem. I read every message." A section with no content yet is simply absent, never an empty header.

Rows follow Expo UI's
[iOS Settings recipe](https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/#ios-settings-app)
(design review, 2026-11-17): `plain` buttons, so the tint no longer turns every
row into a blue link; text in hierarchical styles
([secondary text styling](https://docs.expo.dev/versions/latest/sdk/ui/swift-ui/#secondary-text-styling)),
which follow light and dark mode; and a white symbol on a 28 pt rounded tile in
an iOS system colour (`systemOrange`, `systemBlue`, `systemGreen`, `systemIndigo`, `systemGray`,
`systemRed`),
which have their own dark variants, as Settings' tiles do. Delete Account's text
is system red. Each row carries an explicit accessibility label, so VoiceOver
never reads a tile's symbol name.

### Rate on the App Store

Added in design review (2026-11-17). Opens the App Store page from
`ios.appStoreUrl` in `app.json` (read with `StoreReview.storeUrl()`) with
`action=write-review` added, and has a trailing `arrow.up.forward` because it
leaves the app. The row is left out of a build without a store URL.
`expo-application` cannot supply this: it exposes the bundle id, version and
build, not the App Store's numeric id. Not `StoreReview.requestReview()`: Apple forbids asking for the
system rating prompt from a button, and the system may show nothing. The
automatic prompt stays with `useReviewPrompt`.

### Tab

- Fourth `NativeTabs` trigger, placed before Search so Search stays the
  rightmost tab (design review, 2026-11-17): label "Profile",
  `person.crop.circle` / `person.crop.circle.fill`, Material `person`.
- Route `src/app/(tabs)/profile/` with its own `Stack`, like Explore; screen in
  `src/features/profile/`.
- iPad: with `sidebarAdaptable` it appears as a sidebar item. As built, the list
  uses SwiftUI's inset-grouped `Form` margins with no width cap. That is
  accepted pending the device check; cap it with `frame(maxWidth)` if the check
  shows rows stretching.

### Account group

- **Account row**: avatar (Clerk `imageUrl`; Clerk generates a default image
  when the user has no photo, so the `person.crop.circle.fill` symbol shows
  only when there is no image URL at all). Title: full name in `title3`
  semibold, like Settings' Apple Account row, or the primary email if there is
  no name. Subtitle, in hierarchical secondary: what the row manages, "Profile,
  email and security" (changed 2026-11-17; it showed the email before).
  Disclosure chevron, like About; the rows that leave the app have
  `arrow.up.forward` instead.
- Tapping **pushes** `UserProfileView` on the Profile stack, with the route's
  header hidden, `isDismissible={false}` and `onHostBack={() => router.back()}`,
  so Clerk's own navigation chrome and swipe-back take over. This replaces the
  `Modal` in `ProfileToolbar`, which existed only because there was no stack to
  push into.
- Signing out from inside Clerk's view keeps working: the auth gate already
  reacts to the session ending.
- As built, the view is pushed on the Profile stack via `onHostBack`, and
  `profile-toolbar.tsx` (with its `Modal`) was deleted. The device check is
  still pending (title or toolbar lost, double back, sign-out leaving a stale
  route). Fallback if the push misbehaves: present it as a sheet from the
  account row.
  Deletion does not depend on it, since Delete Account is our own row.

### Premium

Decision changed from the release alerts design: the Premium star **leaves
the toolbars**. Free users still meet the paywall at the point of need (the
slots counter on Home and the slot-limit / 402 path); subscribers manage
subscriptions from a settings-like place, as on iOS.

- As built, the Premium row has no disclosure chevron: it opens a modal sheet
  (paywall or Customer Center), and iOS reserves the chevron for pushes.
- Premium row in the account group, with `star.fill` / `star` like the old
  star (`usePremiumStar` logic):
  - subscriber: "Barklog Premium", trailing "Active", opens RevenueCat Customer
    Center;
  - free: "Get Barklog Premium", opens the paywall;
  - entitlement unknown: row hidden, so a subscriber never sees it flip.

### Sign Out

- Own section, `rectangle.portrait.and.arrow.right` on a grey tile, text in the
  primary style (not red), so it reads differently from Delete Account.
- Tapping shows an **alert**, the same form as Delete Account: title "Sign
  out of Barklog?", a message that the backlog stays saved in the account,
  and buttons Cancel and "Sign Out" (destructive). Changed in design review
  (2026-11-17): it was an action sheet, which on iPad could not anchor to its
  row and appeared as a centred sheet; one form for both account actions reads
  more consistently.
- Confirming calls Clerk `signOut()`; the auth gate clears personal data per
  ADR-0004, exactly as when signing out from Clerk's view.

### Delete Account

- Own section, last, `trash.fill` on a red tile, red text (destructive role).
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
- **Reverification (verified 2026-11-17).** The earlier expectation that it
  would not be needed (clerk-ios's delete section calls the same `DELETE /me`
  after only typing `DELETE`, seen on 2026-09-10) is superseded: on 2026-11-17
  both Clerk instances' public `/v1/environment` report
  `user_settings.actions.delete_self: true` and
  `auth_config.reverification: true`. As built, `user.delete()` runs directly;
  when Clerk answers `session_reverification_required` (the session was not
  recently verified), a "Confirm it's you" alert's Continue pushes Clerk's
  profile view, whose own delete flow re-authenticates. A recently signed-in
  session (for example an App Review reviewer's) deletes directly. No custom
  re-sign-in screen. Clerk settings are per instance, so recheck both if
  either changes.

### Haptics

Per the [haptic rule](2026-08-27-barklog-mobile-design.md#haptics)
(`lib/haptics/decision.ts`): no new events.

| Event                         | Haptic                                         |
| ----------------------------- | ---------------------------------------------- |
| Sign out confirmed            | none (the alert and sign-in screen are it)     |
| Account deleted               | none (the alert and sign-in screen are it)     |
| Account deletion failed       | error, via `writeFailed`, with the error alert |
| Rows, navigation, Premium row | none / native                                  |

### Toolbars

- Remove `ProfileToolbar` from Home, Explore and Search, and delete the
  component, its test and `usePremiumStar` (logic moves into the Premium row).
- Strings `profile.openAccount` and the star's accessibility labels go; new
  `profile.*` strings are added in all five locales.

### Send Feedback

Added in design review (2026-11-17), in the Barklog section. A
`paperplane.fill` row that opens the system mail compose sheet
(`expo-mail-composer`) inside the app, to `chernonog.vova+barklog@gmail.com`
with the subject "Feedback About Barklog" (English: it is for the developer's
inbox). The body is empty space to write in, then a "—" line, one translated
sentence asking the user to keep or remove the details, and English-labelled
details: app version and build, the running update (embedded, its id, or none
in development) and channel, iPhone or iPad with
the iOS version, app language, Clerk user id and Premium status. Everything is
visible and editable before sending; nothing is sent automatically. Without
Mail set up it falls back to a `mailto:` link (the user's default mail app),
and with no mail app at all an alert gives the address. A failing sheet also
falls back to `mailto:`, and a second tap while the sheet is open does nothing.
The privacy policy's "Sending feedback" section discloses these details and
lists Google (Gmail) among the services that handle data.

### About Barklog

Added in design review (2026-11-17); replaces the version footer that closed
the Profile tab. A pushed screen in the Profile stack (`profile/about`):

- Header: the mascot, "Barklog" and "Version {version} ({build})" from
  `expo-application` (`nativeApplicationVersion`, `nativeBuildVersion`): the
  installed binary's own values, which an over-the-air update cannot change
  (`expo-constants`' `expoConfig.version` comes from the update manifest).
- Privacy Policy, Terms of Use, Support (`barklog.gg/privacy`, `/terms`,
  `/support`): App Review expects privacy and terms reachable inside the app
  (5.1.1(i), 3.1.2), and the paywall, the only other place, is never seen again
  by a subscriber.
- Game data by IGDB (`igdb.com`), the credit IGDB's terms ask for, and Source
  code (the GitHub repository the website already links).
- Every link opens outside the app (`expo-linking`), as the share feature
  does; no in-app browser dependency.
- Last section: "Created by Volodymyr Chornonoh" linking to
  `chornonoh-vova.com`, with the footer "Designed and developed in Ukraine 🇺🇦",
  centred. The name stays in Latin script in every language.
- Side effect of adding `expo-application`: `@clerk/expo` loads it when
  present, then sends `x-bundle-id` and `x-app-version` on its requests and
  enforces any minimum app version set on the Clerk instance (blocking with
  its update screen). Neither instance sets one: on 2026-11-17 neither
  `/v1/environment` had a `minimum_supported_version` under
  `auth_config.native_settings`. Setting one later now takes effect.

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
