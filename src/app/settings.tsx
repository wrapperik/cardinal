import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput } from "react-native";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { InlineError } from "@/components/inline-error";
import { PageScaffold } from "@/components/page-scaffold";
import { ActionPair, SwipeAction } from "@/components/swipe-action";
import { TypedConfirmationDialog } from "@/components/typed-confirmation-dialog";
import { Fonts, Radius, Spacing, Theme } from "@/constants/theme";
import { useIsAdmin } from "@/features/admin/role";
import { useAuth } from "@/features/auth/auth-provider";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { validateNameChange, validatePasswordChange } from "@/features/auth/validation";
import {
  updatePreferences,
  usePreferences,
  usePreferencesSyncSummary,
  useTraditionalUx,
} from "@/features/preferences/preferences";
import { ListActionRow, ListGroup, ListInfoRow, ListToggleRow } from "@/components/grouped-list";
import { LIQUID_GLASS_SUPPORTED } from "@/lib/liquid-glass";

/**
 * Settings, as an ordinary pushed screen: a fixed title bar, then grouped
 * cards of rows (see features/settings/settings-list). Every action row and
 * switch branches on the UX preference itself — a tap in traditional UX, a
 * rightward swipe or a dragged knob in legacy — so this screen only lays
 * them out. The INTERACTION group is where the person switches between the
 * two.
 */
export default function Settings() {
  const router = useRouter();
  const { changePassword, deleteAccount, signOutUser, updateName, user } = useAuth();
  const preferences = usePreferences();
  const syncSummary = usePreferencesSyncSummary();
  const isAdmin = useIsAdmin();
  const traditional = useTraditionalUx();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "STUDENT");

  useEffect(() => setDisplayName(user?.displayName ?? "STUDENT"), [user?.displayName]);

  return (
    <PageScaffold title="SETTINGS" backSide="left">
        <ListGroup title="ACCOUNT">
          <EditNameRow
            name={displayName}
            onSave={async (name) => {
              await updateName(name);
              setDisplayName(name.trim());
            }}
          />
          <ListInfoRow icon="mail" label="EMAIL" value={user?.email ?? "—"} />
          <ChangePasswordRow onChangePassword={changePassword} />
          <ListInfoRow icon="cloud" label="SYNC" value={syncSummary} />
        </ListGroup>

        <ListGroup
          title="INTERACTION"
          footer={traditional
            ? "Buttons and taps across the app. The games keep their gestures."
            : "Holds, swipes and drags across the app. Swipe a row right to open it."}
        >
          <ListActionRow
            icon="swap"
            label="UX MODE"
            value={traditional ? "TRADITIONAL" : "LEGACY"}
            onPress={() => updatePreferences({ uxMode: traditional ? "legacy" : "traditional" })}
          />
        </ListGroup>

        <ListGroup title="PREFERENCES">
          <ListToggleRow
            icon="vibrate"
            label="HAPTICS"
            value={preferences.hapticsEnabled}
            onChange={(hapticsEnabled) => updatePreferences({ hapticsEnabled })}
          />
          {/* Only offered where it can render — on older iOS and Android the
              switch would do nothing. */}
          {LIQUID_GLASS_SUPPORTED && (
            <ListToggleRow
              icon="sparkle"
              label="LIQUID GLASS"
              value={preferences.liquidGlass}
              onChange={(liquidGlass) => updatePreferences({ liquidGlass })}
            />
          )}
        </ListGroup>

        {/* Claim-gated for presentation only — hiding the row from a
            non-admin is a courtesy, not the boundary. The callable behind
            the dashboard re-checks the token's custom claim server-side,
            which is the check that actually matters. */}
        {isAdmin && (
          <ListGroup title="ADMIN">
            <ListActionRow icon="chart" label="DASHBOARD" onPress={() => router.push("/dashboard")} />
          </ListGroup>
        )}

        <ListGroup title="ABOUT">
          <ListInfoRow icon="info" label="VERSION" value="2.0" />
        </ListGroup>

        {/* Kept apart and last, so the two rows that end the session are
            never the next thing under a thumb working down the list. */}
        <ListGroup>
          <SignOutRow onSignOut={signOutUser} />
          <DeleteAccountRow onDelete={deleteAccount} />
        </ListGroup>
    </PageScaffold>
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
    <>
      <ListActionRow icon="person" label="NAME" value={name} onPress={open} />
      <AccountDialog
        visible={visible}
        title="EDIT NAME"
        message="CHOOSE THE NAME SHOWN ON YOUR ACCOUNT."
        error={error}
        onCancel={() => setVisible(false)}
        confirm={<SwipeAction label={saving ? "SAVING..." : "SAVE"} icon="check" tone="accent" disabled={saving} onConfirm={save} />}
      >
        <TextInput value={value} onChangeText={setValue} autoCapitalize="words" autoCorrect={false} editable={!saving} style={styles.input} accessibilityLabel="NAME" />
      </AccountDialog>
    </>
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
    <>
      <ListActionRow icon="lock" label="PASSWORD" value="••••••••" onPress={open} />
      <AccountDialog
        visible={visible}
        title="CHANGE PASSWORD"
        message="ENTER YOUR CURRENT PASSWORD BEFORE CHOOSING A NEW ONE."
        error={error}
        onCancel={() => setVisible(false)}
        confirm={<SwipeAction label={changing ? "UPDATING..." : "UPDATE"} icon="check" tone="accent" disabled={changing} onConfirm={change} />}
      >
        <TextInput value={currentPassword} onChangeText={setCurrentPassword} placeholder="CURRENT PASSWORD" placeholderTextColor={Theme.textMuted} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!changing} style={styles.input} accessibilityLabel="CURRENT PASSWORD" />
        <TextInput value={nextPassword} onChangeText={setNextPassword} placeholder="NEW PASSWORD" placeholderTextColor={Theme.textMuted} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!changing} style={styles.input} accessibilityLabel="NEW PASSWORD" />
      </AccountDialog>
    </>
  );
}

function AccountDialog({ visible, title, message, error, onCancel, confirm, children }: {
  visible: boolean;
  title: string;
  message: string;
  error: string | null;
  onCancel: () => void;
  confirm: React.ReactElement;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button" accessibilityLabel="CANCEL">
        <Pressable style={styles.dialog} onPress={() => {}}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogMessage}>{message}</Text>
          {children}
          {error ? <InlineError>{error}</InlineError> : null}
          <ActionPair
            primary={confirm}
            secondary={<SwipeAction label="CANCEL" icon="close" direction="left" tone="calm" onConfirm={onCancel} />}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Legacy UX signs out on the swipe itself — the drag is the deliberate
 *  step. Traditional UX asks first, since a tap alone is too easy to make. */
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
    <>
      <ListActionRow
        icon="signOut"
        label="SIGN OUT"
        destructive
        // A failed sign-out says so in the row itself, rather than pushing
        // a loose error line into the middle of the card.
        value={error ? "TRY AGAIN" : undefined}
        onPress={traditional ? () => setConfirming(true) : signOut}
      />
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
    </>
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
    <>
      <ListActionRow icon="trash" label="DELETE ACCOUNT" destructive onPress={() => setVisible(true)} />
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
    </>
  );
}

const styles = StyleSheet.create({
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
});
