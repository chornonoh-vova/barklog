import * as StoreReview from "expo-store-review";

import { appStoreReviewUrl } from "./rate-app";

describe("appStoreReviewUrl", () => {
  it("opens the store page from app.json on the review composer", () => {
    expect(appStoreReviewUrl()).toBe(
      "https://apps.apple.com/app/barklog/id6807319879?action=write-review",
    );
  });

  it("keeps a query the store URL already has", () => {
    jest.mocked(StoreReview.storeUrl).mockReturnValue("https://apps.apple.com/app/id1?l=de");

    expect(appStoreReviewUrl()).toBe("https://apps.apple.com/app/id1?l=de&action=write-review");
  });

  it("is null for a build without a store URL", () => {
    jest.mocked(StoreReview.storeUrl).mockReturnValue(null);

    expect(appStoreReviewUrl()).toBeNull();
  });
});
