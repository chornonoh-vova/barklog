import { Platform } from "react-native";

import { glassButtonStyle } from "./glass";

/** Split from `glass.ts` so that module stays free of `react-native`. */
const IOS_MAJOR = Number.parseInt(String(Platform.Version), 10);

export const GLASS_STYLE = glassButtonStyle(IOS_MAJOR, false);
export const GLASS_PROMINENT_STYLE = glassButtonStyle(IOS_MAJOR, true);
