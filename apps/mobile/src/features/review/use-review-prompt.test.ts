import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, waitFor } from "@testing-library/react-native";
import * as StoreReview from "expo-store-review";

import * as session from "@/features/review/session";
import { COMPLETIONS_BEFORE_REVIEW } from "@/features/review/should-request-review";
import { useReviewPrompt } from "@/features/review/use-review-prompt";
import { backlogItem, backlogList } from "@test/fixtures";
import { fakeEndpoints, renderHookWithProviders } from "@test/render";

const KEY = "barklog.review.asked";

const completed = (count: number) =>
  backlogList(...Array.from({ length: count }, (_, i) => backlogItem(i + 1, "completed")));

function renderPrompt(backlog = completed(COMPLETIONS_BEFORE_REVIEW)) {
  const api = fakeEndpoints({ listBacklog: async () => backlog });
  return renderHookWithProviders(() => useReviewPrompt(), { api });
}

/** Lets the hook's chain of awaited reads settle before asserting a non-event. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("useReviewPrompt", () => {
  it("asks for a review once enough games are completed, flag first", async () => {
    await renderPrompt();

    await waitFor(() => expect(StoreReview.requestReview).toHaveBeenCalledTimes(1));
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEY, "1");
  });

  it("stays quiet below the threshold", async () => {
    await renderPrompt(
      backlogList(
        ...Array.from({ length: COMPLETIONS_BEFORE_REVIEW - 1 }, (_, i) =>
          backlogItem(i + 1, "completed"),
        ),
        backlogItem(99, "playing"),
      ),
    );

    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(KEY));
    await settle();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
  });

  it("never asks twice across launches", async () => {
    await AsyncStorage.setItem(KEY, "1");
    await renderPrompt();

    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(KEY));
    await settle();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
  });

  it("asks at most once while the backlog keeps changing", async () => {
    const { queryClient } = await renderPrompt();
    await waitFor(() => expect(StoreReview.requestReview).toHaveBeenCalledTimes(1));

    await act(async () => {
      queryClient.setQueryData(["backlog", "list"], completed(COMPLETIONS_BEFORE_REVIEW + 1));
      await queryClient.invalidateQueries();
    });
    await settle();

    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it("never asks in a session that showed the paywall", async () => {
    jest.spyOn(session, "hasSeenPaywallThisSession").mockReturnValue(true);
    await renderPrompt();

    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith(KEY));
    await settle();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(KEY, "1");
  });

  it("does not ask, or spend the flag, when the store cannot show the sheet", async () => {
    jest.mocked(StoreReview.hasAction).mockResolvedValue(false);
    await renderPrompt();

    await waitFor(() => expect(StoreReview.hasAction).toHaveBeenCalled());
    await settle();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(KEY, "1");
  });

  it("does not ask when the screen goes while the flag is still being read", async () => {
    const reads: ((value: string | null) => void)[] = [];
    const pendingRead = () =>
      new Promise<string | null>((resolve) => {
        reads.push(resolve);
      });
    // `Once`, twice: AsyncStorage's mock is a shared `jest.fn`, so a lasting
    // implementation would leave later tests' reads pending forever.
    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementationOnce(pendingRead)
      .mockImplementationOnce(pendingRead);
    const { unmount } = await renderPrompt();
    // One read before the backlog loads, one once the completions are known.
    await waitFor(() => expect(reads).toHaveLength(2));

    await unmount();
    for (const finish of reads) finish(null);
    await settle();

    expect(StoreReview.hasAction).not.toHaveBeenCalled();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
  });

  it("does not ask when the screen goes while the store is being checked", async () => {
    let answer!: (value: boolean) => void;
    jest.mocked(StoreReview.hasAction).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const { unmount } = await renderPrompt();
    await waitFor(() => expect(StoreReview.hasAction).toHaveBeenCalled());

    await unmount();
    await act(async () => answer(true));
    await settle();

    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(KEY, "1");
  });

  it("asks once when the count changes while the store is being checked", async () => {
    const answers: ((value: boolean) => void)[] = [];
    jest.mocked(StoreReview.hasAction).mockImplementation(
      () =>
        new Promise((resolve) => {
          answers.push(resolve);
        }),
    );
    const { queryClient } = await renderPrompt();
    await waitFor(() => expect(answers).toHaveLength(1));

    // A completion lands mid-check: the effect re-runs for the new count.
    await act(async () => {
      queryClient.setQueryData(["backlog", "list"], completed(COMPLETIONS_BEFORE_REVIEW + 1));
    });
    await waitFor(() => expect(answers).toHaveLength(2));

    await act(async () => {
      for (const answer of answers) answer(true);
    });
    await settle();

    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  });
});
