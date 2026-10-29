import { Platform } from "react-native";

/** The running iOS major version, for the iOS 18/26 splits in SwiftUI views. */
export const IOS_MAJOR = Number.parseInt(String(Platform.Version), 10);
