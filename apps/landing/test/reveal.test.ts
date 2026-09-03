// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest";

/**
 * The regression this file exists for: a build that once hid every
 * [data-reveal] element in CSS, unconditionally, and relied on this script
 * to clear it. If the script never ran — blocked, erroring, slow network —
 * most of the page stayed invisible forever. The fix moved hiding entirely
 * into this script, and only for elements that are off-screen when it runs.
 * These tests assert that behaviour directly: what actually gets hidden,
 * what stays untouched, and that reduced motion never touches anything.
 */

vi.mock("motion", () => ({
  // A stand-in for the real animation, not a test of Motion itself: it
  // applies the same end state synchronously so the assertions below can
  // observe what reveal.ts intended to happen.
  animate: vi.fn((target: HTMLElement) => {
    target.style.opacity = "1";
    target.style.transform = "translateY(0)";
  }),
}));

let observed: HTMLElement[] = [];
let unobserved: HTMLElement[] = [];
let intersectionCallback: IntersectionObserverCallback | undefined;

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }

  observe(target: Element): void {
    observed.push(target as HTMLElement);
  }

  unobserve(target: Element): void {
    unobserved.push(target as HTMLElement);
  }
}

function placeElement(top: number): HTMLElement {
  const el = document.createElement("section");
  el.dataset.reveal = "";
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + 100,
    left: 0,
    right: 0,
    width: 0,
    height: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  document.body.append(el);

  return el;
}

function stubReducedMotion(matches: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = "";
  observed = [];
  unobserved = [];
  intersectionCallback = undefined;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

test("reduced motion is a true no-op: nothing is hidden, nothing is observed", async () => {
  stubReducedMotion(true);
  const inView = placeElement(100);
  const offscreen = placeElement(window.innerHeight + 500);

  await import("../src/scripts/reveal.ts");

  expect(inView.style.opacity).toBe("");
  expect(offscreen.style.opacity).toBe("");
  expect(observed).toHaveLength(0);
});

test("only off-screen sections are hidden; sections already in view are left alone", async () => {
  stubReducedMotion(false);
  const inView = placeElement(100);
  const offscreen = placeElement(window.innerHeight + 500);

  await import("../src/scripts/reveal.ts");

  expect(inView.style.opacity).toBe("");
  expect(offscreen.style.opacity).toBe("0");
  expect(observed).toEqual([offscreen]);
});

test("a revealed section fires once, unobserves, and only touches opacity and transform", async () => {
  stubReducedMotion(false);
  const offscreen = placeElement(window.innerHeight + 500);

  await import("../src/scripts/reveal.ts");

  intersectionCallback?.(
    [{ isIntersecting: true, target: offscreen } as unknown as IntersectionObserverEntry],
    new FakeIntersectionObserver(() => {}) as unknown as IntersectionObserver,
  );

  expect(unobserved).toEqual([offscreen]);
  expect(offscreen.style.opacity).toBe("1");
  expect(offscreen.style.transform).toBe("translateY(0)");
  // Nothing beyond opacity/transform was written to the element.
  expect(offscreen.getAttribute("style")).toBe("opacity: 1; transform: translateY(0);");
});
