import { useUser } from "@clerk/expo";
import { UserProfileView } from "@clerk/expo/native";
import { Image } from "expo-image";
import { Stack } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet } from "react-native";

/**
 * Not Clerk's `UserButton`. That is a native host view whose
 * `ClerkNativeHostingCoordinator.attach` finds its parent by walking up the
 * responder chain. From iOS 26, react-native-screens wraps header subviews in an
 * extra centering view that sits outside the screen's own view controller, so
 * the walk overshoots onto the `UINavigationController` — whose `children` are
 * its `viewControllers`, so `addChild` injects a phantom second controller and
 * wipes both the title and this toolbar item. iOS 18 has no wrapper and works,
 * which is the whole of the 18/26 split.
 *
 * Presented rather than routed because Clerk dismisses its native view itself
 * and fires `onDismiss` afterwards, so a route-based profile calling
 * `router.back()` has nothing left to pop. Local state has no such edge, and it
 * keeps (tabs) the only root route, which is what lets the root layout be a
 * `Slot`.
 *
 * Tab titles stay inline rather than large: UIKit puts right bar items in the
 * compact row and a large title below, leaving the avatar floating above it.
 */
export function ProfileToolbar() {
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open account"
            onPress={() => setIsOpen(true)}
            style={styles.button}
          >
            {/* Clerk always resolves an imageUrl, generating one from initials. */}
            <Image source={{ uri: user?.imageUrl }} style={styles.avatar} contentFit="cover" />
          </Pressable>
        </Stack.Toolbar.View>
      </Stack.Toolbar>

      {/* `Modal` renders nothing while hidden, so the native profile view is
          mounted only for the tab whose avatar was tapped. */}
      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsOpen(false)}
      >
        <UserProfileView style={styles.profile} onDismiss={() => setIsOpen(false)} />
      </Modal>
    </>
  );
}

const SIZE = 32;

const styles = StyleSheet.create({
  button: { width: SIZE, height: SIZE },
  avatar: { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  profile: { flex: 1 },
});
