import { Form, Host, RNHostView, Section, Text, VStack } from "@expo/ui/swift-ui";
import {
  font,
  frame,
  listRowBackground,
  multilineTextAlignment,
} from "@expo/ui/swift-ui/modifiers";
import { nativeApplicationVersion, nativeBuildVersion } from "expo-application";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";

import { Mascot } from "@/components/mascot";
import { ABOUT_LINKS } from "@/features/profile/about-links";
import { versionLine } from "@/features/profile/profile-rows";
import { PRIMARY, SECONDARY } from "@/features/profile/row-styles";
import { ExternalLinkRow } from "@/features/profile/rows";

/** The version is the binary's (`expo-application`), so an OTA update never changes it. */
export function AboutScreen() {
  const { t } = useTranslation();
  const version = versionLine(nativeApplicationVersion, nativeBuildVersion);

  return (
    <Host style={styles.host}>
      <Form>
        <Section>
          <VStack
            spacing={4}
            modifiers={[frame({ maxWidth: Infinity }), listRowBackground("clear")]}
          >
            <RNHostView matchContents>
              <Mascot illustration="default" />
            </RNHostView>
            <Text modifiers={[font({ textStyle: "title2", weight: "bold" }), PRIMARY]}>
              Barklog
            </Text>
            <Text modifiers={[font({ textStyle: "subheadline" }), SECONDARY]}>{version}</Text>
          </VStack>
        </Section>

        <Section>
          <ExternalLinkRow title={t("about.privacy")} url={ABOUT_LINKS.privacy} />
          <ExternalLinkRow title={t("about.terms")} url={ABOUT_LINKS.terms} />
          <ExternalLinkRow title={t("about.support")} url={ABOUT_LINKS.support} />
        </Section>

        <Section>
          <ExternalLinkRow title={t("about.igdb")} url={ABOUT_LINKS.igdb} />
          <ExternalLinkRow title={t("about.source")} url={ABOUT_LINKS.source} />
        </Section>

        <Section
          footer={
            <Text modifiers={[frame({ maxWidth: Infinity }), multilineTextAlignment("center")]}>
              {t("about.ukraine")}
            </Text>
          }
        >
          <ExternalLinkRow title={t("about.creator")} url={ABOUT_LINKS.creator} />
        </Section>
      </Form>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
