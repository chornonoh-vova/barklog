import { useUser } from "@clerk/expo";
import {
  Button,
  Form,
  Host,
  HStack,
  Image,
  Label,
  ProgressView,
  Section,
  Spacer,
  Text,
  VStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  disabled,
  font,
  foregroundStyle,
  imageScale,
} from "@expo/ui/swift-ui/modifiers";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import RevenueCatUI from "react-native-purchases-ui";
import { StyleSheet } from "react-native";

import { openPaywall } from "@/features/paywall/open-paywall";
import { AccountAvatar } from "@/features/profile/account-avatar";
import {
  accountRowText,
  premiumRow,
  versionLine,
  type AccountUser,
} from "@/features/profile/profile-rows";
import { useAccountActions } from "@/features/profile/use-account-actions";
import { usePremium } from "@/lib/api/hooks";

const PRIMARY = { type: "hierarchical", style: "primary" } as const;
const SECONDARY = { type: "hierarchical", style: "secondary" } as const;
const TERTIARY = { type: "hierarchical", style: "tertiary" } as const;

/** `buildNumber` is the binary's own `CFBundleVersion`; EAS sets it remotely. */
const VERSION = versionLine(
  Constants.expoConfig?.version ?? null,
  Constants.platform?.ios?.buildNumber ?? null,
);

/**
 * The Profile tab: a grouped list like iOS Settings. Section order is fixed
 * (account group, then Sign Out, then Delete Account over the version), and a
 * section with nothing in it yet is absent.
 */
export function ProfileScreen({ onOpenAccount }: { onOpenAccount: () => void }) {
  const { user: clerkUser } = useUser();
  const premium = premiumRow(usePremium());
  const { signOut, deleteAccount, isDeleting } = useAccountActions({
    onReverificationRequired: onOpenAccount,
  });
  const { t } = useTranslation();

  const user: AccountUser = {
    fullName: clerkUser?.fullName ?? null,
    primaryEmailAddress: clerkUser?.primaryEmailAddress?.emailAddress ?? null,
    imageUrl: clerkUser?.imageUrl || null,
  };
  const { title, subtitle } = accountRowText(user);
  const deleteLabel = t("profile.deleteAccount");
  const deleteA11yLabel = isDeleting
    ? `${deleteLabel}, ${t("profile.deleting").toLocaleLowerCase()}`
    : deleteLabel;

  return (
    <Host style={styles.host}>
      <Form>
        <Section>
          <Button
            onPress={onOpenAccount}
            modifiers={[accessibilityLabel(subtitle ? `${title}, ${subtitle}` : title)]}
          >
            <HStack spacing={12}>
              <AccountAvatar imageUrl={user.imageUrl} />
              <VStack alignment="leading" spacing={2}>
                <Text modifiers={[foregroundStyle(PRIMARY)]}>{title}</Text>
                {subtitle === null ? null : (
                  <Text
                    modifiers={[font({ textStyle: "subheadline" }), foregroundStyle(SECONDARY)]}
                  >
                    {subtitle}
                  </Text>
                )}
              </VStack>
              <Spacer />
              <Image
                systemName="chevron.right"
                modifiers={[imageScale("small"), foregroundStyle(TERTIARY)]}
              />
            </HStack>
          </Button>

          {premium === null ? null : (
            <Button
              onPress={
                premium.action === "customerCenter"
                  ? () => void RevenueCatUI.presentCustomerCenter()
                  : openPaywall
              }
              modifiers={[accessibilityLabel(premium.accessibilityLabel)]}
            >
              <HStack>
                <Label title={premium.title} systemImage={premium.icon} />
                <Spacer />
                {premium.status === null ? null : (
                  <Text modifiers={[foregroundStyle(SECONDARY)]}>{premium.status}</Text>
                )}
              </HStack>
            </Button>
          )}
        </Section>

        <Section>
          {/* `onPress` carries no event, so there is no view to anchor the
              sheet to: iPad presents it centred instead of as a popover. */}
          <Button
            label={t("profile.signOut")}
            systemImage="rectangle.portrait.and.arrow.right"
            onPress={() => signOut(null)}
            modifiers={[disabled(isDeleting)]}
          />
        </Section>

        <Section footer={<Text>{VERSION}</Text>}>
          <Button
            role="destructive"
            onPress={deleteAccount}
            modifiers={[disabled(isDeleting), accessibilityLabel(deleteA11yLabel)]}
          >
            <HStack>
              <Label title={deleteLabel} systemImage="trash" />
              {isDeleting ? (
                <>
                  <Spacer />
                  <ProgressView />
                </>
              ) : null}
            </HStack>
          </Button>
        </Section>
      </Form>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
