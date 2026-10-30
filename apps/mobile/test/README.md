# Mobile tests

Jest via `jest-expo/ios`, with React Native Testing Library.
See [package.json](../package.json) and [Jest config](../jest.config.js) for
current commands, dependencies and coverage requirements. A test sits
next to its subject as `<name>.test.ts(x)`; this folder holds what tests share.

| File                | What it gives a test                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `setup.ts`          | Global mocks, English copy initialization, plus native mocks and a phone-sized window reset before every test.  |
| `env.ts`            | Fixed `EXPO_PUBLIC_*` values, so `src/lib/env.ts` never reads a developer's `.env`.                             |
| `render.tsx`        | `renderWithProviders`, `renderHookWithProviders`, `renderRouterWithProviders`, and `fakeEndpoints()`.           |
| `fixtures.ts`       | Wire-shaped builders: `gameSummary`, `gameDetail`, `backlogItem`, `backlogList`, `me`, `identifyResponse`.      |
| `window.ts`         | `setWindow({ width, fontScale })` for iPad layouts and accessibility text sizes.                                |
| `mocks/expo-ui.tsx` | `@expo/ui/swift-ui` as RN elements: `Button` → button, `Picker` options → radios, `Menu` → menu with its items. |
| `mocks/native.tsx`  | Clerk, RevenueCat, Observe, StoreReview, expo-widgets, expo-sharing — steer them through `clerk`, `share`, etc. |

Import shared helpers through `@test/*`.

## Conventions

- `await` every `render`, `renderHook`, `userEvent` and `fireEvent` call (RNTL v14 is async).
- Query the way a VoiceOver user finds things: `getByRole` with a `name`, then `getByText`; `testID` last.
- Press through `userEvent.setup()`.
- A screen that reads params or navigates renders through `renderRouterWithProviders` with stub
  routes around it, and asserts with `expect(screen).toHavePathname(...)`.
- `fakeEndpoints()` supplies a free account and empty backlog by default. Stub
  other endpoints a test reads; unstubbed calls reject with a message naming them.
- No snapshots: they pin the mocks' output, not behaviour.

## Gotchas

- `renderRouter` turns on Jest's fake timers. A query refetch or a debounce
  shows up only through `findBy*`/`waitFor` or `jest.advanceTimersByTimeAsync`;
  a real `setTimeout` in such a test never fires.
- Anything using `Stack.Title`, `Stack.Toolbar` or `Stack.SearchBar` needs a
  stack around it: add `_layout: () => <Stack />` to the route map. These render
  as props on the native header (`RNSScreenStackHeaderConfig`), not as
  elements. `test/routes/app.tsx` has `pressHeaderButton` for toolbar items.
- `insets` (on all three render helpers) sets the safe area, e.g.
  `{ ...PHONE_INSETS, right: 60 }` for an asymmetric sidebar inset. It steers a
  `useSafeAreaInsets` mock rather than a provider, because `renderRouter`
  mounts its own `SafeAreaProvider`. `@test/queries` finds a shelf's scroll
  view and reads its side padding.
- AsyncStorage is emptied and `jest.spyOn` spies are restored before every
  test, so a suite needs no cleanup of its own. Its methods are shared
  `jest.fn`s, though: override one with `mockImplementationOnce`, never
  `mockImplementation`, or the override leaks into later tests in the file.
- A module that keeps state at module scope (recents, the widget queue) loads
  fresh per test through `jest.isolateModules`. A fresh registry has its own
  i18n instance: call `initI18n("en")` on it.
- Use `testQueryClient()` rather than the app's `createQueryClient()`: the app's
  5-minute garbage-collection timers keep Jest from exiting.
- `test/routes/` renders the real `src/app` tree (tests may not live inside
  `app/`). `test/routes/app.tsx` fakes the server at `fetch`.

## Scope and native checks

Run the workspace `test` script for Jest with coverage, or `test:watch` while
iterating. Tests belong beside feature and infrastructure subjects; route tests
remain here because Expo Router treats files inside `src/app` as routes.

The native fakes test app behavior, not the SDKs' real rendering, gestures,
provisioning or purchase dialogs. The isolated widget view is excluded from
coverage; its snapshot and routing logic are tested separately. Use the
[device checklist](../../../docs/mobile-device-verification.md) for native checks.
The [account-switch ADR](../../../docs/adr/0004-account-switch-isolation.md)
records a widget queue overlap not established by the existing clearing tests.
