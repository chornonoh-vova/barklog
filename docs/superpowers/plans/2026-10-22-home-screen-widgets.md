# Home Screen Widgets and Instant Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship mobile 1.3.0 with a configurable Small/Medium iOS home screen widget (`expo-widgets`) that shows one backlog section and deep-links into Home → Game Details, plus a Home screen that renders a persisted query cache instantly behind a floating "Updating…" pill.

**Architecture:** TanStack Query stays the only source of truth. A sync module subscribes to the QueryCache; whenever the unfiltered backlog list has data, it derives a trimmed `WidgetSnapshot` (pure function), downloads covers into the app-group `widgetsDirectory`, and calls `BacklogWidget.updateSnapshot`. The widget is a dumb `'widget'`-directive render of that snapshot; all copy and URLs are computed app-side. The query cache is persisted per user to AsyncStorage with `persistQueryClient`, started and torn down from `AuthGate`'s existing `userId` logic.

**Tech Stack:** Expo SDK 58, expo-router 58, `expo-widgets` 58.0.x, `@expo/ui/swift-ui` 58.0.21, `expo-file-system`, `expo-asset`, TanStack Query 5 + `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister`, AsyncStorage 2.2, i18next, Vitest (node, pure tests only).

**Spec:** `docs/superpowers/specs/2026-10-21-home-screen-widgets-design.md`

## Global Constraints

- All work on branch `feat/mobile-1.3`, one PR. App version `1.3.0` (`apps/mobile/app.json`).
- iOS only. Deployment target is already 17.0 — `ios.configuration` needs no fallback.
- `ios/` is gitignored (CNG). Native config changes go through `app.json` / `app.config.js` / plugins, never `ios/`.
- Widget families: `systemSmall`, `systemMedium` only. Widget `name`: `BacklogWidget`.
- Configuration: one enum parameter `section`, values `playing | waiting | completed | abandoned`, default `playing`.
- Widgets are free — no premium gating.
- TanStack Query is the single source of truth; nothing reads the widget snapshot back into the app.
- Widget background: system background (white / near-black by `environment.colorScheme`). Cover primary, title one line truncated, rating `★ <n>` only when rated and dropped first under pressure.
- `'widget'` functions: only `@expo/ui/swift-ui` components/modifiers, no imports used inside, no hooks, no async, no module-scope values.
- Vitest runs in plain Node: anything under `test/` must not import `react-native`, `@expo/ui`, `expo-widgets`, `expo-file-system`, or AsyncStorage. Put logic in pure modules.
- Every user-facing string is added to all five locales: `apps/mobile/src/i18n/locales/{en,uk,ru,de,es}.json`.
- Only hex literal in app code is `Brand.tint`; use `PlatformColor` in RN code. (Widget code uses SwiftUI semantic colours.)
- Clearing personal data is keyed on Clerk `userId` via `src/auth/should-clear-cache.ts`, never an `isSignedIn` edge.
- Commands run from `apps/mobile`: `pnpm test`, `pnpm lint`, `pnpm check-types`.

## Review Focus

1. **Account switch / revoked session leaking the previous user's games** — via a rehydrated persisted cache or a stale widget. Expected: next user never sees them. Pinned in Task 6 (`persistKey` per user, `shouldClearRecents` path clears all persisted caches + widget) tests.
2. **Deep link while app is cold vs. warm, from Explore/Search tab** — must land in Home's stack with Home underneath. Pinned by `widgetRoute` tests (Task 4) + device checklist (Task 8).
3. **Games with no cover / no rating / very long names / fewer than 3 games / section empty** — expected: placeholder cover, no rating line, truncation, left-aligned partial shelf, mascot. Pinned in Task 2 `deriveSnapshot` tests + device checklist.
4. **Filtered Home query arriving after the unfiltered one** — must not overwrite the widget with a one-section list. Pinned by `isWidgetSource` test (Task 5).
5. **Background refetch vs. user pull** — pull keeps the native spinner, background refresh shows only the pill, first-ever launch still shows full-screen loading. Pinned by `showUpdatingPill` tests (Task 7).

---

