import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton } from "@/components/back-button";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { HOLD_BUTTON_SIZE } from "@/components/hold-button";
import { SwipeAction } from "@/components/swipe-action";
import { TypedConfirmationDialog } from "@/components/typed-confirmation-dialog";
import { Colors, Fonts, Motion, Radius, Spacing, Theme } from "@/constants/theme";
import { useIsAdmin } from "@/features/admin/role";
import { useAuth } from "@/features/auth/auth-provider";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { validateNameChange, validatePasswordChange } from "@/features/auth/validation";
import {
  syncStatusLabel,
  updatePreferences,
  usePreferences,
  usePreferencesSyncStatus,
  useTraditionalUx,
} from "@/features/preferences/preferences";

/**
 * Settings, as an ordinary pushed screen. In legacy UX there is nothing to
 * tap: it's reached by holding the gear icon on home's nav bar, and the SIGN
 * OUT row and HAPTICS toggle are both drag-only, matching the no-tap grammar
 * the rest of the app uses. In traditional UX the same controls are plain
 * taps (SwipeAction, HoldButton and ToggleRow each branch on the preference),
 * and the INTERACTION section below is where the person switches between the
 * two.
 */
export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { changePassword, deleteAccount, signOutUser, updateName, user } = useAuth();
  const preferences = usePreferences();
  const syncStatus = usePreferencesSyncStatus();
  const isAdmin = useIsAdmin();
  const traditional = useTraditionalUx();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "STUDENT");

  useEffect(() => setDisplayName(user?.displayName ?? "STUDENT"), [user?.displayName]);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          // Clears the BACK button, exactly like course detail's own clearance.
          paddingTop: insets.top + HOLD_BUTTON_SIZE + Spacing.lg,
          paddingHorizontal: Spacing.lg,
          // Clears the home indicator, so DELETE ACCOUNT is never sitting in
          // the strip iOS reserves for its own gesture.
          paddingBottom: insets.bottom + Spacing.xl,
        }}
      >
        <Text style={styles.heading}>SETTINGS</Text>

        <Text style={styles.firstSectionLabel}>ACCOUNT</Text>
        <InfoRow label="NAME" value={displayName} />
        <InfoRow label="EMAIL" value={user?.email ?? "—"} />
        <InfoRow label="SYNC" value={syncStatusLabel(syncStatus)} />
        <View style={styles.profileActions}>
          <EditNameRow
            name={displayName}
            onSave={async (name) => {
              await updateName(name);
              setDisplayName(name.trim());
            }}
          />
          <ChangePasswordRow onChangePassword={changePassword} />
        </View>

        {isAdmin && (
          <>
            <Text style={styles.sectionLabel}>ADMIN</Text>
            {/* Claim-gated for presentation only — hiding the row from a
                non-admin is a courtesy, not the boundary. The callable behind
                the dashboard re-checks the token's custom claim server-side,
                which is the check that actually matters. */}
            <View style={styles.profileActions}>
              <SwipeAction label="DASHBOARD" icon="chart" tone="accent" onConfirm={() => router.push("/dashboard")} />
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>ACCOUNT ACTIONS</Text>
        <View style={styles.profileActions}>
          <SignOutRow onSignOut={signOutUser} />
          <DeleteAccountRow onDelete={deleteAccount} />
        </View>

        <Text style={styles.sectionLabel}>INTERACTION</Text>
        <InfoRow label="UX" value={traditional ? "TRADITIONAL" : "LEGACY"} />
        <Text style={styles.uxNote}>
          {traditional
            ? "BUTTONS AND TAPS ACROSS THE APP. THE GAMES KEEP THEIR GESTURES."
            : "HOLDS, SWIPES AND DRAGS ACROSS THE APP. NO BUTTONS."}
        </Text>
        <View style={styles.profileActions}>
          <SwipeAction
            label={traditional ? "SWITCH TO LEGACY UX" : "SWITCH TO TRADITIONAL UX"}
            icon="swap"
            tone="default"
            onConfirm={() => updatePreferences({ uxMode: traditional ? "legacy" : "traditional" })}
          />
        </View>

        <Text style={styles.sectionLabel}>FEEDBACK</Text>
        <ToggleRow
          label="HAPTICS"
          value={preferences.hapticsEnabled}
          onChange={(hapticsEnabled) => updatePreferences({ hapticsEnabled })}
        />

        <Text style={styles.sectionLabel}>ABOUT</Text>
        <InfoRow label="VERSION" value="1.0.0" />
      </ScrollView>

      <BackButton label="BACK" side="left" direction="left" onBack={() => router.back()} />
    </View>
  );
}

