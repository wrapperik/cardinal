export interface SignInValues {
  email: string;
  password: string;
}

export interface SignUpValues extends SignInValues {
  name: string;
}

export type AuthFieldErrors = Partial<Record<keyof SignUpValues, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials({ email, password }: SignInValues): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  const normalizedEmail = email.trim();

  if (!normalizedEmail) errors.email = "Enter your email.";
  else if (!EMAIL_PATTERN.test(normalizedEmail)) {
    errors.email = "Enter a valid email.";
  }

  if (!password) errors.password = "Enter your password.";
  return errors;
}

export function validateSignIn(values: SignInValues): AuthFieldErrors {
  return validateCredentials(values);
}

export function validateSignUp(values: SignUpValues): AuthFieldErrors {
  const errors = validateCredentials(values);

  if (!values.name.trim()) errors.name = "Enter your name.";
  if (!values.password) errors.password = "Enter a password.";
  else if (values.password.length < 6) {
    errors.password = "Use at least 6 characters.";
  }

  return errors;
}