### Task 1: Install `expo-widgets` and spike the three unknowns (HUMAN CHECKPOINT)

Goal: prove `Link` per view, `Image uiImage` from a `widgetsDirectory` file path, and `ios.configuration` enum all work on a real build before building anything else.

**Files:**
- Modify: `apps/mobile/package.json` (deps), `apps/mobile/app.json` (plugin), `apps/mobile/app.config.js` (variant-aware widget bundle id / app group / EAS extension)
- Create: `apps/mobile/src/widgets/backlog-widget.tsx` (spike version; replaced in Task 3)

**Interfaces:**
- Produces: `BacklogWidget` default export from `src/widgets/backlog-widget.tsx` (`createWidget('BacklogWidget', …)`), the plugin config later tasks rely on.

- [ ] **Step 1: Install**

Run (from `apps/mobile`): `npx expo install expo-widgets expo-file-system expo-asset`
Expected: three deps added at SDK-58-compatible versions.

- [ ] **Step 2: Read the installed types** — `node_modules/expo-widgets/build/*.d.ts` and its `plugin/` options type. Confirm exact names of: `createWidget`, `Widget.updateSnapshot`, `Widget.reload`, `widgetsDirectory`, `WidgetEnvironment` (`colorScheme`, `widgetFamily`, `widgetRenderingMode`, `configuration`), and plugin keys (`bundleIdentifier`, `groupIdentifier`, `widgets[].name/displayName/description/ios.supportedFamilies/ios.initialLayout/ios.configuration`). If any name differs from this plan, use the installed one everywhere and note it in the commit message.

- [ ] **Step 3: Configure plugin in `app.json`**

```json
["expo-widgets", {
  "widgets": [{
    "name": "BacklogWidget",
    "displayName": "Barklog",
    "description": "Your Playing, Waiting, Completed or Abandoned games.",
    "ios": {
      "supportedFamilies": ["systemSmall", "systemMedium"],
      "initialLayout": "./src/widgets/backlog-widget.tsx",
      "configuration": {
        "title": "Section",
        "description": "Which part of your backlog to show.",
        "parameters": {
          "section": {
            "title": "Section", "type": "enum", "default": "playing",
            "values": [
              { "name": "Playing", "value": "playing" },
              { "name": "Waiting", "value": "waiting" },
              { "name": "Completed", "value": "completed" },
              { "name": "Abandoned", "value": "abandoned" }
            ]
          }
        }
      }
    }
  }]
}]
```

- [ ] **Step 4: Make it variant-aware in `app.config.js`** — in the existing `plugins` map, when `plugin[0] === "expo-widgets"`, set `bundleIdentifier: \`${bundleIdentifier}.ExpoWidgetsTarget\`` and `groupIdentifier: appGroupIdentifier` (same pattern and comment style as `expo-sharing`). Register the widget extension target for EAS credentials by adding it to `extra.eas.build.experimental.ios.appExtensions` in `app.json` (targetName = the target name the plugin generates — read it from `ios/` after prebuild in Step 6; the existing `appExtensions` map in `app.config.js` already rewrites bundle id + app group per variant).

- [ ] **Step 5: Spike widget** — `createWidget('BacklogWidget', SpikeWidget, { path: null })` where the component shows `environment.configuration.section` as text, an `Image uiImage={props.path}`, and two `Link`s (`barklog://widget/game/1`, `barklog://widget/game/2`). From a dev-only button or a temporary effect in `_layout.tsx`, copy the mascot PNG (Task 3 Step 1 produces it; for the spike any bundled PNG works) into `widgetsDirectory` with `expo-file-system` and call `BacklogWidget.updateSnapshot({ path })`.

- [ ] **Step 6: Build** — `pnpm prebuild && pnpm ios:device` (or simulator via `pnpm ios`).
Expected: build succeeds; `ios/` contains a widget extension target.

- [ ] **Step 7: HUMAN CHECK — ask the user to verify on device:** add the widget (small and medium), Edit Widget shows the Section picker with four values and the text changes; the image renders; tapping each `Link` in medium opens the app (URL logged via `+native-intent`).
If **file-path image fails → stop and report to the user** (spec). If `Link` fails → fallback: medium uses one `widgetURL` to the section. If configuration fails → fallback: four widgets, one per section. Record the outcome in the commit message.

