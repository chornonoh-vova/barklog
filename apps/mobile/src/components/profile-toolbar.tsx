import { useUser } from "@clerk/expo";
import { UserProfileView } from "@clerk/expo/native";
import { Image } from "expo-image";
import { Stack } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet } from "react-native";

/**
 * Not Clerk's `UserButton`: it finds its parent by walking the responder chain,
 * and from iOS 26 react-native-screens adds a wrapper view that makes the walk
 * overshoot onto the `UINavigationController`, wiping the title and this item.
 * iOS 18 has no wrapper — that is the whole of the 18/26 split.
 *
 * Presented, not routed: Clerk dismisses its own native view, so a routed
 * profile calling `router.back()` has nothing left to pop.
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
