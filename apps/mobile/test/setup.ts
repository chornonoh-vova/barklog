import type * as ReactNative from "react-native";
import { initReactI18next } from "react-i18next";

import { i18n, initI18n } from "@/lib/i18n/instance";

import type * as Native from "./mocks/native";
import { resetNative } from "./mocks/native";
import { setWindow } from "./window";

// The package's own in-memory mock: every method is a `jest.fn`, so a suite
// can script a read with `jest.mocked(AsyncStorage.getItem)`.
jest.mock("@react-native-async-storage/async-storage", () => {
  const mock = jest.requireActual<object>(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  );
  // An ES module shape, so `import AsyncStorage from` and `requireMock(...).default`
  // reach the same object.
  return { __esModule: true, default: mock, ...mock };
});

// The app uses Reanimated only for `UpdatingPill`'s fade. Its own Jest mock
// still boots the worklets runtime, which has no JSI here, so a fade becomes
// a plain view.
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual<typeof ReactNative>("react-native");
  return { __esModule: true, default: { View }, FadeIn: {}, FadeOut: {} };
});

// SwiftUI views as React Native elements a query can find; see the mock.
jest.mock("@expo/ui/swift-ui", () => ({
  ...jest.requireActual<object>("@expo/ui/swift-ui"),
  ...jest.requireActual<object>("./mocks/expo-ui"),
}));

// Native SDKs, as the steerable fakes in `./mocks/native`. Factories must be
// inline for Jest to hoist them, hence the repetition.
jest.mock("@clerk/expo", () => ({
  __esModule: true,
  ...jest.requireActual<typeof Native>("./mocks/native").clerkExpo,
}));
jest.mock("@clerk/expo/native-components", () => ({
  __esModule: true,
  ...jest.requireActual<typeof Native>("./mocks/native").clerkNativeComponents,
}));
jest.mock("@clerk/expo/token-cache", () => ({
  __esModule: true,
  ...jest.requireActual<typeof Native>("./mocks/native").clerkTokenCache,
}));
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: jest.requireActual<typeof Native>("./mocks/native").purchases,
}));
jest.mock("react-native-purchases-ui", () => ({
  __esModule: true,
  default: jest.requireActual<typeof Native>("./mocks/native").revenueCatUI,
}));
jest.mock("expo-observe", () => ({
  __esModule: true,
  ...jest.requireActual<typeof Native>("./mocks/native").observe,
}));
jest.mock("expo-store-review", () => ({
  __esModule: true,
  ...jest.requireActual<typeof Native>("./mocks/native").storeReview,
}));
jest.mock("expo-widgets", () => ({
  __esModule: true,
  ...jest.requireActual<typeof Native>("./mocks/native").expoWidgets,
}));
jest.mock("expo-sharing", () => ({
  __esModule: true,
  ...jest.requireActual<typeof Native>("./mocks/native").expoSharing,
}));

beforeEach(async () => {
  resetNative();
  await setWindow();
});

// What `src/lib/i18n/index.ts` does on device, minus the device's language:
// every test reads English copy unless it switches language itself.
i18n.use(initReactI18next);
initI18n("en");
