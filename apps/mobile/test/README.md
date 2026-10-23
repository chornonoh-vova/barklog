# Mobile tests

Jest via `jest-expo/ios`, with React Native Testing Library v14. A test sits
next to its subject as `<name>.test.ts(x)`; this folder holds what tests share.

| File                | What it gives a test                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `setup.ts`          | Global mocks, English copy, a phone-sized window — reset before every test.                                     |
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
- Stub only the endpoints a test reads; any other call rejects with a message naming it.
- No snapshots: they pin the mocks' output, not behaviour.
