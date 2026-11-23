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
import { ProfileSection } from "@/features/profile/profile-section";
import { appStoreReviewUrl } from "@/features/profile/rate-app";
import {
  GroupedCards,
  PRIMARY,
  ROW,
  ROW_SPACING,
  SECONDARY,
  useRowShape,
} from "@/features/profile/row-styles";
import { ActionRow, Chevron, ExternalLinkRow, NavigationRow } from "@/features/profile/rows";
import { SettingsIcon } from "@/features/profile/settings-icon";
import { StatsSection } from "@/features/profile/stats-section";
import { useAccountActions } from "@/features/profile/use-account-actions";
import { useSendFeedback } from "@/features/profile/use-send-feedback";
import { usePremium } from "@/lib/api/hooks";
import { COLUMN_GAP, columnCount, GUTTER } from "@/ui/columns";
import { useMeasuredWidth } from "@/ui/use-measured-width";

/** Wide windows use cards in one scroll view: two `Form`s would scroll separately. */
export function ProfileScreen({
  onOpenAccount,
  onOpenAbout,
  onOpenStatus,
  onFindGames,
}: {
  onOpenAccount: () => void;
  onOpenAbout: () => void;
  onOpenStatus: (status: BacklogStatus) => void;
  onFindGames: () => void;
}) {
  const premium = premiumRow(usePremium());
  const { signOut, deleteAccount, isDeleting } = useAccountActions({
    onReverificationRequired: onOpenAccount,
  });
  const { t } = useTranslation();
  const reviewUrl = appStoreReviewUrl();
  const sendFeedback = useSendFeedback();
  const { width, fontScale, onLayout } = useMeasuredWidth();
  const split = columnCount(width, fontScale) >= 2;

  const deleteLabel = t("profile.deleteAccount");
  // A plain button does not dim when disabled.
  const busy = [disabled(isDeleting), opacity(isDeleting ? 0.4 : 1)];

  const yours = (
    <>
      {/* Titled in columns only, to line up with the Barklog card opposite. */}
      <ProfileSection title={split ? t("profile.account") : undefined}>
        <AccountRow onPress={onOpenAccount} disabled={isDeleting} />
        {premium === null ? null : (
          <ActionRow
            title={premium.title}
            label={premium.accessibilityLabel}
            onPress={
              premium.action === "customerCenter"
                ? () => void RevenueCatUI.presentCustomerCenter()
                : openPaywall
            }
            icon={<SettingsIcon systemName={premium.icon} color="systemOrange" />}
            trailing={
              premium.status === null ? null : <Text modifiers={[SECONDARY]}>{premium.status}</Text>
            }
          />
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
        <ActionRow
          title={t("profile.signOut")}
          onPress={signOut}
          modifiers={busy}
          icon={<SettingsIcon systemName="rectangle.portrait.and.arrow.right" color="systemGray" />}
        />
      </ProfileSection>

      <ProfileSection>
        <ActionRow
          title={deleteLabel}
          label={isDeleting ? t("profile.deletingLabel") : deleteLabel}
          destructive
          onPress={deleteAccount}
          modifiers={busy}
          icon={<SettingsIcon systemName="trash.fill" color="systemRed" />}
          trailing={isDeleting ? <ProgressView /> : null}
        />
      </ProfileSection>
    </>
  );

  return (
    // Measured here, not from the window: an open iPad sidebar takes part of it.
    <View style={styles.host} onLayout={onLayout}>
      <GroupedCards value={split}>
        <Host style={styles.host}>
          {split ? (
            <ScrollView modifiers={GROUPED_BACKGROUND}>
              <HStack alignment="top" spacing={COLUMN_GAP} modifiers={COLUMNS_PADDING}>
                {[yours, app].map((column, index) => (
                  <VStack key={index} spacing={SECTION_SPACING} modifiers={COLUMN}>
                    {column}
                  </VStack>
                ))}
              </HStack>
            </ScrollView>
          ) : (
            <Form>
              {yours}
              {app}
            </Form>
          )}
        </Host>
      </GroupedCards>
    </View>
  );
}

function AccountRow({ onPress, disabled: isDisabled }: { onPress: () => void; disabled: boolean }) {
  const { user: clerkUser } = useUser();
  const rowShape = useRowShape();
  const user: AccountUser = {
    fullName: clerkUser?.fullName ?? null,
    primaryEmailAddress: clerkUser?.primaryEmailAddress?.emailAddress ?? null,
    imageUrl: clerkUser?.imageUrl || null,
  };
  const { title, subtitle } = accountRowText(user);

  return (
    <Button
      onPress={onPress}
      modifiers={[...ROW, disabled(isDisabled), accessibilityLabel(`${title}, ${subtitle}`)]}
    >
      <HStack spacing={ROW_SPACING} modifiers={rowShape}>
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
  );
}

/** Must match the spacing `columnCount` assumes. */
const COLUMNS_PADDING = [padding({ horizontal: GUTTER, vertical: GUTTER })];
const COLUMN = [frame({ maxWidth: Infinity })];
const SECTION_SPACING = 24;
const GROUPED_BACKGROUND = [background(PlatformColor("systemGroupedBackground"))];

const styles = StyleSheet.create({
  host: { flex: 1 },
});
