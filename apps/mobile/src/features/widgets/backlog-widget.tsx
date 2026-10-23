import {
  HStack,
  Image,
  Link,
  RoundedRectangle,
  Spacer,
  Text,
  VStack,
  ZStack,
} from "@expo/ui/swift-ui";
import {
  aspectRatio,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  layoutPriority,
  lineLimit,
  monospacedDigit,
  padding,
  resizable,
  widgetAccentedRenderingMode,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import type { BacklogStatus } from "@repo/contracts";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { WidgetGame, WidgetSnapshot } from "./snapshot";

type Configuration = { section: BacklogStatus };

/** Runs in the widget's own runtime: the `'widget'` directive turns it into a
 * string, so it sees only `@expo/ui/swift-ui` globals — no imports, no
 * module-scope values, no hooks. */
const BacklogWidgetView = (
  props: WidgetSnapshot,
  environment: WidgetEnvironment<Configuration>,
) => {
  "widget";

  // A large number, not Infinity, which does not survive JSON to native.
  const FILL = 1000;
  const background = containerBackground(
    environment.colorScheme === "dark" ? "#1C1C1E" : "#FFFFFF",
    "widget",
  );
  // `contentMarginsDisabled` in app.json: the system's 16pt left too little
  // room for the covers.
  const root = (alignment: "leading" | "center") => [
    padding({ all: 12 }),
    frame({ maxWidth: FILL, maxHeight: FILL, alignment }),
    background,
  ];
  const secondary = foregroundStyle({ type: "hierarchical", style: "secondary" });
  const accented = environment.widgetRenderingMode === "accented";
  const section = props.sections[environment.configuration?.section ?? "playing"];

  const header = (count?: number) => (
    <HStack spacing={4}>
      <Image
        systemName={section.symbol}
        modifiers={[font({ textStyle: "caption2", weight: "bold" }), secondary]}
      />
      <Text modifiers={[font({ textStyle: "caption2", weight: "bold" }), secondary]}>
        {section.title}
      </Text>
      <Spacer />
      {count === undefined ? null : (
        <Text
          modifiers={[
            font({ textStyle: "caption", weight: "semibold" }),
            secondary,
            monospacedDigit(),
          ]}
        >
          {String(count)}
        </Text>
      )}
    </HStack>
  );

  // Fixed on the shelf, so every cover matches whatever text sits under it;
  // `"fill"` grows to the width cap and shrinks when height runs out. Clipped
  // before framing — a larger frame would leave the corners square.
  const cover = (game: WidgetGame, height: number | "fill") => {
    const fill = height === "fill";
    const shape = [
      aspectRatio({ ratio: 3 / 4, contentMode: fill ? "fit" : "fill" }),
      ...(fill ? [] : [frame({ width: (height * 3) / 4, height })]),
      clipShape("roundedRectangle", 8),
    ];
    // Capped so the title beside it keeps whole words; sized before that title.
    const placement = fill ? [frame({ maxWidth: 84 }), layoutPriority(1)] : [];

    return game.cover === "" ? (
      <ZStack modifiers={[...shape, ...placement]}>
        <RoundedRectangle
          cornerRadius={8}
          modifiers={[foregroundStyle({ type: "hierarchical", style: "quaternary" })]}
        />
        <Image systemName="gamecontroller" modifiers={[secondary]} />
      </ZStack>
    ) : (
      <Image
        uiImage={game.cover}
        modifiers={[
          resizable(),
          ...shape,
          ...(accented ? [widgetAccentedRenderingMode("accentedDesaturated")] : []),
          ...placement,
        ]}
      />
    );
  };

  const title = (game: WidgetGame, lines = 1) => (
    <Text modifiers={[font({ textStyle: "caption", weight: "semibold" }), lineLimit(lines)]}>
      {game.name}
    </Text>
  );

  // Lowest priority: the rating is what gives way when space runs out.
  const rating = (game: WidgetGame) =>
    game.rating === 0 ? null : (
      <Text
        modifiers={[font({ textStyle: "caption2" }), secondary, lineLimit(1), layoutPriority(-1)]}
      >
        {`★ ${game.rating}`}
      </Text>
    );

  const mascotMessage = (message: string) => (
    <VStack spacing={4}>
      {props.mascot === "" ? null : (
        <Image
          uiImage={props.mascot}
          modifiers={[
            resizable(),
            aspectRatio({ ratio: 1, contentMode: "fit" }),
            frame({ maxHeight: 64 }),
          ]}
        />
      )}
      <Text
        modifiers={[font({ textStyle: "caption", weight: "semibold" }), secondary, lineLimit(2)]}
      >
        {message}
      </Text>
    </VStack>
  );

  if (!props.signedIn) {
    return (
      <VStack modifiers={[...root("center"), widgetURL(props.appUrl)]}>
        {mascotMessage(props.message)}
      </VStack>
    );
  }

  if (section.games.length === 0) {
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[...root("leading"), widgetURL(section.url)]}
      >
        {header()}
        <Spacer />
        {mascotMessage(section.empty)}
        <Spacer />
      </VStack>
    );
  }

  if (environment.widgetFamily === "systemSmall") {
    const game = section.games[0]!;

    return (
      <VStack alignment="leading" spacing={6} modifiers={[...root("leading"), widgetURL(game.url)]}>
        {header()}
        <HStack alignment="top" spacing={8}>
          {cover(game, "fill")}
          <VStack
            alignment="leading"
            spacing={6}
            modifiers={[frame({ maxWidth: FILL, alignment: "leading" })]}
          >
            {title(game, 4)}
            {rating(game)}
          </VStack>
        </HStack>
      </VStack>
    );
  }

  // Four equal slots; a shorter shelf leaves trailing slots empty, so it stays
  // left-aligned at the same column width.
  const column = frame({ maxWidth: FILL, alignment: "leading" });

  return (
    <VStack
      alignment="leading"
      spacing={6}
      modifiers={[...root("leading"), widgetURL(section.url)]}
    >
      {header(section.count)}
      <HStack alignment="top" spacing={10}>
        {[0, 1, 2, 3].map((slot) => {
          const game = section.games[slot];

          return game === undefined ? (
            <Spacer key={`empty-${slot}`} modifiers={[column]} />
          ) : (
            <Link key={game.id} destination={game.url} modifiers={[column]}>
              <VStack alignment="leading" spacing={2}>
                {cover(game, 90)}
                {title(game)}
                {rating(game)}
              </VStack>
            </Link>
          );
        })}
      </HStack>
    </VStack>
  );
};

/** Shown before the first push. Inline copy (no i18n yet) and no app imports:
 * this file is also bundled into the widget extension. */
const EMPTY = {
  title: "",
  symbol: "gamecontroller" as const,
  count: 0,
  empty: "",
  url: "barklog://widget/home",
  games: [],
};
const INITIAL: WidgetSnapshot = {
  signedIn: false,
  message: "Open Barklog to see your backlog.",
  appUrl: "barklog://widget/home",
  mascot: "",
  sections: { waiting: EMPTY, playing: EMPTY, completed: EMPTY, abandoned: EMPTY },
};

export default createWidget<WidgetSnapshot, Configuration>(
  "BacklogWidget",
  BacklogWidgetView,
  INITIAL,
);
