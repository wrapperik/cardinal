import AsyncStorage from "@react-native-async-storage/async-storage";

const UX_CHOICE_KEY = "@cardinal/ux-choice-pending";

/**
 * Local-only, like the onboarding flag: set by sign-up, so the "how should
 * Cardinal feel?" screen is shown exactly once, to brand-new accounts. Existing
 * users who sign in never see it — their preference defaults to legacy and is
 * changed from Settings.
 */
export async function getUxChoicePending(): Promise<boolean> {
  return (await AsyncStorage.getItem(UX_CHOICE_KEY)) === "true";
}

export async function setUxChoicePending(): Promise<void> {
  await AsyncStorage.setItem(UX_CHOICE_KEY, "true");
}

export async function clearUxChoicePending(): Promise<void> {
  await AsyncStorage.removeItem(UX_CHOICE_KEY);
}
