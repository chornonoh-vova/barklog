import type * as SessionModule from "@/features/review/session";

type Session = typeof SessionModule;

const freshSession = (): Session => {
  let session!: Session;
  jest.isolateModules(() => {
    session = jest.requireActual<Session>("@/features/review/session");
  });
  return session;
};

test("a fresh launch has not seen the paywall", () => {
  expect(freshSession().hasSeenPaywallThisSession()).toBe(false);
});

test("seeing the paywall sticks for the rest of the session", () => {
  const session = freshSession();

  session.markPaywallSeen();

  expect(session.hasSeenPaywallThisSession()).toBe(true);
  expect(session.hasSeenPaywallThisSession()).toBe(true);
});

test("a new process starts clean again", () => {
  freshSession().markPaywallSeen();

  expect(freshSession().hasSeenPaywallThisSession()).toBe(false);
});
