# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

# Layout

- `src/app/` holds routes only. A route reads params, wires navigation and renders a feature's screen; it owns no logic and no tests (Expo Router forbids tests inside `app/`).
- `src/features/<name>/` owns everything one feature needs: its screen, its components, its logic and their tests, side by side.
- `src/components/` is for UI more than one feature renders. Start a component inside its feature; move it here when a second feature imports it.
- `src/lib/` is app infrastructure: API, auth, purchases, query cache, i18n, storage.
- `src/ui/` is design tokens (`theme.ts`) and layout helpers shared by every screen.
- A test sits next to its subject as `<name>.test.ts(x)`. Shared mocks and render helpers live in `test/`.
