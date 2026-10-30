import { Button, Host, NavigationStack, RNHostView, TabView, Toolbar } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  ignoreSafeArea,
  indexViewStyle,
  tabViewStyle,
} from "@expo/ui/swift-ui/modifiers";
import { useTranslation } from "react-i18next";
import { Modal, StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RemoteImage } from "@/components/remote-image";
import { screenshotLabel } from "@/features/game/screenshot-label";
import { screenshotUrl } from "@/lib/igdb/image";
import { SHOT_ASPECT } from "@/ui/theme";
import { IOS_MAJOR } from "@/ui/ios-version";
import { MODAL_ORIENTATIONS } from "@/ui/modal-orientations";

/** A page-style SwiftUI `TabView`, so paging and rotation are UIKit's. */
export function ScreenshotViewer({
  screenshots,
  openId,
  onClose,
}: {
  screenshots: string[];
  openId: string;
  onClose: () => void;
}) {
  const window = useWindowDimensions();
  // Pages stop above the home indicator, so that strip is not theirs to fill.
  const { bottom } = useSafeAreaInsets();
  const width = Math.min(window.width, (window.height - bottom) * SHOT_ASPECT);
  const size = { width, height: width / SHOT_ASPECT };
  const { t } = useTranslation();
  const closeLabel = t("game.closeScreenshots");

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      supportedOrientations={MODAL_ORIENTATIONS}
      onRequestClose={onClose}
    >
      <Host style={styles.host} colorScheme="dark">
        {/* A navigation bar, not a floating button, so iOS places Close: top
            trailing on a regular iPhone, first in the rail on iPhone Duo. */}
        <NavigationStack>
          <Toolbar>
            <TabView
              defaultSelection={openId}
              modifiers={[
                tabViewStyle({ type: "page", indexDisplayMode: "always" }),
                indexViewStyle({ backgroundDisplayMode: "always" }),
                // Pages span the window under the bar, which floats over them
                // instead of pushing them down, and past the notch in
                // landscape. The bottom edge stays safe so the page dots sit
                // above the home indicator rather than on it.
                ignoreSafeArea({ edges: "top" }),
                ignoreSafeArea({ edges: "horizontal" }),
              ]}
            >
              {screenshots.map((imageId, index) => (
                <TabView.Tab key={imageId} value={imageId}>
                  <RNHostView matchContents>
                    <RemoteImage
                      source={{ uri: screenshotUrl(imageId, "huge") }}
                      style={size}
                      contentFit="contain"
                      pointerEvents="none"
                      accessible
                      accessibilityLabel={screenshotLabel(index, screenshots.length)}
                    />
                  </RNHostView>
                </TabView.Tab>
              ))}
            </TabView>

            <Toolbar.Content>
              {/* iOS 26 draws the system close (X) for a bare `role="close"`;
                  earlier versions need the label and symbol spelled out. */}
              {IOS_MAJOR >= 26 ? (
                <Button
                  role="close"
                  onPress={onClose}
                  modifiers={[accessibilityLabel(closeLabel)]}
                />
              ) : (
                <Button role="close" label={closeLabel} systemImage="xmark" onPress={onClose} />
              )}
            </Toolbar.Content>
          </Toolbar>
        </NavigationStack>
      </Host>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: "black" },
});
