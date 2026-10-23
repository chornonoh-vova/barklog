import { Observe } from "expo-observe";
import * as Updates from "expo-updates";

/**
 * Imported for its side effect from the root layout, ahead of any screen: the
 * expo-router integration asserts it was switched on before the first screen
 * mounted. One call only — each `configure` replaces the previous config.
 *
 * Release builds carry their eas.json channel (`preview`, `production`), which
 * keeps the variants apart on the dashboard. Development builds report no
 * channel and keep Observe's `NODE_ENV` default; they dispatch nothing anyway.
 */
Observe.configure({
  ...(Updates.channel ? { environment: Updates.channel } : {}),
  integrations: {
    // Route params are game ids only — public catalog ids, nothing to filter.
    "expo-router": true,
    // Logs `expo-image.oversized` when a cover decodes far above screen size.
    // The defaults stay: 1.5× threshold, query strings stripped before upload.
    "expo-image": true,
  },
});
