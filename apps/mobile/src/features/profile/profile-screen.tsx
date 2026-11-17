import { useUser } from "@clerk/expo";
import {
  Button,
  Form,
  Host,
  HStack,
  ProgressView,
  Section,
  Spacer,
  Text,
  VStack,
} from "@expo/ui/swift-ui";
import { accessibilityLabel, disabled, font, opacity } from "@expo/ui/swift-ui/modifiers";
import type { BacklogStatus } from "@repo/contracts";
import { useTranslation } from "react-i18next";
import RevenueCatUI from "react-native-purchases-ui";
import { StyleSheet } from "react-native";

import { openPaywall } from "@/features/paywall/open-paywall";
import { AccountAvatar } from "@/features/profile/account-avatar";
import { accountRowText, premiumRow, type AccountUser } from "@/features/profile/profile-rows";
import { appStoreReviewUrl } from "@/features/profile/rate-app";
import { DESTRUCTIVE, PRIMARY, ROW, ROW_SHAPE, SECONDARY } from "@/features/profile/row-styles";
import { ActionRow, Chevron, ExternalLinkRow, NavigationRow } from "@/features/profile/rows";
import { SettingsIcon } from "@/features/profile/settings-icon";
import { StatsSection } from "@/features/profile/stats-section";
import { useAccountActions } from "@/features/profile/use-account-actions";
import { useSendFeedback } from "@/features/profile/use-send-feedback";
import { usePremium } from "@/lib/api/hooks";

/**
 * The Profile tab: a grouped list like iOS Settings. Section order is fixed
 * (account group; Stats; the Barklog section with Rate, Feedback and About;
 * Sign Out; then Delete Account), and
 * a section with nothing in it yet is absent.
 */
export function ProfileScreen({
  onOpenAccount,
  onOpenAbout,
  onOpenStatus,
  onFindGames,
}: {
  onOpenAccount: () => void;
  onOpenAbout: () => void;
  /** A Stats row: Home, filtered to that status. */
  onOpenStatus: (status: BacklogStatus) => void;
  /** The empty backlog's Stats row. */
  onFindGames: () => void;
}) {
  const { user: clerkUser } = useUser();
  const premium = premiumRow(usePremium());
  const { signOut, deleteAccount, isDeleting } = useAccountActions({
    onReverificationRequired: onOpenAccount,
  });
  const { t } = useTranslation();
  const reviewUrl = appStoreReviewUrl();
  const sendFeedback = useSendFeedback();

  const user: AccountUser = {
    fullName: clerkUser?.fullName ?? null,
    primaryEmailAddress: clerkUser?.primaryEmailAddress?.emailAddress ?? null,
    imageUrl: clerkUser?.imageUrl || null,
  };
  const { title, subtitle } = accountRowText(user);
  const deleteLabel = t("profile.deleteAccount");
  const deleteA11yLabel = isDeleting ? t("profile.deletingLabel") : deleteLabel;
  /** A plain button does not dim when disabled; the rows say so themselves. */
  const busy = opacity(isDeleting ? 0.4 : 1);

  return (
    <Host style={styles.host}>
      <Form>
        <Section>
          <Button
            onPress={onOpenAccount}
            modifiers={[...ROW, disabled(isDeleting), accessibilityLabel(`${title}, ${subtitle}`)]}
          >
            <HStack spacing={12} modifiers={[ROW_SHAPE]}>
              <AccountAvatar imageUrl={user.imageUrl} />
              <VStack alignment="leading" spacing={2}>
                <Text modifiers={[font({ textStyle: "title3", weight: "semibold" }), PRIMARY]}>
                  {title}
                </Text>
                <Text modifiers={[font({ textStyle: "subheadline" }), SECONDARY]}>{subtitle}</Text>
              </VStack>
              <Spacer />
              <Chevron />
            </HStack>
          </Button>

          {premium === null ? null : (
            <Button
              onPress={
                premium.action === "customerCenter"
                  ? () => void RevenueCatUI.presentCustomerCenter()
                  : openPaywall
              }
              modifiers={[...ROW, accessibilityLabel(premium.accessibilityLabel)]}
            >
              <HStack spacing={12} modifiers={[ROW_SHAPE]}>
                <SettingsIcon systemName={premium.icon} color="systemOrange" />
                <Text modifiers={[PRIMARY]}>{premium.title}</Text>
                <Spacer />
                {premium.status === null ? null : (
                  <Text modifiers={[SECONDARY]}>{premium.status}</Text>
                )}
              </HStack>
            </Button>
          )}
        </Section>

        <StatsSection onOpenStatus={onOpenStatus} onFindGames={onFindGames} />

        <Section
          title={t("profile.appSection")}
          footer={<Text>{t("profile.feedbackFooter")}</Text>}
        >
          {reviewUrl === null ? null : (
            <ExternalLinkRow
              title={t("profile.rateApp")}
              url={reviewUrl}
              icon={<SettingsIcon systemName="star.bubble.fill" color="systemBlue" />}
            />
          )}
          <ActionRow
            title={t("profile.feedback")}
            onPress={sendFeedback}
            icon={<SettingsIcon systemName="paperplane.fill" color="systemGreen" />}
          />
          <NavigationRow
            title={t("profile.aboutRow")}
            onPress={onOpenAbout}
            icon={<SettingsIcon systemName="info" color="systemIndigo" />}
          />
        </Section>

        <Section>
          <Button
            onPress={signOut}
            modifiers={[
              ...ROW,
              disabled(isDeleting),
              busy,
              accessibilityLabel(t("profile.signOut")),
            ]}
          >
            <HStack spacing={12} modifiers={[ROW_SHAPE]}>
              <SettingsIcon systemName="rectangle.portrait.and.arrow.right" color="systemGray" />
              <Text modifiers={[PRIMARY]}>{t("profile.signOut")}</Text>
              <Spacer />
            </HStack>
          </Button>
        </Section>

        <Section>
          <Button
            role="destructive"
            onPress={deleteAccount}
            modifiers={[...ROW, disabled(isDeleting), busy, accessibilityLabel(deleteA11yLabel)]}
          >
            <HStack spacing={12} modifiers={[ROW_SHAPE]}>
              <SettingsIcon systemName="trash.fill" color="systemRed" />
              <Text modifiers={[DESTRUCTIVE]}>{deleteLabel}</Text>
              <Spacer />
              {isDeleting ? <ProgressView /> : null}
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
