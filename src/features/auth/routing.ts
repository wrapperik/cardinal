export interface AuthRouteState {
  pathname: string;
  onboarded: boolean | null;
  signedIn: boolean;
}

const AUTH_ROUTES = new Set(["/sign-in", "/sign-up"]);
const PUBLIC_ENTRY_ROUTES = new Set(["/", ...AUTH_ROUTES]);
type AuthDestination = "/" | "/home" | "/sign-in";

export function getAuthDestination({
  pathname,
  onboarded,
  signedIn,
}: AuthRouteState): AuthDestination | null {
  if (onboarded === null) return null;

  if (signedIn) {
    return PUBLIC_ENTRY_ROUTES.has(pathname) ? "/home" : null;
  }

  if (!onboarded) {
    // The app still starts at onboarding, but explicit auth links remain usable.
    return pathname === "/" || AUTH_ROUTES.has(pathname) ? null : "/";
  }

  return pathname === "/" ? "/sign-in" : null;
}
