import {
  Button,
  Host,
  HStack,
  Image,
  Label,
  Link,
  RNHostView,
  ScrollView,
  TabView,
  Text,
  VStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  buttonStyle,
  controlSize,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  indexViewStyle,
  multilineTextAlignment,
  padding,
  tabViewStyle,
} from "@expo/ui/swift-ui/modifiers";
import { FREE_ACTIVE_SLOTS } from "@repo/contracts";
import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";

import { Mascot } from "@/components/mascot";
import { siteUrl } from "@/lib/igdb/url";
import { GLASS_PROMINENT_STYLE } from "@/ui/platform-glass";
import { Brand } from "@/ui/theme";

import { CoverHero } from "./cover-hero";
import { ONBOARDING_COVERS } from "./covers";
import { SlotMeter } from "./slot-meter";
import {
  FREE_ROWS,
  nextStep,
  ONBOARDING_STEPS,
  WELCOME_ROWS,
  type FeatureRow,
  type OnboardingStep,
} from "./steps";
import { WidgetMock } from "./widget-mock";

/** A large number, not Infinity, which does not survive JSON to native. */
const FILL = 10_000;
/** Full width on iPhone; on iPad, as wide as the feature rows. */
const BUTTON_MAX_WIDTH = 420;
/** The page indicator's height with its background capsule, plus a margin. */
const PAGE_DOTS_CLEARANCE = 48;

const PAGES: Record<OnboardingStep, () => ReactNode> = {
  welcome: () => <WelcomeStep />,
  widgets: () => <WidgetsStep />,
  free: () => <FreeStep />,
};

/**
 * Three swipeable pages with dots; Continue also advances, and swiping back is
 * the way back. No Skip. The IGDB credit and the button sit below the pages,
 * so they never swipe or scroll away.
 */
export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const completed = useRef(false);
  const { t } = useTranslation();

  const next = nextStep(step);

  const advance = () => {
    if (next) {
      setStep(next);
      return;
    }
    // Once: a double tap on Get Started must not finish twice.
    if (completed.current) return;
    completed.current = true;
    onComplete();
  };

  return (
    <Host style={styles.host} seedColor={Brand.tint}>
      <VStack spacing={0}>
        <TabView
          selection={step}
          onSelectionChange={(value) => setStep(value as OnboardingStep)}
          modifiers={[
            tabViewStyle({ type: "page", indexDisplayMode: "always" }),
            indexViewStyle({ backgroundDisplayMode: "always" }),
          ]}
        >
          {ONBOARDING_STEPS.map((value) => (
            <TabView.Tab key={value} value={value}>
              {/* Each page scrolls on its own: on a short window, in landscape
                  or at a large text size a page is taller than the screen. */}
              <ScrollView>
                {/* Room under the content for the page dots, which float over
                    the bottom of the page: scrolled to the end, nothing sits
                    under them. */}
                <VStack modifiers={[padding({ bottom: PAGE_DOTS_CLEARANCE })]}>
                  {PAGES[value]()}
                </VStack>
              </ScrollView>
            </TabView.Tab>
          ))}
        </TabView>

        <VStack spacing={16} modifiers={[padding({ horizontal: 24 })]}>
          {/* The label fills the width, not the button: a frame on the button
              only widens its hit area, and the glass capsule hugs the text. */}
          <Button
            onPress={advance}
            modifiers={[buttonStyle(GLASS_PROMINENT_STYLE), controlSize("large")]}
          >
            <Text modifiers={[frame({ maxWidth: BUTTON_MAX_WIDTH })]}>
              {next ? t("onboarding.continue") : t("onboarding.getStarted")}
            </Text>
          </Button>
          {/* On every page, not only the first: nothing pops in and out under
              a swipe, and the credit IGDB requires is never more than a glance away. */}
          <Link destination={siteUrl()} modifiers={[font({ textStyle: "footnote" })]}>
            <Label title={t("onboarding.igdbCredit")} systemImage="arrow.up.right.square" />
          </Link>
        </VStack>
      </VStack>
    </Host>
  );
}