- [ ] **Step 8: Remove the spike trigger, keep config. Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/app.json apps/mobile/app.config.js apps/mobile/src/widgets/backlog-widget.tsx
git commit -m "feat(mobile): add expo-widgets BacklogWidget target"
```

---

### Task 2: Widget snapshot derivation, links, and copy (pure)

**Files:**
- Create: `apps/mobile/src/widgets/snapshot.ts`, `apps/mobile/src/widgets/links.ts`
- Modify: `apps/mobile/src/i18n/locales/{en,uk,ru,de,es}.json` (add `widget` block)
- Test: `apps/mobile/test/widget-snapshot.test.ts`, `apps/mobile/test/widget-links.test.ts`

**Interfaces:**
- Produces (`snapshot.ts`):
  ```ts
  export interface WidgetGame { id: number; name: string; rating: number | null; cover: string | null; url: string }
  export interface WidgetSection { title: string; count: number; empty: string; url: string; games: WidgetGame[] }
  export interface WidgetSnapshot { signedIn: boolean; message: string; appUrl: string; mascot: string | null; sections: Record<BacklogStatus, WidgetSection> }
  export const WIDGET_SHELF_SIZE = 3;
  export function deriveSnapshot(items: BacklogListItemWire[], covers: Readonly<Record<string, string>>, mascot: string | null): WidgetSnapshot
  export function signedOutSnapshot(mascot: string | null): WidgetSnapshot
  export function shelfCoverIds(items: BacklogListItemWire[]): string[]   // coverImageIds of games deriveSnapshot would keep
  ```
- Produces (`links.ts`):
  ```ts
  export function widgetGameUrl(id: number): string        // "barklog://widget/game/<id>"
  export function widgetSectionUrl(status: BacklogStatus): string  // "barklog://widget/home/<status>"
  export const WIDGET_APP_URL = "barklog://widget/home";
  export function widgetRoute(url: URL): string | null     // null when host !== "widget"
  ```

- [ ] **Step 1: Write failing tests** (`test/widget-snapshot.test.ts`), using a small `item(gameId, status, updatedAt, opts)` factory for `BacklogListItemWire`:
  - `groups by status and keeps the 3 most recently updated per section` — 5 playing items → `sections.playing.games.map(g => g.id)` equals ids sorted by `updatedAt` desc, length 3; `sections.playing.count === 5`.
  - `empty sections have count 0, no games, and the mascot copy` — `sections.abandoned` → `{ count: 0, games: [], empty: "Nothing abandoned" }`.
  - `titles are the localized uppercase status label` — `sections.waiting.title === "WAITING"`.
  - `cover is the cached file path or null` — covers `{ abc: "file:///g/covers/abc.jpg" }`: item with `coverImageId "abc"` → that path; `coverImageId null` → `null`; id not in map → `null`.
  - `rating passes through, null stays null`.
  - `urls deep-link to the game and the section` — `games[0].url === "barklog://widget/game/<id>"`, `sections.playing.url === "barklog://widget/home/playing"`, `appUrl === "barklog://widget/home"`.
  - `signedIn true; signedOutSnapshot has signedIn false, message "Open Barklog to see your backlog.", every section count 0`.
  - `shelfCoverIds returns only kept games' non-null cover ids, deduped`.

  `test/widget-links.test.ts`:
  - `widgetRoute(new URL("barklog://widget/game/42")) === "/(tabs)/(home)/game/42"`
  - `widgetRoute(new URL("barklog://widget/home/waiting")) === "/(tabs)/(home)?status=waiting"`
  - `widgetRoute(new URL("barklog://widget/home")) === "/(tabs)/(home)"`
  - `unknown status or non-numeric id → "/(tabs)/(home)"`
  - `widgetRoute(new URL("barklog://expo-sharing")) === null`

- [ ] **Step 2: Run** `pnpm test -- widget-` → FAIL (modules missing).