/** A static label/value line, used for ACCOUNT and ABOUT. */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={1} ellipsizeMode="middle" style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

function EditNameRow({ name, onSave }: { name: string; onSave: (name: string) => Promise<void> }) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const open = () => {
    setValue(name);
    setError(null);
    setVisible(true);
  };
  const save = async () => {
    const nextError = validateNameChange(value).name;
    if (nextError) { setError(nextError); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(value);
      setVisible(false);
    } catch (cause) {
      setError(getAuthErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <SwipeAction label="EDIT NAME" icon="pencil" tone="default" onConfirm={open} />
      <AccountDialog visible={visible} title="EDIT NAME" message="CHOOSE THE NAME SHOWN ON YOUR ACCOUNT." error={error} onCancel={() => setVisible(false)}>
        <TextInput value={value} onChangeText={setValue} autoCapitalize="words" autoCorrect={false} editable={!saving} style={styles.input} accessibilityLabel="NAME" />
        <SwipeAction label={saving ? "SAVING..." : "SAVE NAME"} icon="check" tone="accent" disabled={saving} onConfirm={save} />
      </AccountDialog>
    </View>
  );
}

function ChangePasswordRow({ onChangePassword }: { onChangePassword: (currentPassword: string, nextPassword: string) => Promise<void> }) {
  const [visible, setVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const open = () => {
    setCurrentPassword("");
    setNextPassword("");
    setError(null);
    setVisible(true);
  };
  const change = async () => {
    const errors = validatePasswordChange({ currentPassword, nextPassword });
    if (errors.currentPassword || errors.nextPassword) {
      setError(errors.currentPassword ?? errors.nextPassword ?? null);
      return;
    }
    setChanging(true);
    setError(null);
    try {
      await onChangePassword(currentPassword, nextPassword);
      setVisible(false);
    } catch (cause) {
      setError(getAuthErrorMessage(cause));
    } finally {
      setChanging(false);
    }
  };

  return (
    <View>
      <SwipeAction label="CHANGE PASSWORD" icon="lock" tone="default" onConfirm={open} />
      <AccountDialog visible={visible} title="CHANGE PASSWORD" message="ENTER YOUR CURRENT PASSWORD BEFORE CHOOSING A NEW ONE." error={error} onCancel={() => setVisible(false)}>
        <TextInput value={currentPassword} onChangeText={setCurrentPassword} placeholder="CURRENT PASSWORD" placeholderTextColor={Theme.textMuted} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!changing} style={styles.input} accessibilityLabel="CURRENT PASSWORD" />
        <TextInput value={nextPassword} onChangeText={setNextPassword} placeholder="NEW PASSWORD" placeholderTextColor={Theme.textMuted} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!changing} style={styles.input} accessibilityLabel="NEW PASSWORD" />
        <SwipeAction label={changing ? "UPDATING..." : "CHANGE PASSWORD"} icon="check" tone="accent" disabled={changing} onConfirm={change} />
      </AccountDialog>
    </View>
  );
}

