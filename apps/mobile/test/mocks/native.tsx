/**
 * The native SDKs the app talks to, as fakes a test can steer. `test/setup.ts`
 * points each module at the matching export here and calls `resetNative()`
 * before every test, so no state leaks between tests.
 *
 * A test changes what the SDK reports through the state objects (`clerk`,
 * `share`), then re-renders; it asserts on calls through the `jest.fn`s.
 */
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

// --- @clerk/expo ------------------------------------------------------------

export const clerk = {
  isLoaded: true,
  isAuthFlowComplete: true,
  userId: "user_1" as string | null | undefined,
  imageUrl: "https://img.clerk.com/user_1.png",
  getToken: jest.fn(async () => "tok_test" as string | null),
};

export const clerkExpo = {
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    isLoaded: clerk.isLoaded,
    isSignedIn: typeof clerk.userId === "string",
    userId: clerk.userId,
    getToken: clerk.getToken,
  }),
  useUser: () => ({
    isLoaded: clerk.isLoaded,
    user: typeof clerk.userId === "string" ? { id: clerk.userId, imageUrl: clerk.imageUrl } : null,
  }),
};

export const clerkNativeComponents = {
  useAuthViewState: () => ({
    isLoaded: clerk.isLoaded,
    isAuthFlowComplete: clerk.isAuthFlowComplete,
  }),
  AuthView: () => <View testID="clerk-auth-view" />,
  UserProfileView: ({ onDismiss }: { onDismiss?: () => void }) => (
    <Pressable testID="clerk-user-profile" accessibilityRole="button" onPress={onDismiss}>
      <Text>Profile</Text>
    </Pressable>
  ),
};

export const clerkTokenCache = { tokenCache: {} };

// --- react-native-purchases(-ui) ---------------------------------------------

type CustomerInfoListener = (info: { entitlements: { active: Record<string, unknown> } }) => void;

const customerInfoListeners = new Set<CustomerInfoListener>();

export const purchases = {
  configure: jest.fn(),
  logIn: jest.fn(async () => ({})),
  logOut: jest.fn(async () => ({})),
  isAnonymous: false,
  addCustomerInfoUpdateListener: jest.fn((listener: CustomerInfoListener) => {
    customerInfoListeners.add(listener);
  }),
  removeCustomerInfoUpdateListener: jest.fn((listener: CustomerInfoListener) => {
    customerInfoListeners.delete(listener);
  }),
};

/** What RevenueCat's SDK does when a purchase or renewal lands. */
export function emitCustomerInfo(activeEntitlements: string[]): void {
  const active = Object.fromEntries(activeEntitlements.map((id) => [id, { identifier: id }]));
  for (const listener of customerInfoListeners) listener({ entitlements: { active } });
}

export const revenueCatUI = {
  presentCustomerCenter: jest.fn(async () => undefined),
  Paywall: ({
    onPurchaseCompleted,
    onRestoreCompleted,
    onDismiss,
  }: {
    onPurchaseCompleted?: () => void;
    onRestoreCompleted?: () => void;
    onDismiss?: () => void;
  }) => (
    <View testID="revenuecat-paywall">
      <Pressable accessibilityRole="button" onPress={onPurchaseCompleted}>
        <Text>Purchase</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onRestoreCompleted}>
        <Text>Restore</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onDismiss}>
        <Text>Dismiss</Text>
      </Pressable>
    </View>
  ),
};

// --- expo-observe -----------------------------------------------------------

export const observe = {
  Observe: { configure: jest.fn(), markInteractive: jest.fn() },
  ObserveRoot: { wrap: <T,>(component: T) => component },
};

// --- expo-store-review ------------------------------------------------------

export const storeReview = {
  hasAction: jest.fn(async () => true),
  requestReview: jest.fn(async () => undefined),
};

// --- expo-widgets -----------------------------------------------------------

export const expoWidgets = {
  // No App Group off-device: covers.ts treats that as "nothing to write".
  widgetsDirectory: null,
  createWidget: <Snapshot,>(name: string, View: unknown, initial: Snapshot) => ({
    name,
    View,
    initial,
    updateSnapshot: jest.fn(),
  }),
};

// --- expo-sharing -----------------------------------------------------------

export const share = {
  sharedPayloads: [] as unknown[],
  resolvedSharedPayloads: [] as unknown[],
  isResolving: false,
  error: null as Error | null,
  clearSharedPayloads: jest.fn(),
};

export const expoSharing = {
  useIncomingShare: () => ({ ...share }),
};

// ---------------------------------------------------------------------------

export function resetNative(): void {
  Object.assign(clerk, {
    isLoaded: true,
    isAuthFlowComplete: true,
    userId: "user_1",
    imageUrl: "https://img.clerk.com/user_1.png",
  });
  clerk.getToken.mockImplementation(async () => "tok_test");
  customerInfoListeners.clear();
  purchases.isAnonymous = false;
  Object.assign(share, {
    sharedPayloads: [],
    resolvedSharedPayloads: [],
    isResolving: false,
    error: null,
  });
  storeReview.hasAction.mockImplementation(async () => true);
}
