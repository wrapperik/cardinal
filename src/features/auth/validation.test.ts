import { describe, expect, it } from "vitest";

import { validateSignIn, validateSignUp } from "./validation";

describe("validateSignUp", () => {
  it("rejects blank fields", () => {
    expect(validateSignUp({ name: "  ", email: " ", password: "" })).toEqual({
      name: "Enter your name.",
      email: "Enter your email.",
      password: "Enter a password.",
    });
  });

  it("rejects malformed email and short password", () => {
    expect(
      validateSignUp({
        name: "Rikus",
        email: "not-an-email",
        password: "12345",
      }),
    ).toEqual({
      email: "Enter a valid email.",
      password: "Use at least 6 characters.",
    });
  });

  it("accepts trimmed valid values", () => {
    expect(
      validateSignUp({
        name: " Rikus ",
        email: " rikus@example.com ",
        password: "123456",
      }),
    ).toEqual({});
  });
});

describe("validateSignIn", () => {
  it("requires a valid email and password", () => {
    expect(validateSignIn({ email: "bad", password: "" })).toEqual({
      email: "Enter a valid email.",
      password: "Enter your password.",
    });
  });

  it("accepts valid credentials", () => {
    expect(
      validateSignIn({ email: "student@example.com", password: "secret" }),
    ).toEqual({});
  });
});
