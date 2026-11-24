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
import { useState, type ReactNode } from "react";
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

/** The button and the feature rows: full width on iPhone, capped on iPad. */
const CONTENT_MAX_WIDTH = 420;
const PAGE_DOTS_CLEARANCE = 48;

const PAGES: Record<OnboardingStep, () => ReactNode> = {
  welcome: WelcomeStep,
  widgets: WidgetsStep,
  free: FreeStep,
};
const SECONDARY = foregroundStyle({ type: "hierarchical", style: "secondary" });

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const { t } = useTranslation();

  const next = nextStep(step);

  const advance = () => (next ? setStep(next) : onComplete());

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
          {ONBOARDING_STEPS.map((value) => {
            const Page = PAGES[value];

            return (
              <TabView.Tab key={value} value={value}>
                {/* Scrolls so a tall page (small screen, landscape, large text)
                  never pushes the button and link off-screen. */}
                <ScrollView>
                  {/* The page dots float over the bottom of each page. */}
                  <VStack modifiers={[padding({ bottom: PAGE_DOTS_CLEARANCE })]}>
                    <Page />
                  </VStack>
                </ScrollView>
              </TabView.Tab>
            );
          })}
        </TabView>

        <VStack spacing={16} modifiers={[padding({ horizontal: 24 })]}>
          {/* Frame on the label: on the button it widens only the hit area. */}
          <Button
            onPress={advance}
            modifiers={[buttonStyle(GLASS_PROMINENT_STYLE), controlSize("large")]}
          >
            <Text modifiers={[frame({ maxWidth: CONTENT_MAX_WIDTH })]}>
              {next ? t("onboarding.continue") : t("onboarding.getStarted")}
            </Text>
          </Button>
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
    <StepBody top={24}>
      <RNHostView matchContents>
        <CoverHero covers={ONBOARDING_COVERS} />
      </RNHostView>
      <Heading title={t("onboarding.welcomeTitle")} subtitle={t("onboarding.welcomeSubtitle")} />
      <Rows rows={WELCOME_ROWS} />
    </StepBody>
  );
}

function WidgetsStep() {
  const { t } = useTranslation();

  return (
    <StepBody top={48}>
      <Heading title={t("onboarding.widgetsTitle")} subtitle={t("onboarding.widgetsSubtitle")} />
      <RNHostView matchContents>
        <WidgetMock covers={ONBOARDING_COVERS} />
      </RNHostView>
      <Text
        modifiers={[
          font({ textStyle: "footnote" }),
          SECONDARY,
          multilineTextAlignment("center"),
          fixedSize({ vertical: true }),
        ]}
      >
        {t("onboarding.widgetsHint")}
      </Text>
    </StepBody>
  );
}

function FreeStep() {
  const { t } = useTranslation();

  return (
    <StepBody top={32}>
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
    </StepBody>
  );
}

function StepBody({ top, children }: { top: number; children: ReactNode }) {
  return (
    <VStack spacing={20} modifiers={[padding({ horizontal: 32, top })]}>
      {children}
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
          SECONDARY,
          multilineTextAlignment("center"),
          fixedSize({ vertical: true }),
        ]}
      >
        {subtitle}
      </Text>
    </VStack>
  );
}

function Rows({
  rows,
  accessories = {},
}: {
  rows: readonly FeatureRow[];
  accessories?: Record<string, ReactNode>;
}) {
  const { t } = useTranslation();

  return (
    <VStack alignment="leading" spacing={16} modifiers={[frame({ maxWidth: CONTENT_MAX_WIDTH })]}>
      {rows.map((row) => (
        <HStack key={row.id} alignment="top" spacing={14}>
          <Image
            systemName={row.systemImage}
            size={24}
            modifiers={[
              foregroundStyle(Brand.tint),
              frame({ width: 32 }),
              accessibilityHidden(true),
            ]}
          />
          <VStack
            alignment="leading"
            spacing={2}
            modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}
          >
            <Text modifiers={[font({ textStyle: "headline" }), fixedSize({ vertical: true })]}>
              {t(row.titleKey, { count: FREE_ACTIVE_SLOTS })}
            </Text>
            <Text
              modifiers={[
                font({ textStyle: "subheadline" }),
                SECONDARY,
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
