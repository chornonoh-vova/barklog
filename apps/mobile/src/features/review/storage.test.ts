import AsyncStorage from "@react-native-async-storage/async-storage";

import { markAskedForReview, readHasAskedForReview } from "@/features/review/storage";

test("has not asked on a fresh install", async () => {
  await expect(readHasAskedForReview()).resolves.toBe(false);
});

test("remembers having asked", async () => {
  await markAskedForReview();

  await expect(readHasAskedForReview()).resolves.toBe(true);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith("barklog.review.asked", "1");
});

test("treats an unreadable flag as asked, so a storage error never spends a prompt", async () => {
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("disk"));

  await expect(readHasAskedForReview()).resolves.toBe(true);
});

test("swallows a failed write", async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("disk"));

  await expect(markAskedForReview()).resolves.toBeUndefined();
});
