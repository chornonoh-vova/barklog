import { UserProfileView } from "@clerk/expo/native-components";
import { Stack, useRouter } from "expo-router";

export default function AccountRoute() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <UserProfileView style={{ flex: 1 }} isDismissible={false} onHostBack={() => router.back()} />
    </>
  );
}
