import { animate } from "motion";

const DISTANCE = 16;
const DURATION = 0.24;
const BOTTOM_MARGIN = 64;

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A true no-op: nothing in this file pre-hides anything in CSS, so a
// reduced-motion visitor — or a visitor whose script never loads at all —
// sees the page exactly as the browser rendered it. There is nothing to
// correct here, so there is nothing to do.
if (!reduced) {
  const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        // Once. Re-animating on scroll-up reads as a glitch, not as polish.
        observer.unobserve(entry.target);
        void animate(
          entry.target,
          { opacity: [0, 1], transform: [`translateY(${DISTANCE}px)`, "translateY(0)"] },
          { duration: DURATION, ease: [0.22, 1, 0.36, 1] },
        );
      }
    },
    // A constant, never a percentage. A percentage rootMargin resolves against
    // the viewport's height, but the elements it gates do not grow with it: the
    // last element on the page can only ever reach `viewportHeight - its own
    // height`, so a -10% bottom margin left the ~160px footer permanently
    // unintersected — and so permanently at opacity 0, taking the only links to
    // /terms and /privacy with it — on any viewport past ~1600px tall. 64px is
    // below the height of the shortest thing carrying [data-reveal], so every
    // one of them still clears the shrunken edge at maximum scroll.
    { rootMargin: `0px 0px -${BOTTOM_MARGIN}px 0px` },
  );

  for (const target of targets) {
    // Only elements the visitor cannot see yet are hidden, and only from
    // here — never from CSS. A deferred module runs after parse, so hiding
    // an already-visible section would flash it out and back in; hiding one
    // that's already off-screen is imperceptible. And because nothing but
    // this loop ever sets opacity to 0, a script that never runs (blocked,
    // erroring, slow network) leaves every section visible, not hidden.
    const rect = target.getBoundingClientRect();
    const isOffscreen = rect.top >= window.innerHeight || rect.bottom <= 0;

    if (!isOffscreen) continue;

    target.style.opacity = "0";
    observer.observe(target);
  }
}
