import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { Fonts, Spacing, Theme } from "@/constants/theme";

interface AuthFieldProps extends TextInputProps {
  label: string;
  error?: string;
  secret?: boolean;
}

export function AuthField({
  label,
  error,
  secret = false,
  value,
  onFocus,
  onBlur,
  ...inputProps
}: AuthFieldProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const labelProgress = useRef(new Animated.Value(value ? 1 : 0)).current;
  const raised = focused || Boolean(value);

  useEffect(() => {
    Animated.timing(labelProgress, {
      toValue: raised ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [labelProgress, raised]);

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          error && styles.fieldError,
        ]}
      >
        <Animated.Text
          pointerEvents="none"
          style={[
            styles.label,
            {
              top: labelProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [17, 7],
              }),
              fontSize: labelProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 11],
              }),
              color: focused ? Theme.text : Theme.textMuted,
            },
          ]}
        >
          {label}
        </Animated.Text>
        <TextInput
          {...inputProps}
          value={value}
          secureTextEntry={secret && !revealed}
          placeholderTextColor="transparent"
          selectionColor={Theme.accent}
          style={[styles.input, secret && styles.inputWithAction]}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
        {secret && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            hitSlop={12}
            onPress={() => setRevealed((current) => !current)}
            style={styles.reveal}
          >
            <Text style={styles.revealText}>{revealed ? "HIDE" : "SHOW"}</Text>
          </Pressable>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  field: {
    height: 58,
    borderRadius: 16,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: "transparent",
    overflow: "hidden",
  },
  fieldFocused: { borderColor: Theme.glassEdge },
  fieldError: { borderColor: Theme.incorrect },
  label: {
    position: "absolute",
    left: Spacing.md,
    zIndex: 1,
    fontFamily: Fonts.body,
  },
  input: {
    flex: 1,
    paddingTop: 21,
    paddingBottom: 7,
    paddingHorizontal: Spacing.md,
    fontFamily: Fonts.bodyMedium,
    fontSize: 16,
    color: Theme.text,
  },
  inputWithAction: { paddingRight: 72 },
  reveal: {
    position: "absolute",
    right: Spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  revealText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: Theme.textMuted,
  },
  error: {
    marginLeft: Spacing.sm,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Theme.incorrect,
  },
});
