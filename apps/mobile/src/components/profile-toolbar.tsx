import { useUser } from "@clerk/expo";
import { UserProfileView } from "@clerk/expo/native";
import { Image } from "expo-image";
import { Stack } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet } from "react-native";

/**
 * The avatar in the top-right of every tab root, as Apple Music has it.
 *
 * **Why this is not Clerk's `UserButton`.** `UserButton` is a native host view:
 * `ClerkNativeHostingCoordinator.attach` finds a parent by walking up the
 * responder chain and calls `parentVC.addChild(controller)`. From iOS 26,
 * react-native-screens wraps header subviews in an extra centering view
 * (`RNSScreenStackHeaderSubview.mm`, the liquid-glass backdrop workaround), and
 * that wrapper sits outside the screen's own view controller — so the walk
 * overshoots onto the `UINavigationController`. A `UINavigationController`'s
 * `children` *are* its `viewControllers`, so the `addChild` injects a phantom
 * second controller: the bar grows a back button and starts reflecting Clerk's
 * title-less navigationItem, which wipes both the title and this toolbar item.
 * On iOS 18 there is no wrapper, the walk finds the screen's controller, and it
 * works — which is the whole of the 18/26 split.
 *
 * So the header holds a plain image button, and `UserProfileView` — the same
 * surface `UserButton` opens — is presented in a sheet, where it hosts against
 * the modal's own controller.
 *
 * Presented rather than routed on purpose. Clerk dismisses its native view
 * itself and fires `onDismiss` afterwards, so a route-based profile calling
 * `router.back()` there has nothing left to pop and logs "The action 'GO_BACK'
 * was not handled by any navigator". Local state has no such edge, and it keeps
 * (tabs) the only root route, which is what lets the root layout be a `Slot`.
 *
 * `Stack.Toolbar.View` is the only slot that accepts an arbitrary React
 * component, and it must sit inside a `Stack.Toolbar` carrying the placement;
 * `Stack.Toolbar.Button` takes an SF Symbol name and so cannot host an image.
 *
 * `placement="right"` forces `headerShown: true`, which is what brings the
 * header up at all. The tab titles are deliberately inline rather than large:
 * UIKit puts right bar items in the compact row and a large title on its own
 * row below, so a large title would leave the avatar floating above it.
 *
 * Deliberately not rendered on pushed screens: those get a back button and an
 * inline title, which is what every Apple app does.
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
            {/* Clerk always resolves an imageUrl, generating one from the
                user's initials when they have not set a picture. */}
            <Image source={{ uri: user?.imageUrl }} style={styles.avatar} contentFit="cover" />
          </Pressable>
        </Stack.Toolbar.View>
      </Stack.Toolbar>

      {/* `Modal` renders nothing while hidden, so the native profile view is
          only ever mounted for the tab whose avatar was actually tapped. */}
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
