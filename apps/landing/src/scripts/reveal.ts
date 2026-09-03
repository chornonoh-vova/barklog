import { animate } from "motion";

const DISTANCE = 16;
const DURATION = 0.24;

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");

if (reduced) {
  // Clear the pre-animation state rather than returning early: the CSS hides
  // these until revealed, so bailing out would leave the page blank for
  // exactly the people who asked for less motion.
  for (const target of targets) target.style.opacity = "1";
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        // Once. Re-animating on scroll-up reads as a glitch, not as polish.
        observer.unobserve(entry.target);
        void animate(
          entry.target,
          { opacity: [0, 1], transform: [`translateY(${DISTANCE}px)`, "translateY(0)"] },
          // `ease`, not `easing` — this build of `motion` renamed the option
          // after the brief's sample code was written; `easing` type-checks
          // as an unknown key and silently does nothing.
          { duration: DURATION, ease: [0.22, 1, 0.36, 1] },
        );
      }
    },
    { rootMargin: "0px 0px -10% 0px" },
  );

  for (const target of targets) observer.observe(target);
}
