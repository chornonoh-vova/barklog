# Push Devices and Alert Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the app register Expo push tokens and set the release alert time, and stop any write (registration included) from recreating a deleted account. Issue #71, epic #64.

**Architecture:** One migration adds `push_devices` and three `users` columns. `ensureUser` checks the ADR-0006 tombstone and reports refusal; the existing mutating-method middleware turns that into a 401 for every write route. New `/api/me` sub-routes register, unregister and update settings. `GET /me` gains an additive `releaseAlertMinutes`.

**Tech Stack:** Hono, valibot (`@repo/contracts`), Drizzle + Postgres (`@repo/db`, drizzle-kit migrations), Vitest + Testcontainers (Docker required).

**Spec:** [release alerts design](../specs/2026-11-13-release-alerts-and-countdowns-design.md), section _Push devices and settings_; [ADR-0006](../../adr/0006-clerk-account-deletion.md); [ADR-0009](../../adr/0009-server-push-release-alerts.md).

## Global Constraints

- `push_devices`: `token` text PK (Expo push token), `user_id` FK `users.id` `ON DELETE CASCADE`, `locale` (one of the app's five languages), `created_at`, `updated_at`.
- Registering a token another user holds **reassigns** it to the caller.
- `users.release_alert_minutes`: smallint, not null, default `540`, `0–1410`, multiple of `30`.
- `users.time_zone`: IANA name, nullable, set from the latest registration.
- `users.release_alerts_run_on`: date, nullable. Nothing writes it in this issue; the scheduler (#64's later tickets) owns it.
- `PUT /api/me/push-devices` `{ token, locale, timeZone }`; `DELETE /api/me/push-devices/:token`; `PATCH /api/me/settings` `{ releaseAlertMinutes }`; `GET /api/me` gains optional `releaseAlertMinutes`.
- A tombstoned user's write is refused and creates nothing (no `users` row, no device).
- `GET /api/me` keeps `premium`, `entitlement` and `Cache-Control: private, no-store` unchanged; `POST /api/subscription/refresh` does not change at all.
- Account deletion removes devices and settings through the existing `users` cascade; no new deletion code.

## Decisions made here (not in the spec)

- **Refusal is `401 UNAUTHORIZED`**, detail `"This account has been deleted."`. No new problem code: the mobile client already handles 401 (one retry with a fresh token, then an error), and Clerk revokes the session on deletion, so this only meets a token issued before deletion.
- **`ensureUser` returns `Promise<boolean>`**: `false` when a tombstone exists (nothing inserted), `true` otherwise. The webhook already checks `isUserDeleted` first and ignores the result.
- **Language stays per device** (no `users` language column): notifications go out in each device's language and nothing server-side reads a per-user one.
- **Locales are duplicated** as `PUSH_LOCALES` in `@repo/contracts` (contracts depends only on valibot) and held to `@repo/i18n`'s `LANGUAGES` by a parity test in `packages/i18n`, the same pattern as `packages/db/test/status-parity.test.ts`. The column is `text` without a check, so adding a language needs no migration.
- **Responses:** `PUT` and `DELETE` push-devices answer `204`. `DELETE` is idempotent and only removes the caller's own token (another user's token: `204`, untouched). `PATCH /me/settings` answers `200 { releaseAlertMinutes }`.
- **`GET /me`** reports `540` when the user has no `users` row yet (GETs never create one).
- **Token validation:** a non-empty string, nothing more, so an Expo format change cannot break registration (the 16 KB body limit bounds its size). Time zone: at most 64 characters and accepted by `new Intl.DateTimeFormat("en", { timeZone })`, stored as sent.
- **Rate limits:** no new scope; the routes sit under the existing `overall` limit.

## Review Focus

1. The token in `DELETE /me/push-devices/:token` contains `[` and `]`, so the app percent-encodes it. The route must decode it and match the stored token.
2. `DELETE` for a token held by another user must not remove it. Otherwise a stale sign-out on device A unregisters the account now using that phone.
3. Re-registering the same token with a new locale or time zone updates both and keeps one row (`created_at` unchanged, `updated_at` bumped).
4. A tombstoned user calling `DELETE /me/push-devices/:token` or `PATCH /me/settings` gets the same 401 and creates no `users` row. The middleware covers every mutating method, not only `PUT`.
5. An invalid time zone (`"Mars/Olympus"`) or locale (`"fr"`) gets a 422 and does not register the device or change `users.time_zone`.

---

### Task 1: Schema, migration and queries

**Files:**

- Modify: `packages/db/src/schema/backlog.ts` (columns on `users`)
- Create: `packages/db/src/schema/push-devices.ts`; export from `packages/db/src/schema/index.ts`
- Create: `packages/db/src/queries/push-devices.ts`; export from `packages/db/src/index.ts`
- Modify: `packages/db/src/queries/users.ts` (settings queries)
- Modify: `packages/db/src/testing.ts` (`truncateAll` lists `push_devices`)
- Generate: `packages/db/drizzle/0008_*.sql` + snapshot/journal
- Test: `packages/db/test/push-devices-queries.test.ts` (new), `packages/db/test/user-deletion.test.ts`

**Interfaces:**

- Produces:
  - `pushDevices` table (`token`, `userId`, `locale`, `createdAt`, `updatedAt`), index `push_devices_user_id_idx` on `user_id`.
  - `users.releaseAlertMinutes` (`smallint`, not null, default 540, check `users_release_alert_minutes_valid`: `BETWEEN 0 AND 1410 AND % 30 = 0`), `users.timeZone` (`text`, nullable), `users.releaseAlertsRunOn` (`date`, mode `"string"`, nullable).
  - `registerPushDevice(db: Queryable, device: { token: string; userId: string; locale: string; timeZone: string }): Promise<void>`: upsert on `token` (set `user_id`, `locale`, `updated_at = now()`), then set `users.time_zone`. Two statements; the caller supplies the transaction.
  - `unregisterPushDevice(db: Queryable, userId: string, token: string): Promise<boolean>`: deletes only `WHERE token AND user_id`.
  - `getReleaseAlertMinutes(db: Queryable, userId: string): Promise<number | null>`: null for no `users` row.
  - `setReleaseAlertMinutes(db: Queryable, userId: string, minutes: number): Promise<number>`: returns the stored value.

- [ ] **Step 1: Write the failing query tests** in `push-devices-queries.test.ts` (same setup as `user-deletion.test.ts`):
  - `registers a device and records the user's time zone`: the row has `locale "de"`, and `users.time_zone` is `"Europe/Berlin"`.
  - `re-registering updates locale and time zone in place`: one row; `createdAt` unchanged; `updatedAt` later; new locale and zone stored.
  - `registering a token another user holds reassigns it`: after B registers A's token, the row's `userId` is B and A has no devices.
  - `unregister removes only the caller's token`: `unregisterPushDevice(db, B, tokenOfA)` returns `false` and the row remains; with A it returns `true` and the row is gone.
  - `a new user's alert time defaults to 09:00`: `getReleaseAlertMinutes` returns `540`; for an unknown id, `null`.
  - `setReleaseAlertMinutes stores the value`: `setReleaseAlertMinutes(db, A, 1410)` returns `1410`.
  - `the database rejects an alert time off the 30-minute grid`: a raw update to `45` and to `1440` each reject (check constraint).
- [ ] **Step 2: Extend `user-deletion.test.ts`**: `seed()` registers a device and sets the alert time to `600`; `deleteUser cascades the backlog and the subscription` also asserts `schema.pushDevices` is empty. Settings live on the deleted `users` row, which the test already asserts is gone.
- [ ] **Step 3: Run** `pnpm --filter @repo/db test`. Expected: FAIL (`pushDevices` / functions not exported).
- [ ] **Step 4: Implement** the schema, then `pnpm --filter @repo/db db:generate`. Review the SQL: the `users` columns have their default (existing rows backfill to 540) and the check constraint; `push_devices` has the FK cascade and index. Implement the queries and add `push_devices` to `truncateAll`.
- [ ] **Step 5: Run** `pnpm --filter @repo/db test && pnpm --filter @repo/db check-types && pnpm --filter @repo/db lint`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(db): push devices table and alert time columns (#71)`

### Task 2: `ensureUser` refuses tombstoned ids

**Files:**

- Modify: `packages/db/src/queries/backlog.ts:51` (`ensureUser`)
- Modify: `apps/api/src/middleware/auth.ts` (`ensureUserMiddleware`)
- Test: `packages/db/test/user-deletion.test.ts`, `apps/api/test/auth.test.ts`

**Interfaces:**

- Consumes: `isUserDeleted` (`packages/db/src/queries/users.ts`; import it there or inline the check).
- Produces: `ensureUser(db: Queryable, userId: string): Promise<boolean>`. `ensureUserMiddleware` throws `problems.create("UNAUTHORIZED", { detail: "This account has been deleted." })` on `false`.

- [ ] **Step 1: Failing db test** (`user-deletion.test.ts`): `ensureUser refuses a tombstoned id and creates nothing`. After `recordUserDeletion` + `deleteUser`, `ensureUser(db, USER)` resolves `false` and `schema.users` is empty. Also `ensureUser for a live id returns true` (existing and new id).
- [ ] **Step 2: Failing api test** (`auth.test.ts`; the write route needs no seeded game because the middleware runs before the handler): with a tombstone recorded for `TEST_USER` via `recordUserDeletion(harness.db, TEST_USER)`, `PUT /api/backlog/1` with `{ status: "waiting" }` answers 401 with `detail "This account has been deleted."`, and `schema.users` stays empty. A `GET /api/me` for the same user still answers 200 (reads are not refused).
- [ ] **Step 3: Run** `pnpm --filter @repo/db test -- user-deletion` and `pnpm --filter api test -- auth`. Expected: FAIL.
- [ ] **Step 4: Implement.** Keep the tombstone check and the insert within one call. Update the JSDoc on `deletedUsers` (`schema/backlog.ts`), which says the webhook's `ensureUser` would recreate the account: the tombstone now guards every write. `webhooks.ts` keeps its own `isUserDeleted` branch, because that branch records a scrubbed event; no change there.
- [ ] **Step 5: Run** both workspaces' full test suites. Expected: PASS, including the existing webhook tests for after-deletion events.
- [ ] **Step 6: Commit** `fix: refuse writes for tombstoned users in ensureUser (#71)`

### Task 3: Contracts

**Files:**

- Create: `packages/contracts/src/me.ts`; export from `index.ts`
- Modify: `packages/contracts/src/wire.ts` (`MeResponse`)
- Modify: `packages/i18n/package.json` (devDependency `@repo/contracts: workspace:*`)
- Test: `packages/contracts/test/me.test.ts` (new), `packages/i18n/test/languages-parity.test.ts` (new)

**Interfaces:**

- Produces (all from `@repo/contracts`):
  - `PUSH_LOCALES = ["en", "uk", "ru", "de", "es"] as const` (the order of `@repo/i18n` `LANGUAGES`); `type PushLocale`.
  - `RELEASE_ALERT_MINUTES_DEFAULT = 540`, `RELEASE_ALERT_MINUTES_MAX = 1410`, `RELEASE_ALERT_MINUTES_STEP = 30`.
  - `pushDeviceRegisterSchema = v.strictObject({ token, locale: v.picklist(PUSH_LOCALES), timeZone })`; `type PushDeviceRegister`.
  - `pushTokenPathSchema = v.object({ token })`. Same token rule; used for the path param.
  - `meSettingsSchema = v.strictObject({ releaseAlertMinutes })`. Integer, `0–MAX`, `v.multipleOf(STEP)` (or `v.check`); `type MeSettings`.
  - `interface MeSettingsResponse { releaseAlertMinutes: number }`.
  - `MeResponse` gains `releaseAlertMinutes?: number` with a doc comment: optional, so a mobile build reading an older server still type-checks.

- [ ] **Step 1: Failing tests** (`me.test.ts`, using `v.safeParse`):
  - Settings accept `0`, `540`, `1410`; reject `-30`, `1440`, `45`, `540.5`, `"540"`, and `{}`; reject an extra key.
  - Register accepts `{ token: "ExponentPushToken[abc-123_X]", locale: "uk", timeZone: "Europe/Kyiv" }`. It rejects locale `"fr"`, time zone `"Mars/Olympus"`, an empty token and an extra key.
  - Parity (`languages-parity.test.ts`): `expect([...PUSH_LOCALES]).toEqual([...LANGUAGES])`.
- [ ] **Step 2: Run** `pnpm --filter @repo/contracts test` and `pnpm --filter @repo/i18n test`. Expected: FAIL.
- [ ] **Step 3: Implement**, then `pnpm install` for the new devDependency.
- [ ] **Step 4: Run** the same tests plus `check-types` and `lint` in both workspaces. Expected: PASS.
- [ ] **Step 5: Commit** `feat(contracts): push device and alert time schemas (#71)`

### Task 4: API routes

**Files:**

- Modify: `apps/api/src/routes/me.ts`
- Test: `apps/api/test/me-routes.test.ts`, `apps/api/test/push-devices-routes.test.ts` (new)

**Interfaces:**

- Consumes: Task 1 queries, Task 2 middleware behavior, Task 3 schemas.
- Produces: `GET /api/me` → `MeResponse & { releaseAlertMinutes }`; `PUT /api/me/push-devices` → 204; `DELETE /api/me/push-devices/:token` → 204; `PATCH /api/me/settings` → 200 `MeSettingsResponse`. `readEntitlement` stays unchanged (shared with `/subscription/refresh`); the `/me` handler adds the field.

- [ ] **Step 1: Failing route tests** in `push-devices-routes.test.ts` (the registration helper sends `Content-Type: application/json`):
  - `register stores the device and the time zone`: 204, one row for `TEST_USER`, `users.time_zone` set.
  - `re-register updates language and time zone`: the second `PUT` with `locale "es"`, `timeZone "America/New_York"` leaves one row with both updated.
  - `registration reassigns a token held by another account`: `OTHER_USER` registers, then `TEST_USER` registers the same token → row owner is `TEST_USER`.
  - `delete removes the caller's device`: the path is `/api/me/push-devices/${encodeURIComponent(token)}` → 204, row gone. Repeating it → 204.
  - `delete leaves another account's device alone`: 204, row still owned by `OTHER_USER`.
  - `invalid registration is rejected and changes nothing`: locale `"fr"` → 422; time zone `"Mars/Olympus"` → 422; no device; `users.time_zone` unchanged.
  - `a tombstoned account cannot register, unregister or change settings`: `PUT`, `DELETE` and `PATCH` each → 401; `users` and `push_devices` stay empty.
  - Settings: `PATCH /api/me/settings { releaseAlertMinutes: 1290 }` → 200 `{ releaseAlertMinutes: 1290 }`, and `GET /api/me` then reports `1290`; `1440`, `45` and `-30` → 422 with the stored value unchanged.
- [ ] **Step 2: Update `me-routes.test.ts`** (the "older builds see no change" criterion): the existing `toEqual` assertions add `releaseAlertMinutes: 540`, and every other key and the `Cache-Control` test stay as they are. New test `a user with no row yet reports the default alert time`: no `ensureUser`, `GET /api/me` → `releaseAlertMinutes: 540`, and no `users` row is created. New test `subscription refresh does not report the alert time`, if a cheap path exists in `subscription-refresh.test.ts`. Otherwise assert there that the body has no `releaseAlertMinutes` key.
- [ ] **Step 3: Run** `pnpm --filter api test -- me-routes push-devices-routes`. Expected: FAIL.
- [ ] **Step 4: Implement** in `meRoutes`: `.put("/push-devices", sValidator("json", pushDeviceRegisterSchema, onInvalid), …)` wrapped in `deps.db.transaction`; `.delete("/push-devices/:token", sValidator("param", pushTokenPathSchema, onInvalid), …)`; `.patch("/settings", sValidator("json", meSettingsSchema, onInvalid), …)`. In `GET /`, use `getReleaseAlertMinutes(...) ?? RELEASE_ALERT_MINUTES_DEFAULT`. Return 204 via `c.body(null, 204)`. If Hono hands the param over still encoded, decode it before validation and note why in a comment.
- [ ] **Step 5: Run** the full api suite, `check-types` and `lint`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(api): register push devices and set the alert time (#71)`

### Task 5: Documentation upkeep

**Files:**

- Modify: `CONTEXT.md`. Add **Push device** under _Device_: an installation's Expo push token, registered to the signed-in user with its language; re-registering under another account moves it. Add **Alert time** next to **Release alert**: the user's local time of day for release alerts, in 30-minute steps, 09:00 by default. Sharpen **Tombstone** so it stops any write from recreating the account, not only RevenueCat events.
- Modify: `docs/adr/0006-clerk-account-deletion.md`: the tombstone now also guards every authenticated write, via `ensureUser`; link the tests.
- Modify: `docs/adr/README.md`: remove the resolved _Deleted-account recreation_ item from _Unresolved guarantees_.
- Modify: `docs/adr/0009-server-push-release-alerts.md` and its index row only if they track partial implementation, and then mark devices and settings implemented. Do not otherwise rewrite the decision.

- [ ] **Step 1:** Make the edits and run `pnpm exec prettier --check` on the changed files and `git diff --check`; confirm the relative links resolve.
- [ ] **Step 2: Commit** `docs: push devices, alert time and the write tombstone check (#71)`

### Final verification

- [ ] Run `pnpm turbo run test lint check-types --filter=@repo/db --filter=@repo/contracts --filter=@repo/i18n --filter=api`, plus `--filter=mobile` type checks, because `MeResponse` is shared. All pass (Docker running).
- [ ] Map the acceptance criteria on #71 to tests: register, re-register, reassign, delete (Task 4); settings validation (Tasks 3 and 4); account deletion (Task 1 Step 2); tombstone (Tasks 2 and 4); older builds (Task 4 Step 2).
