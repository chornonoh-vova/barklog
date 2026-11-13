---
status: accepted
---

# Deliver release alerts as server push

Agreed on 2026-11-13; not yet implemented.

Release alerts are delivered by the server through the Expo Push Service, not scheduled as local notifications on the device. A "date announced", "delayed" or "moved up" alert is an observation of the mirror changing during a sync; a device that stays closed cannot see it, and local schedules would keep a stale date. Server delivery also keeps one authority for whether an alert exists, consistent with [server-authoritative backlog writes](0002-server-authoritative-backlog-writes.md).

A release alert belongs to a backlog entry and is deleted with it, so only backlog games can produce notifications. Each alert records what the user was last told; a scheduler compares the mirror against that record inside the user's alert window (the chosen local time to four hours later, never past midnight), rather than diffing consecutive syncs. Missed runs and failed sends retry within the window, several changes between runs produce one notification about the final state, a game is notified at most once per local day, and nothing is sent at night. A finished alert re-arms silently when the game gets a precise date in the future again, so a delay after release day is still covered. Only a precise (day) release date is ever announced or counted down; vague dates are never presented as a day.

Push device registrations belong to a user and are reassigned when another account registers the same token; the app registers whenever the signed-in user changes. Sign-out removes the registration on a best-effort basis before the session ends, extending the [account-switch isolation](0004-account-switch-isolation.md) rule to notifications.

## Rejected alternatives

- Local notifications scheduled on the device: no way to learn date changes while the app is closed, and the 64 pending-notification limit.
- Diffing each sync's changes into notification events: couples the sync to delivery and loses changes when a send fails.

## Known limits

- A release-day notification that cannot be delivered for the whole alert window (an outage of about four hours) is not sent later; the next day the game is past release and the alert completes silently. The same happens when the game was already notified earlier that day about a change. Change notifications are not lost: they go out in the next day's window.
- Delivery is at least once: if the worker stops after Expo accepted a notification but before the alert's new state is saved, the next run sends it again.
- If the sign-out unregistration fails and the device stays signed out, the previous account's alerts can still arrive until the token is reassigned or reported unregistered.
- Notification copy is rendered on the server per device language, because Expo push does not carry iOS localization keys.

## Evidence

- [Release alerts design](../superpowers/specs/2026-11-13-release-alerts-and-countdowns-design.md)
