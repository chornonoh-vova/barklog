import { glassButtonStyle } from "./glass";
import { IOS_MAJOR } from "./ios-version";

/** Split from `glass.ts` so that module stays free of `react-native`. */
export const GLASS_PROMINENT_STYLE = glassButtonStyle(IOS_MAJOR, true);
