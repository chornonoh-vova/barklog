import { Image, type ImageProps } from "expo-image";

import { useImageTransition } from "@/hooks/use-reduced-motion";

/**
 * Every remote image goes through here so the Reduce Motion gate is structural
 * rather than remembered: `transition` sits after the spread precisely so a
 * call site cannot reintroduce an ungated cross-fade.
 */
export function RemoteImage(props: ImageProps) {
  const transition = useImageTransition();

  return <Image contentFit="cover" cachePolicy="disk" {...props} transition={transition} />;
}
