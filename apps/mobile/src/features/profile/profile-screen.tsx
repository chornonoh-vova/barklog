import { useUser } from "@clerk/expo";
import {
  Button,
  Form,
  Host,
  HStack,
  ProgressView,
  ScrollView,
  Spacer,
  Text,
  VStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  background,
  disabled,
  font,
  frame,
  opacity,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import type { BacklogStatus } from "@repo/contracts";
import { useTranslation } from "react-i18next";
import RevenueCatUI from "react-native-purchases-ui";
import { PlatformColor, StyleSheet, View } from "react-native";

import { openPaywall } from "@/features/paywall/open-paywall";
import { AccountAvatar } from "@/features/profile/account-avatar";
import { accountRowText, premiumRow, type AccountUser } from "@/features/profile/profile-rows";
import { appStoreReviewUrl } from "@/features/profile/rate-app";
import {
  ProfileCards,
  ProfileSection,
  rowShape as rowShapeFor,
} from "@/features/profile/profile-section";
import { DESTRUCTIVE, PRIMARY, ROW, SECONDARY } from "@/features/profile/row-styles";
import { ActionRow, Chevron, ExternalLinkRow, NavigationRow } from "@/features/profile/rows";
import { SettingsIcon } from "@/features/profile/settings-icon";
import { StatsSection } from "@/features/profile/stats-section";
import { useAccountActions } from "@/features/profile/use-account-actions";
import { useSendFeedback } from "@/features/profile/use-send-feedback";
import { usePremium } from "@/lib/api/hooks";
import { columnCount } from "@/ui/columns";
import { useMeasuredWidth } from "@/ui/use-measured-width";

/**
 * The Profile tab: a grouped list like iOS Settings. Section order is fixed
 * (account group; Stats; the Barklog section with Rate, Feedback and About;
 * Sign Out; then Delete Account), and
 * a section with nothing in it yet is absent.
 *
 * On a wide window (iPad, iPhone landscape) one stretched list reads poorly,
 * so the sections split into two lists side by side: who you are and what
 * you have on the left, the app and leaving it on the right. Same order, read
 * left column first.
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
  const { width, fontScale, onLayout } = useMeasuredWidth();
  const split = columnCount(width, fontScale) >= 2;
  // The screen provides `ProfileCards`, so its own rows cannot read it.
  const rowShape = rowShapeFor(split);

  const yours = (
    <>
      {/* Titled only in columns: it lines this card up with the titled
          Barklog card opposite. A phone's list leads untitled, as Settings does. */}
      <ProfileSection title={split ? t("profile.account") : undefined}>
        <Button
          onPress={onOpenAccount}
          modifiers={[...ROW, disabled(isDeleting), accessibilityLabel(`${title}, ${subtitle}`)]}
        >
          <HStack spacing={12} modifiers={rowShape}>
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
            <HStack spacing={12} modifiers={rowShape}>
              <SettingsIcon systemName={premium.icon} color="systemOrange" />
              <Text modifiers={[PRIMARY]}>{premium.title}</Text>
              <Spacer />
              {premium.status === null ? null : (
                <Text modifiers={[SECONDARY]}>{premium.status}</Text>
              )}
            </HStack>
          </Button>
        )}
      </ProfileSection>

      <StatsSection onOpenStatus={onOpenStatus} onFindGames={onFindGames} />
    </>
  );

  const app = (
    <>
      <ProfileSection title={t("profile.appSection")} footer={t("profile.feedbackFooter")}>
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
      </ProfileSection>

      <ProfileSection>
        <Button
          onPress={signOut}
          modifiers={[...ROW, disabled(isDeleting), busy, accessibilityLabel(t("profile.signOut"))]}
        >
          <HStack spacing={12} modifiers={rowShape}>
            <SettingsIcon systemName="rectangle.portrait.and.arrow.right" color="systemGray" />
            <Text modifiers={[PRIMARY]}>{t("profile.signOut")}</Text>
            <Spacer />
          </HStack>
        </Button>
      </ProfileSection>

      <ProfileSection>
        <Button
          role="destructive"
          onPress={deleteAccount}
          modifiers={[...ROW, disabled(isDeleting), busy, accessibilityLabel(deleteA11yLabel)]}
        >
          <HStack spacing={12} modifiers={rowShape}>
            <SettingsIcon systemName="trash.fill" color="systemRed" />
            <Text modifiers={[DESTRUCTIVE]}>{deleteLabel}</Text>
            <Spacer />
            {isDeleting ? <ProgressView /> : null}
          </HStack>
        </Button>
      </ProfileSection>
    </>
  );

  return (
    // The wrapper measures the width the tab actually has: an open iPad
    // sidebar takes part of the window.
    <View style={styles.host} onLayout={onLayout}>
      <ProfileCards value={split}>
        <Host style={styles.host}>
          {split ? (
            // One scroll view for both columns, so they move together.
            <ScrollView modifiers={[background(PlatformColor("systemGroupedBackground"))]}>
              <HStack
                alignment="top"
                spacing={COLUMN_SPACING}
                modifiers={[padding({ horizontal: COLUMN_SPACING, vertical: COLUMN_SPACING })]}
              >
                <VStack spacing={SECTION_SPACING} modifiers={[frame({ maxWidth: Infinity })]}>
                  {yours}
                </VStack>
                <VStack spacing={SECTION_SPACING} modifiers={[frame({ maxWidth: Infinity })]}>
                  {app}
                </VStack>
              </HStack>
            </ScrollView>
          ) : (
            <Form>
              {yours}
              {app}
            </Form>
          )}
        </Host>
      </ProfileCards>
    </View>
  );
}

/** Between the two columns and around them. */
const COLUMN_SPACING = 20;
/** Between cards in a column, close to an inset-grouped list's section gap. */
const SECTION_SPACING = 24;

const styles = StyleSheet.create({
  host: { flex: 1 },
});
