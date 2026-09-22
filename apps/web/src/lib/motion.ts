import { useReducedMotion } from "framer-motion";
import type { Transition, Variants } from "framer-motion";

// Shared motion "feel" for the whole app — every animation should draw its
// transition from one of these two constants rather than inventing new
// stiffness/duration numbers per file, so a snappy interaction (button
// press, card lift) always feels the same everywhere, and a content
// entrance always feels the same everywhere. Values match what
// HeroBanner.tsx and SeatMapGrid.tsx already shipped and got approved on.
export const SPRING: Transition = { type: "spring", stiffness: 500, damping: 25 };
export const ENTRANCE: Transition = { duration: 0.35, ease: "easeOut" };

// Re-exported so other files import a single hook rather than each calling
// `useReducedMotion` from "framer-motion" directly — keeps the "how do we
// check for reduced motion" decision in one place. Today it's a thin
// wrapper, but it means a future change (e.g. also respecting a manual
// in-app "reduce motion" setting) only has to happen here.
export function usePrefersReducedMotion(): boolean {
  return !!useReducedMotion();
}

// Content-entrance variant: fade up a short, subtle distance. Used both for
// on-mount reveals (HeroBanner-style) and for `whileInView` scroll reveals
// (section headings, card grids) — the same visual language either way.
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: ENTRANCE },
};

// A smaller-offset sibling for section headings — the spec asks for a
// subtler 8-16px move on already-static pages, not the same distance a
// hero headline travels.
export const fadeInUpSmall: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: ENTRANCE },
};

// Wrap a list/grid of children in this (as the `motion` parent's
// `variants`, with `initial="hidden"` `animate`/`whileInView="visible"`) to
// have each child (using `fadeInUp` itself as its own variants) reveal in a
// staggered sequence rather than all at once.
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.03 },
  },
};

// Spread onto any `motion.*` element to get the same tasteful hover-lift +
// tap-press feedback used by hoverable cards across the site. `boxShadow`
// is intentionally left out of the typed transition — MUI's own shadow
// token strings animate fine under Framer's default tween — so cards keep
// using their own shadow value on hover; this only owns the lift + spring.
export const cardHover = {
  whileHover: { y: -6 },
  whileTap: { scale: 0.98 },
  transition: SPRING,
};

// Primary CTA press feedback — a small scale, not a lift (buttons don't
// want to jump off the page, just feel responsive to the touch).
export const ctaTap = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.97 },
  transition: SPRING,
};

// Standard props for a `motion.div` (or `Box component={motion.div}`) that
// should fade up once as it scrolls into view, honoring reduced-motion by
// simply rendering in its final state with no animation at all.
export function viewportFadeInProps(prefersReducedMotion: boolean, variants: Variants = fadeInUp) {
  if (prefersReducedMotion) {
    return { initial: false as const };
  }
  return {
    initial: "hidden" as const,
    whileInView: "visible" as const,
    viewport: { once: true, amount: 0.2 },
    variants,
  };
}

// Same idea for `cardHover`, but also disabling the hover/tap feedback
// under reduced motion (a subtle lift is still "motion" — the honest thing
// is to turn it off, not just the big stuff).
export function cardHoverProps(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) return {};
  return cardHover;
}

export function ctaTapProps(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) return {};
  return ctaTap;
}
