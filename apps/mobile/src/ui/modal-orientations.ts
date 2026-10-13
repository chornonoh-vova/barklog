import type { ModalProps } from "react-native";

/**
 * For every React Native `Modal`. On iOS a `Modal` allows only `portrait`
 * unless told otherwise, so with the app itself free to rotate, a full-screen
 * modal stays upright while the window behind it turns. Info.plist still
 * trims this per device (no upside-down on Face ID iPhones).
 */
export const MODAL_ORIENTATIONS: ModalProps["supportedOrientations"] = [
  "portrait",
  "portrait-upside-down",
  "landscape-left",
  "landscape-right",
];