function AccountDialog({ visible, title, message, error, onCancel, children }: {
  visible: boolean;
  title: string;
  message: string;
  error: string | null;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button" accessibilityLabel="CANCEL">
        <Pressable style={styles.dialog} onPress={() => {}}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogMessage}>{message}</Text>
          {children}
          {error ? <Text style={styles.dialogError}>{error}</Text> : null}
          <SwipeAction label="CANCEL" icon="close" direction="left" tone="calm" onConfirm={onCancel} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A deliberate left swipe guards a destructive, irreversible action — the
 *  same reasoning SwipeAction generalises for the upload flow, just applied
 *  to the one row in the app that can't be undone by swiping again. */
function SignOutRow({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const traditional = useTraditionalUx();
  const [error, setError] = useState(false);
  // Traditional UX makes the row a single tap, which loses the deliberate
  // swipe that guarded it — so a tap asks first instead of signing out.
  const [confirming, setConfirming] = useState(false);

  const signOut = async () => {
    setConfirming(false);
    setError(false);
    try {
      await onSignOut();
    } catch {
      setError(true);
    }
  };

  return (
    <View>
      <SwipeAction
        label="SIGN OUT"
        icon="signOut"
        direction="left"
        tone="destructive"
        onConfirm={traditional ? () => setConfirming(true) : signOut}
      />
      {error && <Text style={styles.signOutError}>COULDN&apos;T SIGN OUT. TRY AGAIN.</Text>}
      <ConfirmationDialog
        visible={confirming}
        title="SIGN OUT?"
        message="Your decks and progress stay synced to your account."
        confirmLabel="SIGN OUT"
        confirmIcon="signOut"
        cancelLabel="STAY SIGNED IN"
        onConfirm={signOut}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

/** Account deletion stays out of the ordinary sign-out row: it is a separate,
 * typed confirmation because it erases remote data as well as this device's session. */
function DeleteAccountRow({ onDelete }: { onDelete: () => Promise<void> }) {
  const [visible, setVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch {
      setDeleting(false);
      setError("COULDN'T DELETE THE ACCOUNT. TRY AGAIN.");
    }
  };

  return (
    <View>
      <SwipeAction label="DELETE ACCOUNT" icon="trash" direction="left" tone="destructive" onConfirm={() => setVisible(true)} />
      <TypedConfirmationDialog
        visible={visible}
        title="DELETE ACCOUNT?"
        message="THIS ERASES YOUR COURSES, CARDS, UPLOADS AND STUDY HISTORY FOREVER."
        confirmation="DELETE"
        confirmLabel="DELETE FOREVER"
        confirmIcon="trash"
        submitting={deleting}
        error={error}
        onConfirm={confirmDelete}
        onCancel={() => { setError(null); setVisible(false); }}
      />
    </View>
  );
}

/**
 * A preference switch. Legacy: drag-only — the knob follows the finger and
 * releasing snaps it to the nearer side. Traditional: tapping the row or the
 * track flips it, with the knob animating exactly as it does after a drag.
 */
function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const traditional = useTraditionalUx();
  const knob = useSharedValue(value ? 1 : 0); // 0 = off, 1 = on

  useEffect(() => {
    knob.value = withSpring(value ? 1 : 0, Motion.snap);
  }, [knob, value]);

  // The child toggle's GestureDetector takes precedence over any ancestor's
  // own gesture automatically (innermost first), so this never fights a
  // scroll or the back button.
  const toggleDrag = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .onChange((e) => {
      knob.value = Math.min(1, Math.max(0, knob.value + e.changeX / 22));
    })
    .onEnd(() => {
      const on = knob.value > 0.5;
      knob.value = withSpring(on ? 1 : 0, Motion.snap);
      runOnJS(onChange)(on);
    });

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      knob.value,
      [0, 1],
      [Theme.surface, Colors.rust],
    ),
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: knob.value * 22 }],
  }));

  if (traditional) {
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
        onPress={() => onChange(!value)}
        style={styles.infoRow}
      >
        <Text style={styles.infoLabel}>{label}</Text>
        <View style={styles.toggleWrap}>
          <Text style={styles.toggleState}>{value ? "ON" : "OFF"}</Text>
          <Animated.View style={[styles.track, trackStyle]}>
            <Animated.View style={[styles.knob, knobStyle]} />
          </Animated.View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.toggleWrap}>
        <Text style={styles.toggleState}>{value ? "ON" : "OFF"}</Text>
        <GestureDetector gesture={toggleDrag}>
          <Animated.View style={[styles.track, trackStyle]}>
            <Animated.View style={[styles.knob, knobStyle]} />
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.background,
  },
  heading: {
    fontFamily: Fonts.display,
    color: Theme.text,
    letterSpacing: 2,
    fontSize: 40,
  },
  sectionLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.textMuted,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  firstSectionLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: Theme.textMuted,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.glassEdge,
  },
  infoLabel: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Theme.text,
  },
  infoValue: {
    flex: 1,
    marginLeft: Spacing.lg,
    textAlign: "right",
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    color: Theme.textMuted,
  },
  uxNote: {
    marginTop: Spacing.sm,
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Theme.textMuted,
  },
  signOutError: {
    marginTop: Spacing.sm,
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.rust,
  },
  profileActions: { marginTop: Spacing.md, gap: Spacing.sm },
  backdrop: { flex: 1, justifyContent: "center", padding: Spacing.lg, backgroundColor: "rgba(0,0,0,0.65)" },
  dialog: { borderRadius: Radius.card, backgroundColor: Theme.background, padding: Spacing.lg, gap: Spacing.md },
  dialogTitle: { fontFamily: Fonts.display, fontSize: 30, letterSpacing: 1.5, color: Theme.text },
  dialogMessage: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22, color: Theme.textMuted },
  input: {
    height: 52,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.md,
    color: Theme.text,
    backgroundColor: Theme.surface,
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
  },
  dialogError: { fontFamily: Fonts.bodyBold, fontSize: 12, color: Theme.incorrect },
  toggleWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  toggleState: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Theme.textMuted,
    marginRight: Spacing.sm,
  },
  track: {
    width: 52,
    height: 30,
    borderRadius: 999,
  },
  knob: {
    position: "absolute",
    left: 3,
    top: 3,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.bone,
  },
});
