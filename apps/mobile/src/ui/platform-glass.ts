import { Platform } from "react-native";

import { glassButtonStyle } from "./glass";

/**
 * Resolved once at module load: the OS version cannot change while the app is
 * running. Kept apart from `glass.ts` because importing `react-native` would
 * make that module untestable in Node.
 */
const IOS_MAJOR = Number.parseInt(String(Platform.Version), 10);

export const GLASS_STYLE = glassButtonStyle(IOS_MAJOR, false);
export const GLASS_PROMINENT_STYLE = glassButtonStyle(IOS_MAJOR, true);
