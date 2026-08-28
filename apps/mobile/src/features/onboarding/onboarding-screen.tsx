import { Button, Host, HStack, Image, Label, Link, Spacer, TabView, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  buttonStyle,
  controlSize,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  hidden,
  multilineTextAlignment,
  padding,
  tabViewStyle,
} from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { siteUrl } from "@/igdb-url";
import { Brand } from "@/theme";
import { GLASS_PROMINENT_STYLE } from "@/ui/platform-glass";

import { IGDB_PAGE_ID, nextPageId, ONBOARDING_PAGES } from "./pages";

/**
 * A SwiftUI `TabView` in page style, so the swipe gesture and the dot indicators
 * are UIKit's rather than ours. `selection` is controlled because the bottom
 * button both advances the pager and changes its own label on the last page.
 *
 * Presentation only. `onComplete` covers Skip and the final button alike; the
 * gate above decides what completing means.
 */
export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [selection, setSelection] = useState<string>(ONBOARDING_PAGES[0].id);

  // `nextPageId` returning `undefined` is the whole signal for "last page":
  // no next page means this one completes rather than advances.
  const next = nextPageId(selection);
  const isLast = next === undefined;

  const advance = () => {
    if (next) setSelection(next);
    else onComplete();
  };

  return (
    <Host style={styles.host} seedColor={Brand.tint}>
      <VStack>
        <HStack modifiers={[padding({ horizontal: 16, top: 8 })]}>
          <Spacer />
          {/* `hidden`, not a conditional render: the row keeps its height on the
              last page, so the pages below it do not shift up under the dots. */}
          <Button
            label="Skip"
            onPress={onComplete}
            modifiers={[buttonStyle("plain"), hidden(isLast)]}
          />
        </HStack>

        <TabView
          selection={selection}
          onSelectionChange={setSelection}
          modifiers={[tabViewStyle({ type: "page", indexDisplayMode: "always" })]}
        >
          {ONBOARDING_PAGES.map((page) => (
            <TabView.Tab key={page.id} value={page.id}>
              <VStack spacing={8} modifiers={[padding({ horizontal: 32 })]}>
                <Image
                  systemName={page.systemImage}
                  size={52}
                  modifiers={[
                    foregroundStyle({ type: "hierarchical", style: "secondary" }),
                    padding({ bottom: 4 }),
                    // The symbol restates the title; VoiceOver reads the copy only.
                    accessibilityHidden(true),
                  ]}
                />
                <Text
                  modifiers={[
                    font({ textStyle: "title2", weight: "bold" }),
                    multilineTextAlignment("center"),
                  ]}
                >
                  {page.title}
                </Text>
                <Text
                  modifiers={[
                    font({ textStyle: "body" }),
                    foregroundStyle({ type: "hierarchical", style: "secondary" }),
                    multilineTextAlignment("center"),
                    frame({ maxWidth: 320 }),
                    // Wrap rather than truncate on a short host or large type.
                    fixedSize({ vertical: true }),
                  ]}
                >
                  {page.description}
                </Text>
                {page.id === IGDB_PAGE_ID ? (
                  // SwiftUI `Link` opens the URL itself, so there is no
                  // `openURL` call and no `Pressable` wrapper to get wrong.
                  <Link
                    destination={siteUrl()}
                    modifiers={[font({ textStyle: "subheadline" }), padding({ top: 8 })]}
                  >
                    <Label title="igdb.com" systemImage="arrow.up.right.square" />
                  </Link>
                ) : null}
              </VStack>
            </TabView.Tab>
          ))}
        </TabView>

        <Button
          label={isLast ? "Start" : "Continue"}
          onPress={advance}
          modifiers={[
            buttonStyle(GLASS_PROMINENT_STYLE),
            controlSize("large"),
            padding({ horizontal: 32, bottom: 24 }),
          ]}
        />
      </VStack>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
