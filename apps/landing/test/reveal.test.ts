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
let rootMargin: string | undefined;

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    intersectionCallback = callback;
    rootMargin = options?.rootMargin;
  }

  observe(target: Element): void {
    observed.push(target as HTMLElement);
  }

  unobserve(target: Element): void {
    unobserved.push(target as HTMLElement);
  }
}

function placeElement(top: number, height = 100): HTMLElement {
  const el = document.createElement("section");
  el.dataset.reveal = "";
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
    height,
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

/** jsdom's default, which the other tests are written against. */
const JSDOM_VIEWPORT = 768;

function setViewportHeight(height: number): void {
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

/**
 * The geometry the browser would apply, done by hand because the observer here
 * is a stub that does none. Returns whether an element of `elementHeight`
 * sitting at the very bottom of the document intersects the root once
 * `rootMargin`'s bottom component has shrunk it.
 *
 * At maximum scroll the last element's top rests at `viewport - elementHeight`
 * and can get no higher, so it intersects only while the shrunken bottom edge
 * stays below that.
 */
function revealsAtMaximumScroll(margin: string, viewport: number, elementHeight: number): boolean {
  const bottom = margin.trim().split(/\s+/)[2] ?? "0px";
  const value = Number.parseFloat(bottom);
  const offset = bottom.endsWith("%") ? (viewport * value) / 100 : value;

  return viewport - elementHeight < viewport + offset;
}

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = "";
  observed = [];
  unobserved = [];
  intersectionCallback = undefined;
  rootMargin = undefined;
  setViewportHeight(JSDOM_VIEWPORT);
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

/**
 * The second time this page has gone invisible, and the reason the assertion
 * below is written against geometry rather than against a literal string: the
 * first was CSS that hid every [data-reveal] unconditionally, the second a
 * percentage rootMargin. Both failed only past some viewport height, which is
 * why neither showed up on the machine that shipped it.
 */
test("the last element on the page still reveals on a very tall viewport", async () => {
  stubReducedMotion(false);
  // A portrait 1080x1920 monitor, or a 4K panel at 100%.
  const VIEWPORT = 1920;
  // The real footer, which is 150-175px however tall the viewport gets.
  const FOOTER_HEIGHT = 160;

  setViewportHeight(VIEWPORT);
  const footer = placeElement(VIEWPORT + 400, FOOTER_HEIGHT);

  await import("../src/scripts/reveal.ts");

  expect(observed).toEqual([footer]);
  expect(footer.style.opacity).toBe("0");

  expect(
    revealsAtMaximumScroll(rootMargin ?? "", VIEWPORT, FOOTER_HEIGHT),
    `rootMargin ${JSON.stringify(rootMargin)} leaves a ${FOOTER_HEIGHT}px element that ` +
      `reaches the bottom of a ${VIEWPORT}px viewport permanently unintersected, and so ` +
      `permanently at opacity 0. A percentage rootMargin scales with the viewport while an ` +
      `element's height does not, so -10% stops matching the footer once the viewport passes ` +
      `ten times its height. Use a constant smaller than the shortest revealed element.`,
  ).toBe(true);

  // And having intersected, it is actually revealed.
  intersectionCallback?.(
    [{ isIntersecting: true, target: footer } as unknown as IntersectionObserverEntry],
    new FakeIntersectionObserver(() => {}) as unknown as IntersectionObserver,
  );

  expect(footer.style.opacity).toBe("1");
});
