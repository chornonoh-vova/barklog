import { Stack, useLocalSearchParams } from "expo-router";

export default function GameRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <Stack.Title>{`Game ${id}`}</Stack.Title>;
}
