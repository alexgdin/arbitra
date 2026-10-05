/**
 * Light entrance animation for dashboard sections and cards (tw-animate-css). It only runs when
 * the user has not asked for reduced motion; otherwise the content is shown instantly. The
 * delayed variants keep the start state during the delay only (`fill-mode-backwards`), so no
 * transform is left on the element once the animation ends. Duration and delay
 * only touch the animation, so hover and focus transitions keep their own timing.
 */
export const ENTER =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:animation-duration-500 motion-safe:fill-mode-backwards";

export const ENTER_DELAY = {
  short: "motion-safe:[--tw-animation-delay:100ms]",
  medium: "motion-safe:[--tw-animation-delay:200ms]",
  long: "motion-safe:[--tw-animation-delay:300ms]",
} as const;
