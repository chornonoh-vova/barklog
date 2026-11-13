# Release alerts, countdowns and the Profile tab

Designed on 2026-11-13. Status: **agreed design, not implemented**. Tracking
epics live in GitHub issues (linked from each section once filed).
[ADR-0009](../../adr/0009-server-push-release-alerts.md) records the push
delivery decision, [ADR-0010](../../adr/0010-release-date-state-functions.md)
the single definition of release-date state, and
[ADR-0011](../../adr/0011-shared-translations-package.md) the shared
translations package; [CONTEXT.md](../../../CONTEXT.md) defines **release
alert**, **date precision** and **upcoming**.

Interaction details were reviewed against Apple's Human Interface Guidelines
on 2026-11-13: [notifications](https://developer.apple.com/design/human-interface-guidelines/notifications),
[managing notifications](https://developer.apple.com/design/human-interface-guidelines/managing-notifications),
[privacy](https://developer.apple.com/design/human-interface-guidelines/privacy),
[widgets](https://developer.apple.com/design/human-interface-guidelines/widgets),
[tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars),
[playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics),
[alerts](https://developer.apple.com/design/human-interface-guidelines/alerts),
[settings](https://developer.apple.com/design/human-interface-guidelines/settings) and
[toggles](https://developer.apple.com/design/human-interface-guidelines/toggles).

## Intent

Users asked to keep upcoming games on their radar. For the product, it is a
reason to come back to the app between play sessions. Four user-facing pieces:

1. **Release alerts**: a per-backlog-entry opt-in that pushes a notification
   when a precise release date becomes known, changes, or arrives.
2. **Detail-screen countdown**: days until release on an unreleased game.
3. **Release countdown widget**: a small home-screen widget for one chosen
   upcoming backlog game.
4. **Profile tab**: a fourth tab replacing the toolbar account button, holding
   account, Premium, the alert time setting, visible account deletion and the
   former Home stats.

### Goals

- A user can turn on a release alert from the game detail screen or from the
  Home row menu, and see that it is on (bell) in both places.
- Alerts fire at the user's chosen local morning time, on the user's local
  calendar day, never at sync time.
- Release dates whose day is unknown are never presented as a day (no
  countdown to a placeholder, no alert on a placeholder).
- Every server change is backward compatible with app builds already in the
  wild; the server ships and is verified against an old build first.

### Non-goals

- Alerts for games not in the user's backlog. Removing the entry removes the
  alert. This is a hard rule, not a default.
- Notifications for a vague date getting narrower ("2027" → "March 2027").
- Per-platform or per-region release dates. `first_release_date` (the earliest)
  is the release date.
- A widget that fetches on its own. Like the backlog widget, it updates when
  the app publishes a snapshot; a date announced while the app stays closed
  shows in the widget after the next app open.
- Medium/large or lock-screen countdown widgets.
- Explore's "Upcoming" and "Recently Released" shelves. Their queries compare
  `first_release_date` directly and ignore precision; moving them onto
  `@repo/release-dates` is a follow-up
  ([#89](https://github.com/chornonoh-vova/barklog/issues/89)), recorded as a
  mismatch in ADR-0010.

### Anti-goals

- Notifications at night, or several per game per day.
- A countdown or "release day" alert driven by a placeholder date.
- Any change that alters, reorders or deletes existing backlog entries
  (including during the precision backfill).
- Old app builds breaking or 400-ing because of new fields.
- A previous account's alerts reaching a device after an account switch.

## Domain terms

**Release alert**, **date precision** (precise vs vague) and **upcoming** are
defined in [CONTEXT.md](../../../CONTEXT.md). This design adds three working
terms:

- **Unclassified**: a game whose precision is stored as `null`, because the
  sync has not classified it yet or found no matching IGDB entry. Displayed
  like a vague date; never alerted on.
- **Last told**: the release date and precision a release alert last reported
  to the user (or saw at opt-in). Alerts compare the mirror to this, not to
  the previous sync.
- **Lapsed**: a vague or unclassified date whose placeholder day has passed.
  Not upcoming, and never shown as released.

## Approaches considered

**Delivery.** Server push via the Expo Push Service and `expo-notifications`
was chosen over on-device scheduled local notifications. Local scheduling
cannot learn that a date was announced or moved while the app is closed, and
"we finally know the date" is inherently a server-side observation of the
sync. See ADR-0009.

**Release alert storage and write** (chosen: A):

- **A. Own table, written through the existing backlog entry write.**
  `release_alerts` cascades from the backlog entry; the upsert body gains an
  optional `releaseAlert`. "Add as Waiting with an alert" is one request under
  the existing free-tier cap transaction. Old clients never send the field.
- B. Column on `backlog_entries`: the last-told fields would sit on every
  entry, and alert toggles fight the `updatedAt` bump that orders Home and the
  backlog widget.
- C. Separate alert endpoints: turning on an alert for a game not yet in the
  backlog becomes two requests with a cap check between them.

**Widget game choice** (chosen: any upcoming backlog game): the widget works
for users who decline notifications. Restricting it to alerted games would
leave the picker empty for new users.

**Stats placement**: inside Profile rather than a fifth tab.

## Shared foundations

Two architectural pieces come first; every later ticket builds on them.

### Release-date state functions (`packages/release-dates`, new)

A small pure package, `@repo/release-dates`, with no runtime dependencies beyond
`@repo/contracts` types. It is the **only** place that decides what a release
date means. The API, worker and app import it; none of them compares release
dates or precisions on its own. Required by ADR-0010.

- **Normalisation.** `toReleaseDate(firstReleaseDate, precision)` turns the
  wire/DB pair into `{ day: CalendarDay | null, precision }`, where
  `CalendarDay` is the UTC calendar day of the timestamp. A `null`/absent
  precision stays distinct ("unclassified") rather than being guessed.
- **Local day.** `localDay(instant, timeZone)` gives a user's calendar day;
  `daysBetween(a, b)` counts calendar days. These are the only day maths.
- **Display state (app).** `releaseDisplay(date, today)` returns exactly one of:
  - `countdown { days }` — precise, in the future;
  - `releaseDay` — precise, today;
  - `released` — precise, in the past;
  - `vague { precision, day }` — month/quarter/year/unclassified whose
    placeholder day is today or later;
  - `unannounced` — no date at all;
  - `lapsed` — vague/unclassified whose placeholder day has passed (shown as
    its vague label, never as released or counted down).

  `isUpcoming(display)` is `countdown | releaseDay | vague | unannounced` and
  drives turning the bell on, the Home menu item, both countdowns and the
  widget picker.

- **Alert transition (worker).** `evaluateAlert(alert, mirror, today)` takes
  `{ told: ReleaseDate | null, done, notifiedOn: CalendarDay | null }`, the
  mirror's `ReleaseDate` and the user's local day. It returns
  `{ notification, next }`, where `notification` is
  `null | announced | delayed | movedUp | dateUnconfirmed | releaseDay` and
  `next` is the alert state to persist **if** the notification is accepted (or
  immediately when `notification` is `null`). A notification's `next` sets
  `notifiedOn` to `today`; while `notifiedOn` equals `today` the function
  returns `null` with the state unchanged, so a game is notified at most once
  per local day and a change seen later that day goes out the next day. It
  encodes every row of the scenario table below and nothing else.
- **Opt-in state (API).** `initialAlert(mirror, today)` is the state a new
  alert starts in: last-told = the mirror, and **already done** when the
  mirror is precise and its day is today or earlier. Opting in on release day
  therefore never sends a release-day notification (the user is in the app at
  that moment), and opting in after release never sends anything.
- **Alert window.** `ALERT_WINDOW_MINUTES` (240) and
  `alertWindow(alertMinutes)` → `{ start, end }` in minutes after local
  midnight, where `end` is `min(start + 240, 1440)`. The worker sends only
  inside it; Profile shows it to the user. One definition, so the two cannot
  disagree.

**Testing is the point of this package.** Both families get:

- a table-driven test with one case per row of the scenario table (and per
  display state), named after the row;
- property-based tests (`fast-check`, a new dev dependency) for invariants:
  - evaluating again with the returned `next`, the same mirror and the same
    day never notifies (idempotence);
  - nothing notifies once `done`; a done alert changes state only by
    re-arming (row 10), which happens exactly when the mirror is precise and
    after `today`, and never notifies;
  - at most one notification per alert per local day: after a notification
    on day D, evaluating again on D with any mirror never notifies;
  - an unclassified mirror never notifies and never changes last-told;
  - every notification except `dateUnconfirmed` requires a precise mirror
    date;
  - `evaluateAlert` returns `releaseDay` **only if** the alert is not done and
    the mirror is precise with its day equal to `today`; and for an alert that
    is not done, a precise mirror day equal to `today` always yields
    `releaseDay` (the strict "iff" holds for `releaseDisplay` only);
  - `initialAlert` is done exactly when the mirror is precise and its day is
    today or earlier, and evaluating a fresh alert on the same day never
    notifies;
  - `alertWindow` never ends after local midnight and always starts at the
    chosen time;
  - a vague → vague change never notifies;
  - the two families agree: `evaluateAlert` says `releaseDay` only when
    `releaseDisplay` says `releaseDay`, and `announced/delayed/movedUp` only
    when it says `countdown`;
  - `localDay` across DST changes and UTC−12…UTC+14 offsets;
- 100% branch coverage enforced for the package in CI.

### Shared translations (`packages/i18n`, new)

`@repo/i18n` becomes the single source of truth for user-facing copy in the
app and the backend. Required by ADR-0011.

- Holds the five languages (en, uk, ru, de, es) as i18next resources, split
  into namespaces: `app` (everything in today's
  `apps/mobile/src/lib/i18n/locales/*.json`, moved, not copied) and
  `notifications` (the five release-alert notifications).
- Exports the language list, `isLanguage`, `formatLocale` (the region-qualified
  formatting locale the app already uses) and the resource types used by
  `i18next.d.ts`.
- Exports `formatReleaseDate(date, language)` built on `@repo/release-dates`: "5 June
  2027", "June 2027", "Q3 2027", "2027", "TBA". The detail screen, the widget
  and the notification body all use it, so a date reads identically
  everywhere.
- The app keeps its i18next instance, the Hermes plural-rules polyfill and
  `expo-localization`; it imports resources from the package. The worker uses
  i18next with the same resources, so interpolation and plurals behave
  identically.
- Stays in the app: `apps/mobile/locales/*.json` (Info.plist and widget
  `Localizable.strings`), because Expo's config plugin reads them at build
  time. The landing site is English-only and out of scope.
- A parity test fails when a key exists in one language but not another.

## Backend

### Mirror: date precision (`packages/igdb`, `apps/worker`, `packages/db`)

- New nullable column `games.release_date_precision` (enum
  `day|month|quarter|year|none`). `null` means "not yet classified".
- The IGDB query adds the release-date entries needed to classify
  `first_release_date` (IGDB's `release_dates` with its date-format field — use
  only non-deprecated fields; the nightly IGDB contract test must pass). Pick
  the entry whose timestamp equals `first_release_date`; no date at all →
  `none`; a date with no matching entry → `null` (unclassified), never a
  guess.
- Persist upserts the column with the rest of the game row.
- **Backfill** with the existing `worker --full` sync after the column ships.
  This is safe for backlog data: persist only upserts `games` rows
  (`ON CONFLICT DO UPDATE`) and replaces a game's own join rows; it never
  deletes games, so the `backlog_entries` cascade cannot fire. The backfill must
  complete before the alert scheduler is enabled (see rollout).
- Wire: `GameSummaryWire.releaseDatePrecision?: DatePrecision | null`,
  optional so older clients ignore it. The constant list lives in
  `@repo/contracts`.

### Release alerts (`packages/db`, `apps/api`)

Table `release_alerts`:

| Column                     | Notes                                                       |
| -------------------------- | ----------------------------------------------------------- |
| `user_id`, `game_id`       | PK; composite FK to `backlog_entries` `ON DELETE CASCADE`   |
| `told_release_date`        | date (UTC calendar day) or null                             |
| `told_precision`           | precision enum or null                                      |
| `completed_at`             | when the alert reached done, with or without a notification |
| `release_notified_at`      | only when a release-day notification was actually accepted  |
| `notified_on`              | user's local date of the last accepted notification         |
| `created_at`, `updated_at` |                                                             |

An alert is done when `completed_at` is set. Cases 6–7 set both columns;
case 8 and an opt-in that starts done set only `completed_at`. Re-arming
(row 10) clears `completed_at` and keeps the others as history.

Write: `backlogUpsertSchema` gains `releaseAlert: v.optional(v.boolean())`,
and `status` becomes optional **only for an alert-only write**, a body of just
`{ releaseAlert }`. A body without `status` must not carry `rating`. The
server, not the device's cache, decides what an alert-only write does:

- entry exists: toggle the alert, keep the stored status, skip the slot check
  and do not bump `updatedAt`;
- no entry and `true`: add the game as Waiting with the alert, through the
  slot check like any add (402 on a full free account);
- no entry and `false`: 404 `backlog_entry_not_found`.

The app sends only alert-only writes from the bell and the Home menu, so a
stale cached status can never move an entry back to Waiting.

- Omitted: alert unchanged (same convention as `rating`).
- `true`: create if absent, in the state `initialAlert(mirror, today)`
  returns, where `today` is the user's local day (`users.time_zone`, UTC
  when unknown). No notification on opt-in. If present, no-op (do not reset).
- `false`: delete.
- A write to an existing entry whose only effect is the alert does **not**
  bump the entry's `updatedAt`, so Home order and the backlog widget's "most
  recent" are unaffected. A write that adds the entry or also changes
  status/rating behaves as today.
- Runs inside the existing entry-write transaction; a new entry still goes
  through the slot check and 402s on a full free account (the app shows the
  paywall, which is desired).

The server is deployed before any app sends the field. Older servers' strict
schema would reject it, so the app must not ship alert UI ahead of the server.

Read: `BacklogEntryWire.releaseAlert?: boolean` on every entry the server
returns (list, detail, write responses). Optional in the type only for the
mobile build reading a not-yet-updated server during rollout.

### Push devices and settings (`packages/db`, `apps/api`)

- Table `push_devices`: `token` (PK, Expo push token), `user_id` (FK users,
  cascade), `locale` (one of the app's five), `created_at`, `updated_at`.
  Registering an existing token **reassigns** it to the calling user; this is
  what makes an account switch without a signed-out interval safe.
- `users` gains `release_alert_minutes` (smallint, minutes after local
  midnight, multiple of 30, default 540 = 09:00), `time_zone` (IANA, nullable;
  updated from the most recent device registration) and
  `release_alerts_run_on` (date; the user's local date already processed).
- `PUT /me/push-devices` `{ token, locale, timeZone }` — upsert/reassign,
  updates `users.time_zone`. The app calls it automatically, so it must not
  recreate a deleted account: refuse users with an
  [ADR-0006](../../adr/0006-clerk-account-deletion.md) tombstone. Today
  `ensureUser` does not check the tombstone for any write; fix it there so
  every write benefits.
- `DELETE /me/push-devices/:token` — called by the app on sign-out **before**
  Clerk sign-out.
- `GET /me` gains optional `releaseAlertMinutes`; `PATCH /me/settings`
  `{ releaseAlertMinutes }` validates 0–1410 step 30.

Account deletion removes devices, alerts and settings through existing
cascades from `users`.

### Scheduler and delivery (`apps/worker`)

- A second cron in the worker, every 30 minutes (`ALERTS_CRON`, default
  `*/30 * * * *`), separate from the nightly sync. Guarded by a Postgres
  advisory lock so only one instance sends.
- **Due users**: users with a `time_zone`, at least one alert and one device,
  whose local time now is **inside their alert window**
  (`alertWindow(release_alert_minutes)`: the chosen time to four hours later,
  never past local midnight) and whose `release_alerts_run_on` is before
  their local date. A run missed early in the window is caught up later in
  it; outside the window nothing is sent, so a recovering worker never sends
  at night. Change notifications missed for a whole window go out in the next
  day's window (the last-told comparison keeps them correct); a release-day
  notification missed for the whole window is lost (case 8 the next day),
  recorded as a known limit in ADR-0009.
- For each due user and each alert (done or not), compare the mirror
  (`first_release_date` as a UTC calendar day + precision) with last-told,
  using the user's local date as "today":

| #   | Last told → mirror now                                     | Notification                                                                     |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | (opt-in)                                                   | none; state from `initialAlert`                                                  |
| 2   | vague/none → precise, in the future                        | date announced (active)                                                          |
| 3   | precise → later precise                                    | delayed (passive)                                                                |
| 4   | precise → earlier precise                                  | moved up (passive)                                                               |
| 5   | precise → vague (`month`/`quarter`/`year`) or `none`       | date no longer confirmed (passive)                                               |
| 6   | precise date == user's local today                         | release day (active), with "Start Playing"; mark done                            |
| 7   | vague/none/unclassified → precise **today** (shadow drop)  | release day only (not "announced"); mark done                                    |
| 8   | precise date in the past, never notified                   | none; mark done (`completed_at` only)                                            |
| 9   | opted in on or after the precise release day               | none; `initialAlert` starts it done                                              |
| 10  | done, mirror now precise and **after** today               | none; re-arm silently: clear `completed_at`, last-told = mirror                  |
| —   | done, any other mirror                                     | none                                                                             |
| 11  | several games with news the same morning                   | one notification per game, same thread id                                        |
| 12  | alert turned off and on again                              | starts fresh from the mirror (row was deleted)                                   |
| 13  | entry moved to another status                              | alert unaffected; removal deletes it                                             |
| 14  | alert already notified today (`notified_on` = local today) | none; state unchanged, so a later change goes out tomorrow                       |
| —   | mirror unclassified (`null` precision)                     | none; last-told unchanged, so a day → `null` → day glitch loses nothing          |
| —   | vague → narrower vague                                     | none; last-told updated silently                                                 |
| —   | last-told unclassified (opted in before classification)    | none; adopt the first classified mirror state silently (except row 7 on the day) |

Rows are checked in this order: 10 and done; 14; mirror unclassified; 6–8;
last-told unclassified; then 2–5 and narrower vague. Re-arming covers a game
delayed after its release day (or after an opt-in on that day) and a wrong
past date corrected later: the bell is on again, the alert works again, and
the release-day notification fires on the new day. Because the comparison is
against last-told rather than the previous sync, several changes between due
runs collapse into one notification about the final state. Row 14 also
holds back a release-day notification when the same game was already
notified earlier that day (a change, then a same-day shadow drop); the next
day that is case 8. This is the same known limit as a missed window.

- Notifications go to every device of the user, each in its device's
  language. Once Expo accepts the ticket for **any** of the user's devices,
  persist that alert's `next` (last-told, `notified_on`, and
  `release_notified_at` for release day); a device whose send failed misses
  that one notification rather than every device getting a duplicate the next
  day.
- Set `release_alerts_run_on` = local date only when **every** notification
  of the run was accepted for at least one device. Otherwise leave it, and
  the next run (30 minutes later, while still inside the window) evaluates
  again: alerts already sent carry today's `notified_on` and stay silent even
  if the mirror changed in between (row 14), and only the failed ones retry. A
  failed send leaves its alert unchanged.
- Delivery is at least once: if the worker stops after Expo accepted a
  notification but before its state is saved, the next run sends it again.
  Recorded as a known limit in ADR-0009.
- The worker calls `evaluateAlert` from `@repo/release-dates` per alert; it holds no
  date logic of its own. Copy is rendered per device `locale` from
  `@repo/i18n`'s `notifications` namespace, with the date from
  `formatReleaseDate` (Expo push has no iOS loc-key support).
- **Content** (HIG: useful title, no app name, full sentences in sentence
  case). The title is the game's name; the body is one of:

  | Kind            | Body (English source)                               | Interruption |
  | --------------- | --------------------------------------------------- | ------------ |
  | announced       | "Release date announced: 5 June 2027."              | active       |
  | delayed         | "Delayed to 5 June 2027."                           | passive      |
  | movedUp         | "Good news: coming earlier, on 2 March 2027."       | passive      |
  | dateUnconfirmed | "The release date is no longer confirmed: Q3 2027." | passive      |
  | releaseDay      | "It's release day! Enjoy 🎉"                        | active       |

  `dateUnconfirmed` does not say "delayed": the new period can end before the
  old day. With precision `none` its body ends "…no longer confirmed." with
  no date.

  Release day and an announcement are what people opted in for; changes are
  worth knowing but not worth interrupting for. Nothing is ever Time
  Sensitive. Final wording per language lives in `@repo/i18n`.

- Payload: `data.url = barklog://notification/game/<id>`, `data.gameId`,
  `data.userId` (the Clerk id the notification was sent for),
  `threadId` `release-alerts`, and `categoryId` `release-day` on release-day
  notifications only (carries the "Start Playing" action). No badge.
- Receipts: a follow-up step (next run is fine) fetches Expo receipts and
  deletes tokens reported `DeviceNotRegistered`.
- Secrets: `EXPO_ACCESS_TOKEN` (enhanced push security) for the worker.

## Mobile

### Notifications plumbing

- Add `expo-notifications`; configure APNs credentials through EAS. Production
  and development variants both need push entitlements (`app.config.js`
  variants).
- Permission is requested on the first alert turn-on, never at launch.
- After permission is granted, on every app start while signed in, and
  whenever the signed-in user changes, the app registers its Expo push token
  with locale and time zone (covers time-zone and language changes, and an
  account switch inside one app session).
- Sign-out: `DELETE /me/push-devices/:token` before Clerk sign-out, best
  effort. An account switch without a signed-out interval relies on the
  reassigning registration, which runs as soon as the new user is signed in. Joins the [ADR-0004](../../adr/0004-account-switch-isolation.md)
  isolation rule; if the delete fails and the device stays signed out, old
  alerts can still arrive — record this as a known limit.
- Tap routing: `barklog://notification/game/<id>` maps to the Home stack
  exactly like widget game links (generalise `widgetRoute` or add a sibling).
  Handle cold start (last notification response) and warm taps.
- Notifications are not a Premium feature.
- **Foreground**: while the app is open, notifications show no banner; the
  app invalidates the backlog and game queries instead, so the change appears
  in place (HIG: don't interrupt the current view).
- **Categories**: the app registers category `release-day` with one action,
  "Start Playing" (SF Symbol `play.fill`, `authenticationRequired: true`, does
  not open the app), and the hidden-preview placeholder "Release update" for
  all alert notifications.
- **"Start Playing" action**: handled in the background with one request,
  `POST /backlog/:gameId/start-playing` `{ forUser }`, where `forUser` is
  the notification's `data.userId`. The server:
  - returns 409 and changes nothing when `forUser` is not the signed-in user
    (a notification left over from another account must never touch the
    current account's backlog);
  - otherwise performs one **conditional** update — status to Playing only
    `WHERE status = 'waiting'` — and reports `moved` or `unchanged`. A
    missing, removed or already-moved entry is a no-op; nothing is upserted,
    so a removed entry is never recreated;
  - needs no slot check: Waiting → Playing keeps the slot count.

  Requires the Clerk session token and keychain to be readable from a
  background launch on an unlocked device — verify on a device before relying
  on it. Failure is silent; the app shows the true status on the next open.

### "Upcoming" rule

`isUpcoming(releaseDisplay(...))` from `@repo/release-dates`, used for
turning the bell on, the Home menu item, both countdowns and the widget
picker. In summary: "Today" is the device's local date; the release day is the
UTC calendar day of `firstReleaseDate`.

- precision `day`: upcoming while the release day is today or later; after
  that the game is **released**.
- vague (`month|quarter|year`), `none`, or `null`/absent precision (an older
  server or an unclassified game): **never** counted down by day. Upcoming
  when there is no date, or while the placeholder date is today or later
  (IGDB places vague dates at the end of their period — confirm during the
  precision ticket). After that the game is **lapsed**, not released: it
  keeps its vague label and the "Release date" caption.
- Released and lapsed games get no countdown and cannot have an alert turned
  on. An alert that is already on stays visible and can be turned off (see
  below).

### Release alert UI

- **Visibility** (detail bell, Home glyph and Home menu item alike): shown
  when the game is **upcoming** (rule above), or when it is **lapsed** and
  its alert is on, so an alert that can still fire is never stranded. A
  lapsed game offers only turning off; once off, the control disappears.
  Released games never show it: their alert is done or about to complete,
  and re-arming (scheduler row 10) makes the game upcoming again.
- **Detail screen**: a third, icon-only button to the right of the status and
  rating controls, shown per the visibility rule. It is a button that
  behaves like a toggle (HIG: outside a list, not a switch): no text label;
  off is `bell` in the bordered style, on is `bell.fill` (a checkmark-badged
  bell if SF Symbols offers one) in the prominent glass style, so state is
  shown by shape and fill, not color alone. VoiceOver: "Release alert",
  value "On"/"Off". Tapping:
  1. requests permission if undetermined;
  2. sends the alert-only `{ releaseAlert: true }`; the server adds the game
     as Waiting if it is not in the backlog, whatever the cache says;
  3. a 402 opens the paywall as for any slot-consuming write;
  4. on success, the success haptic (see Haptics). When the game was just added, the status
     capsule now reading "Waiting" is the visible sign of the side effect.

  Turning off sends `releaseAlert: false` with no confirmation (HIG: no alerts
  for common, undoable actions) and no haptic. Refetch, no optimistic update
  (ADR-0002).

- **Home**: alerted rows show a small secondary `bell.fill` glyph (never
  styled like a count badge) and the row's accessibility label includes
  "release alert on"; both follow the visibility rule. The row's "…" menu
  gains "Turn On Release Alert" (upcoming games) / "Turn Off Release Alert"
  (title case, no ellipsis: nothing confirms), sending the alert-only write,
  with the same permission and haptic behavior as the detail button.
- **Permission**: requested by the bell tap itself, no explainer screen
  before it (the tap is the context). If notifications are denied, the alert
  is still saved and the bell shows on, and every turn-on shows an alert:
  title "Notifications Are Off", message "Turn on notifications for Barklog
  in Settings to hear about release dates.", buttons "Cancel" and "Open
  Settings" (default). Turning on is infrequent, so this does not nag.
- **Remove from backlog**: the existing confirmation stays (removal can't be
  undone). When the entry has an alert, the message becomes "Its status,
  rating and release alert will be lost."

### Haptics (app-wide)

The app already plays one haptic: **success** when the server confirms a
status change, including an add (`shouldPlayStatusHaptic`, wired through the
entry-write effects). Rating-only edits stay quiet on purpose. This design
extends that rule rather than replacing it, using system patterns only for
their documented meaning (HIG: consistent, not overused):

| Event                                   | Today   | Rule                                    |
| --------------------------------------- | ------- | --------------------------------------- |
| Status change confirmed (add or move)   | success | keep                                    |
| Release alert turned on                 | —       | success (a deliberate decision)         |
| Release alert turned off                | —       | none (undoable, like a rating edit)     |
| Rating change                           | none    | keep                                    |
| Remove from backlog                     | none    | keep (the confirmation is the feedback) |
| Write failed (error alert shown)        | none    | error, together with the alert          |
| 402 → paywall                           | none    | keep (the sheet is the feedback)        |
| Pickers, menus, pull to refresh, filter | native  | leave to the system; add nothing        |

A separate audit ticket walks every interaction (Home, detail, Search,
Explore, share sheet, onboarding, paywall and purchase, Profile) against this
table — including whether RevenueCat's paywall and our SwiftUI menus already
play feedback, to avoid doubling it — records the rule in the mobile spec,
and replaces `playStatusHaptic` with one tested decision function (e.g.
`playDecisionHaptic`). The release-alert UI uses that function. The system's
own haptics setting turns all of this off; there is no in-app switch.

### Profile tab

- Fourth `NativeTabs` trigger (`person.crop.circle`), replacing
  `ProfileToolbar`'s account button. The Premium star stays in toolbars.
- Sections: account (opens Clerk `UserProfileView` as today), Premium status /
  manage, Release alerts (a time picker in 30-minute steps, default 09:00,
  with a footer stating the window from `alertWindow`, e.g. "Release alerts
  arrive between 9:00 and 13:00." — "between 22:00 and midnight" when the
  window is cut at midnight — formatted in the user's locale and 12/24-hour
  setting; when notifications are denied, a "Notifications are off" row with "Open
  Settings" — no in-app master switch duplicating the system one), Stats (restored from git history `b6eea1b`; own ticket), and a
  visible "Delete account" row that opens Clerk's flow (addresses App Review
  repeatedly missing deletion).
- iPad: works with `sidebarAdaptable`.

### Release date presentation (date-precision epic)

Ships with date precision, before alerts:

- The detail row reads "Released" only when `releaseDisplay` is `released`
  and "Release date" otherwise, including lapsed vague dates. Today the
  caption ignores the date: "Release" in English and "Release date" (or its
  translation) in the other four languages, even for 2027 games.
- Its value comes from `formatReleaseDate`: "5 June 2027", "Q3 2027", "2027",
  "TBA" instead of a placeholder day such as "31 December 2027".
- The hero meta line and list rows keep showing the year, which is correct for
  every precision; "TBA" when there is no date.

### Detail-screen countdown

Independent of alerts. Under the hero for unreleased games: "In 12 days" for
a precise future date, "Release day 🎉" on the day, nothing once released.
Vague dates show "2027" / "Q3 2027" (no day count). All of it is rendered from
`releaseDisplay`; the screen computes no dates itself.

### Release countdown widget

- New `expo-widgets` widget `CountdownWidget`, `systemSmall` only.
- Configuration parameter `game`: static fallback value "Soonest upcoming";
  the app sets runtime options with `setConfigurationParameterEnum` to every
  upcoming backlog game (any status, alerted or not), refreshed on each
  publish.
- States (artwork on the left, as in the backlog widget):
  - countdown: "12 days" (precise) or "Q3 2027" (vague);
  - release day: "Release day 🎉" with the mascot;
  - after release: "Released already, let's play it 🎮" (precise dates only; a
    picked vague game whose placeholder passed keeps its vague label);
  - picked game no longer in the backlog / nothing upcoming: "Pick an upcoming
    game" with mascot, tap opens Home.
- Tap opens the game via `barklog://widget/game/<id>`.
- Data comes from the same derived snapshot pipeline (ADR-0003): one backlog
  query, covers downloaded into the app group, cleared on account switch.
- Countdown state changes without the app: publish a timeline with an entry at
  each local midnight up to release day plus the day after. The widget
  runtime cannot import packages, so the app precomputes each timeline
  entry's `releaseDisplay` and label; the view only renders them and does no
  date arithmetic of its own (ADR-0010).
- "Soonest upcoming" orders upcoming games by release day, using the
  placeholder day for vague dates; on the same day a precise date comes
  first, and unannounced games come last.
- Widget picker/gallery strings go through `Localizable.strings`.
- HIG polish: a placeholder that mirrors the layout (artwork block plus text
  bars); artwork marked for accented rendering so tinted/clear appearances
  stay legible; text 11 pt or larger; checked in StandBy, where the
  background is removed. The HIG prefers system-refreshed date text, but its
  relative styles cannot say "12 days", so the midnight timeline stays.

## Rollout order

0. Shared foundations: `@repo/release-dates` with its tests, then `@repo/i18n` with
   the app's strings moved into it (no behavior change, verified by the app's
   existing tests).
1. Date precision column + IGDB mapping + wire field; deploy; run
   `worker --full`; verify an old app build against the new API.
2. Release alerts, push devices, settings endpoints; deploy; verify an old
   build (fields absent, no 400s).
3. Scheduler/delivery, enabled only after step 1's backfill finished.
4. App release: notifications plumbing, Profile tab, alert UI, countdowns,
   widget (can split across app versions; each depends only on steps 1–2).

## Left to the builder

- Exact IGDB field set for precision and how to treat conflicting entries
  (verify with the contract test).
- Timeline length cap for very distant dates (e.g. 60 entries plus a
  reload-after date) if iOS or `expo-widgets` limits it.
- Exact SF Symbols, row glyph placement and Profile layout details.
- Expo SDK batching/chunking, retry and receipt timing.
- Exact `@repo/release-dates` type names and `CalendarDay` representation, as long as
  the functions stay pure and the tests above exist.