function WelcomeStep() {
  const { t } = useTranslation();

  return (
    <VStack spacing={20} modifiers={[padding({ horizontal: 32, top: 24 })]}>
      <RNHostView matchContents>
        <CoverHero covers={ONBOARDING_COVERS} />
      </RNHostView>
      <Heading title={t("onboarding.welcomeTitle")} subtitle={t("onboarding.welcomeSubtitle")} />
      <Rows rows={WELCOME_ROWS} />
    </VStack>
  );
}

function WidgetsStep() {
  const { t } = useTranslation();

  return (
    <VStack spacing={20} modifiers={[padding({ horizontal: 32, top: 48 })]}>
      <Heading title={t("onboarding.widgetsTitle")} subtitle={t("onboarding.widgetsSubtitle")} />
      <RNHostView matchContents>
        <WidgetMock covers={ONBOARDING_COVERS} />
      </RNHostView>
      <Text
        modifiers={[
          font({ textStyle: "footnote" }),
          foregroundStyle({ type: "hierarchical", style: "secondary" }),
          multilineTextAlignment("center"),
          fixedSize({ vertical: true }),
        ]}
      >
        {t("onboarding.widgetsHint")}
      </Text>
    </VStack>
  );
}

function FreeStep() {
  const { t } = useTranslation();

  return (
    <VStack spacing={20} modifiers={[padding({ horizontal: 32, top: 32 })]}>
      <RNHostView matchContents>
        <Mascot illustration="backlog" size={120} />
      </RNHostView>
      <Heading title={t("onboarding.freeTitle")} subtitle={t("onboarding.freeSubtitle")} />
      <Rows
        rows={FREE_ROWS}
        accessories={{
          slots: (
            <RNHostView matchContents>
              <SlotMeter />
            </RNHostView>
          ),
        }}
      />
    </VStack>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <VStack spacing={6}>
      <Text
        modifiers={[
          font({ textStyle: "title", weight: "bold" }),
          multilineTextAlignment("center"),
          fixedSize({ vertical: true }),
        ]}
      >
        {title}
      </Text>
      <Text
        modifiers={[
          font({ textStyle: "body" }),
          foregroundStyle({ type: "hierarchical", style: "secondary" }),
          multilineTextAlignment("center"),
          fixedSize({ vertical: true }),
        ]}
      >
        {subtitle}
      </Text>
    </VStack>
  );
}

/** Apple welcome-sheet rows: tinted symbol, bold title, secondary line. */
function Rows({
  rows,
  accessories = {},
}: {
  rows: readonly FeatureRow[];
  /** Extra decoration under a row's description, keyed by row id. */
  accessories?: Record<string, ReactNode>;
}) {
  const { t } = useTranslation();

  return (
    <VStack alignment="leading" spacing={16} modifiers={[frame({ maxWidth: 420 })]}>
      {rows.map((row) => (
        <HStack key={row.id} alignment="top" spacing={14}>
          <Image
            systemName={row.systemImage}
            size={24}
            modifiers={[
              foregroundStyle(Brand.tint),
              frame({ width: 32 }),
              // The title says it; VoiceOver reads the copy only.
              accessibilityHidden(true),
            ]}
          />
          <VStack
            alignment="leading"
            spacing={2}
            modifiers={[frame({ maxWidth: FILL, alignment: "leading" })]}
          >
            <Text modifiers={[font({ textStyle: "headline" }), fixedSize({ vertical: true })]}>
              {t(row.titleKey, { count: FREE_ACTIVE_SLOTS })}
            </Text>
            <Text
              modifiers={[
                font({ textStyle: "subheadline" }),
                foregroundStyle({ type: "hierarchical", style: "secondary" }),
                fixedSize({ vertical: true }),
              ]}
            >
              {t(row.descriptionKey)}
            </Text>
            {accessories[row.id]}
          </VStack>
        </HStack>
      ))}
    </VStack>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
