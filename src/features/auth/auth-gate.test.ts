import { describe, expect, it } from "vitest";

import { getAuthDestination } from "./routing";

describe("getAuthDestination", () => {
  it("waits until onboarding state is known", () => {
    expect(
      getAuthDestination({ pathname: "/", onboarded: null, signedIn: false }),
    ).toBeNull();
  });

  it("keeps a first-time signed-out user in onboarding", () => {
    expect(
      getAuthDestination({ pathname: "/", onboarded: false, signedIn: false }),
    ).toBeNull();
    expect(
      getAuthDestination({
        pathname: "/home",
        onboarded: false,
        signedIn: false,
      }),
    ).toBe("/");
  });

  it("allows direct access to either auth screen before onboarding is stored", () => {
    expect(
      getAuthDestination({
        pathname: "/sign-in",
        onboarded: false,
        signedIn: false,
      }),
    ).toBeNull();
  });

  it("sends an onboarded signed-out user to sign in", () => {
    expect(
      getAuthDestination({ pathname: "/", onboarded: true, signedIn: false }),
    ).toBe("/sign-in");
  });

  it("pulls a signed-out user off protected screens", () => {
    // Sign-out happens in the settings panel on /home, so this is the path that
    // makes the swipe do something visible.
    expect(
      getAuthDestination({ pathname: "/home", onboarded: true, signedIn: false }),
    ).toBe("/sign-in");
    expect(
      getAuthDestination({ pathname: "/quiz", onboarded: true, signedIn: false }),
    ).toBe("/sign-in");
  });

  it("allows signed-out users to move between auth screens", () => {
    expect(
      getAuthDestination({
        pathname: "/sign-up",
        onboarded: true,
        signedIn: false,
      }),
    ).toBeNull();
  });

  it("sends authenticated users away from public entry screens", () => {
    expect(
      getAuthDestination({
        pathname: "/sign-in",
        onboarded: true,
        signedIn: true,
      }),
    ).toBe("/home");
  });

  it("leaves authenticated users on protected screens", () => {
    expect(
      getAuthDestination({
        pathname: "/quiz",
        onboarded: true,
        signedIn: true,
      }),
    ).toBeNull();
  });
});
