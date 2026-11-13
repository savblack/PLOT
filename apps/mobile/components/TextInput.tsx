/**
 * React Native's TextInput with `letterSpacing: 0` as the base style. Use this
 * everywhere in the app instead of importing TextInput from 'react-native'
 * (ESLint enforces it).
 *
 * Why: Fabric recycles native text fields on iOS, and RCTTextInputComponentView's
 * prepareForRecycle does not reset the field's default text attributes. UIKit then
 * keeps an NSKern that the next field's style leaves out. The sign-in code input
 * (letterSpacing 6) is unmounted on sign-in, and whichever field mounts next reuses
 * it, so its placeholder came out as "S e a r c h". An explicit 0 puts NSKern in
 * the attributes every time. A caller's own letterSpacing still wins.
 *
 * iOS-native in cause, but harmless on Android and web.
 *
 * It also matches the keyboard to Plot's theme (see below).
 */
import { forwardRef } from 'react';
import { TextInput as RNTextInput, type TextInputProps } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  // The iOS keyboard follows the system setting, not Plot's own Light/Dark
  // choice, so a light keyboard opened over the dark theme. A caller's own
  // keyboardAppearance still wins.
  const { resolved } = useTheme();
  return <RNTextInput ref={ref} keyboardAppearance={resolved} style={[BASE, style]} {...props} />;
});

// Lets `useRef<TextInput>(null)` keep working where callers already wrote it.
export type TextInput = RNTextInput;

const BASE = { letterSpacing: 0 } as const;
