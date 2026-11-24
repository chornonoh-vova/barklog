import { UserProfileView } from "@clerk/expo/native-components";

/**
 * A modal from `_layout.tsx`: full screen on a narrow window, a page sheet on a
 * wide one. Clerk draws its own navigation, including the dismiss button.
 *
 * No `onDismiss` navigation: Clerk's dismiss button calls UIKit `dismiss` on
 * its hosting controller, which closes this presented modal natively, and the
 * stack pops the route from that. A `router.back()` on top would pop a second
 * time, reach the tab navigator and land on its first tab, Home.
 */
export default function AccountRoute() {
  return <UserProfileView style={{ flex: 1 }} isDismissible />;
}
