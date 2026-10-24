import { type Href, router } from 'expo-router';

/**
 * Go somewhere and forget how you got there: after signing in, after onboarding. `router.replace` only swaps
 * the top screen, so welcome → school → campus … would stay underneath and a swipe back would walk into them.
 */
export function resetTo(href: Href) {
  if (router.canDismiss()) router.dismissAll();
  router.replace(href);
}