- [ ] **Step 3: Add copy.** `en.json` top-level:
```json
"widget": { "signedOut": "Open Barklog to see your backlog." }
```
uk `"Відкрийте Barklog, щоб побачити свій беклог."`, ru `"Откройте Barklog, чтобы увидеть свой бэклог."`, de `"Öffne Barklog, um deinen Backlog zu sehen."`, es `"Abre Barklog para ver tu backlog."`. Section titles reuse `status.<s>`; empty copy reuses `backlog.emptyFilter.<s>.title`.

- [ ] **Step 4: Implement `links.ts` and `snapshot.ts`.** Read copy with `i18n.t` from `@/i18n/instance` (as `empty-states.ts` does); uppercase titles with `toLocaleUpperCase(i18n.language)`. Sort with `updatedAt` desc (ISO strings compare lexically). Iterate `BACKLOG_STATUSES` so every key exists. No react-native imports.

- [ ] **Step 5: Run** `pnpm test -- widget-` → PASS. `pnpm check-types` → clean.

- [ ] **Step 6: Commit** `feat(mobile): derive widget snapshot from backlog list`

---

### Task 3: Widget UI (small, medium, empty, signed-out)

**Files:**
- Create: `apps/mobile/assets/widget/mascot.png` (exported from `assets/illustrations/barklog-mascot-backlog.webp`, 256×256: `sips -s format png -Z 256 <src> --out <dst>`)
- Modify: `apps/mobile/src/widgets/backlog-widget.tsx` (replace spike)

**Interfaces:**
- Consumes: `WidgetSnapshot` (Task 2) as the props type (type-only import is fine; erased at build — verify the widget bundler accepts it, otherwise inline the type).
- Produces: `export default createWidget<WidgetSnapshot, { section: BacklogStatus }>('BacklogWidget', BacklogWidgetView, INITIAL)` where `INITIAL` is a signed-out-shaped literal with `message: "Open Barklog to see your backlog."` and `mascot: null`.

- [ ] **Step 1: Export the mascot PNG** (command above). Verify `file assets/widget/mascot.png` → PNG 256×256.

- [ ] **Step 2: Implement `BacklogWidgetView(props, environment)`** with `'widget'` directive. Layout rules (all values inside the function):
  - Pick `section = props.sections[environment.configuration?.section ?? "playing"]`.
  - `!props.signedIn` → mascot + `props.message`, `widgetURL(props.appUrl)`.
  - `section.games.length === 0` → header (`section.title`) + mascot (`Image uiImage={props.mascot}`, ~56pt, omitted when null) + `section.empty`; `widgetURL(section.url)`.
  - `widgetFamily === "systemSmall"` → header; centered 3:4 cover (`aspectRatio(3/4)`, `cornerRadius(8)`, `resizable`); title `font` subheadline-semibold, `lineLimit 1`/`truncationMode('tail')`; rating `★ n` caption, secondary, only when non-null; `widgetURL(game.url)` on root.
  - `systemMedium` → header row: title left, `count` right (`monospacedDigit`); `HStack` of up to 3 columns left-aligned, each `Link destination={game.url}` wrapping cover + title + rating; header area `widgetURL(section.url)`.
  - Missing cover → rounded rect with `secondarySystemFill`-equivalent and `gamecontroller` SF symbol.
  - Text colours: primary / secondary semantic; background: system background (`containerBackground` if exposed, else `background`), driven by `environment.colorScheme`.
  - `environment.widgetRenderingMode === "accented"` → covers get `widgetAccentedRenderingMode("accentedDesaturated")`.
  - Rating is the first thing hidden: put it in its own row with lowest `layoutPriority`.

- [ ] **Step 3: Verify** `pnpm check-types && pnpm lint` → clean. (No unit test: native views render nothing in Node.)

- [ ] **Step 4: Commit** `feat(mobile): BacklogWidget small, medium and empty layouts`

---

### Task 4: Deep links into Home

**Files:**
- Modify: `apps/mobile/src/app/+native-intent.ts`, `apps/mobile/src/app/(tabs)/(home)/_layout.tsx`, `apps/mobile/src/features/backlog/backlog-screen.tsx`
- Create: `apps/mobile/src/features/backlog/status-param.ts`
- Test: `apps/mobile/test/status-param.test.ts` (route mapping already covered by `widget-links.test.ts`)

