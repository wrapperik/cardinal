import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "@cardinal/onboarding-complete";

export async function getOnboardingComplete(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_KEY)) === "true";
}

export async function setOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, "true");
}
