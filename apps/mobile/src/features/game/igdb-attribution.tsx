import { Host, Label, Link } from "@expo/ui/swift-ui";
import { font } from "@expo/ui/swift-ui/modifiers";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";

import { gameUrl } from "@/lib/igdb/url";
import { Brand } from "@/ui/theme";

/** The credit IGDB's terms require. SwiftUI's own `Link`, as on the onboarding
 * IGDB page, so it reads as a link and carries the external-link symbol. */
export function IgdbAttribution({ slug }: { slug: string }) {
  const { t } = useTranslation();

  return (
    <Host
      style={styles.host}
      alignment="center"
      matchContents={{ vertical: true }}
      seedColor={Brand.tint}
    >
      <Link destination={gameUrl(slug)} modifiers={[font({ textStyle: "footnote" })]}>
        <Label title={t("game.attribution")} systemImage="arrow.up.right.square" />
      </Link>
    </Host>
  );
}

const styles = StyleSheet.create({
  // Full width, not `alignSelf: "center"`: the host measures only its height,
  // so a centred one shrinks to nothing and the label collapses to its icon.
  // SwiftUI centres the link inside it.
  host: { marginHorizontal: 16, marginBottom: 32 },
});
