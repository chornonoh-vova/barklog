import { UserButton } from "@clerk/expo/native";
import { Stack } from "expo-router";

/**
 * The avatar in the top-right of every tab root, as Apple Music has it.
 *
 * `Stack.Toolbar.View` is the only slot that accepts an arbitrary React
 * component, and it must sit inside a `Stack.Toolbar` carrying the placement;
 * `Stack.Toolbar.Button` takes an SF Symbol name and so cannot host this.
 * `StackToolbarViewProps` has no `asChild` and no `placement` of its own —
 * `asChild` belongs to `Stack.Toolbar`, and is not needed here.
 *
 * `placement="right"` forces `headerShown: true`, which is what makes the large
 * title appear alongside it.
 *
 * `UserButton` opens Clerk's `UserProfileView` natively on tap — there is no
 * `onPress`, no modal state and no route to add.
 *
 * Deliberately not rendered on pushed screens: those get a back button and an
 * inline title, which is what every Apple app does.
 */
export function ProfileToolbar() {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.View>
        <UserButton />
      </Stack.Toolbar.View>
    </Stack.Toolbar>
  );
}