**Interfaces:**
- Consumes: `widgetRoute(url: URL): string | null` (Task 2).
- Produces: `parseStatusParam(value: string | string[] | undefined): BacklogStatus | undefined`.

- [ ] **Step 1: Failing test** — `parseStatusParam("waiting") === "waiting"`, `parseStatusParam("nope") === undefined`, `parseStatusParam(undefined) === undefined`, `parseStatusParam(["playing"]) === "playing"`.
- [ ] **Step 2: Run** `pnpm test -- status-param` → FAIL.
- [ ] **Step 3: Implement** `parseStatusParam` (validate against `BACKLOG_STATUSES`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Wire routing.**
  - `+native-intent.ts`: parse once; `hostname === "expo-sharing"` → `/shared`; else `widgetRoute(url) ?? path`. Keep the existing try/catch and comment.
  - `(home)/_layout.tsx`: `export const unstable_settings = { initialRouteName: "index" };` so a cold-start deep link to `game/[id]` has Home beneath it (Back returns to Home).
  - `backlog-screen.tsx`: read `status` via `useLocalSearchParams`, and when `parseStatusParam(status)` changes to a value, `setFilter` it (effect keyed on the param, so a later widget tap with a different section re-applies; manual filter changes still work).
- [ ] **Step 6: Verify** `pnpm test && pnpm check-types && pnpm lint` → clean.
- [ ] **Step 7: Commit** `feat(mobile): route widget deep links into the Home stack`

---

### Task 5: Cover cache and widget sync

**Files:**
- Create: `apps/mobile/src/widgets/covers.ts`, `apps/mobile/src/widgets/sync.ts`, `apps/mobile/src/widgets/source.ts`
- Modify: `apps/mobile/src/app/_layout.tsx` (start sync once)
- Test: `apps/mobile/test/widget-source.test.ts`

**Interfaces:**
- Consumes: `deriveSnapshot`, `signedOutSnapshot`, `shelfCoverIds` (Task 2); `BacklogWidget` (Task 3); `coverUrl(id, "big")` from `src/igdb-image.ts`; `keys.backlog.list(undefined, "updated_at")`.
- Produces:
  ```ts
  // source.ts (pure)
  export const WIDGET_SOURCE_KEY: readonly unknown[]  // = keys.backlog.list(undefined, "updated_at")
  export function isWidgetSource(queryKey: readonly unknown[]): boolean
  export function staleCoverFiles(existing: string[], keepIds: string[]): string[]  // file names "<id>.jpg" to delete
  // covers.ts (IO)
  export async function syncCovers(imageIds: string[]): Promise<Record<string, string>>  // id -> file:// path; failures omitted
  export async function ensureMascot(): Promise<string | null>
  export async function clearCovers(): Promise<void>
  // sync.ts
  export function startWidgetSync(queryClient: QueryClient): () => void
  export async function clearWidget(): Promise<void>
  ```

- [ ] **Step 1: Failing tests** (`widget-source.test.ts`):
  - `isWidgetSource(["backlog","list","all","updated_at"]) === true`
  - `isWidgetSource(["backlog","list","playing","updated_at"]) === false` (filtered Home must not feed the widget)
  - `isWidgetSource(["backlog","list","all","rating"]) === false`, `isWidgetSource(["backlog","stats"]) === false`
  - `staleCoverFiles(["a.jpg","b.jpg","c.jpg"], ["a","c"])` → `["b.jpg"]`; ignores non-`.jpg` names.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement `source.ts`.** **Step 4: Run** → PASS.
- [ ] **Step 5: Implement `covers.ts`** with `expo-file-system` (`Directory`/`File` API, `File.downloadFileAsync`) under `new Directory(widgetsDirectory, "covers")`; skip ids already on disk; delete `staleCoverFiles`; return null/empty when `widgetsDirectory` is null. `ensureMascot` copies `assets/widget/mascot.png` (via `expo-asset` `Asset.fromModule(...).downloadAsync()`) to `widgetsDirectory/mascot.png` once.
- [ ] **Step 6: Implement `sync.ts`.**
  - Subscribe to `queryClient.getQueryCache()`; on events for a query where `isWidgetSource(query.queryKey)` and `query.state.data` is defined and a different reference from the last seen → schedule a push. This includes rehydrated data (spec: no extra flag).
  - On an `invalidate` action for that query with `query.getObserversCount() === 0` → `void query.fetch()` so a mutation while Home is filtered still refreshes the widget.
  - Push = `syncCovers(shelfCoverIds(items))` + `ensureMascot()` → `deriveSnapshot(...)`; skip if `JSON.stringify` equals the last pushed (in memory); else `BacklogWidget.updateSnapshot(snapshot)`. Serialize pushes: latest wins, never two in flight.
  - Push failures are swallowed (widget is best-effort) but reported through the existing `@/observe` error path if one exists for non-fatal errors.
  - `clearWidget()` resets the in-memory last snapshot, `clearCovers()`, then pushes `signedOutSnapshot(await ensureMascot())`.
- [ ] **Step 7: Start it** in `_layout.tsx`: `useEffect(() => startWidgetSync(queryClient), [queryClient])` inside `RootLayout` (returns the unsubscribe).
- [ ] **Step 8: Verify** `pnpm test && pnpm check-types && pnpm lint` → clean.
- [ ] **Step 9: Commit** `feat(mobile): sync backlog snapshot and covers to the widget`

---

### Task 6: Persisted query cache, per user, with sign-out clearing

**Files:**
- Create: `apps/mobile/src/query-persist.ts` (pure helpers + IO wrapper split: keep `persistKey`, `shouldPersistQuery`, `PERSIST_MAX_AGE` free of AsyncStorage imports in `src/query-persist-policy.ts`)
- Modify: `apps/mobile/src/auth/auth-gate.tsx`, `apps/mobile/src/api/hooks.ts` (`gcTime` on `useBacklog`, `useBacklogStats`), `apps/mobile/package.json`
- Test: `apps/mobile/test/query-persist-policy.test.ts`

**Interfaces:**
- Consumes: `clearWidget()` (Task 5); `shouldClearCache`, `shouldClearRecents`.
- Produces:
  ```ts
  // query-persist-policy.ts (pure)
  export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  export const PERSIST_PREFIX = "barklog-query-cache:";
  export function persistKey(userId: string): string            // PERSIST_PREFIX + userId
  export function shouldPersistQuery(queryKey: readonly unknown[], status: "pending" | "error" | "success"): boolean  // success && key[0] === "backlog"
  // query-persist.ts (IO)
  export function startPersistence(queryClient: QueryClient, userId: string, buster: string): () => void
  export async function clearPersistedCaches(): Promise<void>   // removes every AsyncStorage key with PERSIST_PREFIX
  ```

- [ ] **Step 1: `npx expo install @tanstack/react-query-persist-client @tanstack/query-async-storage-persister`** (versions matching `@tanstack/react-query` ^5.104).
- [ ] **Step 2: Failing tests:** `persistKey("user_a") !== persistKey("user_b")` and starts with `PERSIST_PREFIX`; `shouldPersistQuery(["backlog","list","all","updated_at"], "success") === true`; `shouldPersistQuery(["backlog","stats"], "success") === true`; `shouldPersistQuery(["games","search","x",20,0], "success") === false`; `shouldPersistQuery(["recents"], "success") === false`; `shouldPersistQuery(["backlog","stats"], "error") === false`.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement policy.** **Step 5: Run** → PASS.
- [ ] **Step 6: Implement `startPersistence`** with `persistQueryClient({ queryClient, persister: createAsyncStoragePersister({ storage: AsyncStorage, key: persistKey(userId) }), maxAge: PERSIST_MAX_AGE, buster, dehydrateOptions: { shouldDehydrateQuery: q => shouldPersistQuery(q.queryKey, q.state.status) } })`; return its unsubscribe. `buster` = `Constants.expoConfig?.version ?? "0"`.
- [ ] **Step 7: Wire `AuthGate`.** In the existing effect:
  - `shouldClearRecents(prev, userId)` → also `void clearPersistedCaches()` and `void clearWidget()` (covers sign-out, account switch, and a session revoked while closed).
  - Keep `queryClient.clear()` on `shouldClearCache`.
  - A second effect keyed on `userId`: when it's a string, `return startPersistence(queryClient, userId, buster)`.
  - Add `gcTime: PERSIST_MAX_AGE` to `useBacklog` and `useBacklogStats` so restored entries aren't GC'd before Home observes them.
- [ ] **Step 8: Verify** `pnpm test && pnpm check-types && pnpm lint` → clean.
- [ ] **Step 9: Commit** `feat(mobile): persist backlog queries per user`

---

### Task 7: Home loading states — floating "Updating…" pill

**Files:**
- Create: `apps/mobile/src/components/updating-pill.tsx`, `apps/mobile/src/features/backlog/loading-state.ts`
- Modify: `apps/mobile/src/features/backlog/backlog-screen.tsx`, locales (5)
- Test: `apps/mobile/test/backlog-loading-state.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function showUpdatingPill(s: { hasData: boolean; isFetching: boolean; userRefreshing: boolean }): boolean
  export function UpdatingPill({ visible }: { visible: boolean }): JSX.Element | null
  ```

- [ ] **Step 1: Failing tests:** `{hasData:true,isFetching:true,userRefreshing:false}` → true; `userRefreshing:true` → false; `hasData:false` → false (first launch keeps full-screen `LoadingState`); `isFetching:false` → false.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Copy** `backlog.updating`: en `"Updating…"`, uk `"Оновлення…"`, ru `"Обновление…"`, de `"Aktualisiere…"`, es `"Actualizando…"`.
- [ ] **Step 6: `UpdatingPill`** — absolutely positioned capsule at the top of the screen below the navigation bar (use safe-area top + header height), small `ActivityIndicator` + footnote label, material-like background via `PlatformColor("secondarySystemBackground")` with shadow, `pointerEvents="none"`, `accessibilityLiveRegion`/announcement of the label; Reanimated `FadeIn`/`FadeOut` (respects Reduce Motion by default).
- [ ] **Step 7: Home wiring** — track `userRefreshing` state: set true in `onRefresh`, false when both refetch promises settle; `RefreshControl refreshing={userRefreshing}` (no longer `isRefetching`). Render `<UpdatingPill visible={showUpdatingPill({ hasData: backlog.data !== undefined, isFetching: backlog.isFetching || stats.isFetching, userRefreshing })} />` over the list. `LoadingState` only remains for `backlog.isPending` (no data).
- [ ] **Step 8: Verify** `pnpm test && pnpm check-types && pnpm lint` → clean.
- [ ] **Step 9: Commit** `feat(mobile): show cached Home instantly with an updating pill`

---

### Task 8: Version bump and on-device verification (HUMAN CHECKPOINT)

**Files:** Modify `apps/mobile/app.json` (`"version": "1.3.0"`).

- [ ] **Step 1:** bump version; `pnpm test && pnpm lint && pnpm check-types` → all clean.
- [ ] **Step 2:** `pnpm prebuild && pnpm ios:device` → builds.
- [ ] **Step 3: HUMAN CHECK — device checklist for the user:**
  - Small and medium in light, dark, and tinted home screens; each of the 4 sections via Edit Widget.
  - Game with no cover, no rating, long name; section with 1–2 games; empty section (mascot).
  - Tap small → Game Details in Home tab; tap each medium cover → its game; tap medium header → Home filtered to that section. Repeat cold (app killed) and warm with Explore tab active; Back returns to Home.
  - Change a game's status in-app (also while Home is filtered) → widget updates.
  - Sign out → widget shows "Open Barklog…"; sign in as another account → never shows the first account's games, in app or widget.
  - Relaunch with network off → Home shows last list instantly; with network on → pill appears briefly; pull-to-refresh shows the native spinner, not the pill.
- [ ] **Step 4: Commit** `chore(mobile): bump version to 1.3.0`
