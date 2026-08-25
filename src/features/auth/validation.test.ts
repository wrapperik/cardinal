import { describe, expect, it } from "vitest";

import { validateNameChange, validatePasswordChange, validateSignIn, validateSignUp } from "./validation";

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

describe("account settings validation", () => {
  it("does not allow an empty replacement name", () => {
    expect(validateNameChange("  ")).toEqual({ name: "Enter your name." });
    expect(validateNameChange(" Rikus ")).toEqual({});
  });

  it("requires the current password and a new password of at least six characters", () => {
    expect(validatePasswordChange({ currentPassword: "", nextPassword: "123" })).toEqual({
      currentPassword: "Enter your current password.",
      nextPassword: "Use at least 6 characters.",
    });
  });
});
