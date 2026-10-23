import { useSideInsets } from "@/ui/use-side-insets";

/** The gutter between a shelf's content and the screen edge or safe area. */
const GUTTER = 16;

/**
 * Padding for a horizontal shelf's title and scroll content. The shelf itself
 * spans the full width, so its items scroll under the Dynamic Island in
 * landscape and under iPhone Duo's tab sidebar, whose glass then has something
 * to show; at rest, the first and last items still sit clear of both.
 */
export function useShelfInset() {
  const { paddingLeft, paddingRight } = useSideInsets();

  return { paddingLeft: GUTTER + paddingLeft, paddingRight: GUTTER + paddingRight };
}
