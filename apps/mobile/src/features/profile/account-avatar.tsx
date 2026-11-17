import { Image, RNHostView } from "@expo/ui/swift-ui";
import { foregroundStyle } from "@expo/ui/swift-ui/modifiers";
import { StyleSheet } from "react-native";

import { RemoteImage } from "@/components/remote-image";

const SIZE = 40;

/**
 * The account row's picture. Decorative: the row's label already names the
 * person. A remote photo goes through an RN view because SwiftUI's `Image`
 * here takes only symbols, asset names and `file://` URIs.
 */
export function AccountAvatar({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) {
    return (
      <Image
        systemName="person.crop.circle.fill"
        size={SIZE}
        modifiers={[foregroundStyle({ type: "hierarchical", style: "secondary" })]}
      />
    );
  }

  return (
    <RNHostView matchContents>
      <RemoteImage
        testID="account-avatar-image"
        source={{ uri: imageUrl }}
        style={styles.avatar}
        accessible={false}
        pointerEvents="none"
      />
    </RNHostView>
  );
}

const styles = StyleSheet.create({
  avatar: { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
});
