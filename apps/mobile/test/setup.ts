import { initI18n } from "@/lib/i18n/instance";

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

// Every test reads English copy unless it switches language itself.
initI18n("en");
