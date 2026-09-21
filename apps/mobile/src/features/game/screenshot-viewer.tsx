import { Button, Host, Image, Overlay, RNHostView, TabView } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonStyle,
  indexViewStyle,
  padding,
  tabViewStyle,
} from "@expo/ui/swift-ui/modifiers";
import { Modal, StyleSheet, useWindowDimensions } from "react-native";

import { RemoteImage } from "@/components/remote-image";
import { screenshotLabel } from "@/features/game/screenshot-label";
import { screenshotUrl } from "@/igdb-image";
import { SHOT_ASPECT } from "@/theme";
import { GLASS_STYLE } from "@/ui/platform-glass";

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
  const width = Math.min(window.width, window.height * SHOT_ASPECT);
  const size = { width, height: width / SHOT_ASPECT };

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <Host style={styles.host} colorScheme="dark">
        <Overlay alignment="topTrailing">
          <TabView
            defaultSelection={openId}
            modifiers={[
              tabViewStyle({ type: "page", indexDisplayMode: "always" }),
              indexViewStyle({ backgroundDisplayMode: "always" }),
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

          <Overlay.Content>
            <Button
              onPress={onClose}
              modifiers={[
                buttonStyle(GLASS_STYLE),
                padding({ top: 8, trailing: 16 }),
                accessibilityLabel("Close screenshots"),
              ]}
            >
              <Image systemName="xmark" />
            </Button>
          </Overlay.Content>
        </Overlay>
      </Host>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: "black" },
});
