import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { OnboardingFlowProvider } from '../../contexts/OnboardingFlowContext';
import { track, EVENTS } from '../../lib/analytics';

export default function OnboardingLayout() {
  const { colors } = useTheme();

  // The first screen is where the auth guard drops a user with onboarding still
  // to do, so this is the top of the funnel. Web fires it from OnboardingFlow's
  // own mount for the same reason.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track(EVENTS.ONBOARDING_STARTED);
  }, []);

  return (
    <OnboardingFlowProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
          gestureEnabled: false, // prevent swipe-back during onboarding
        }}
      />
    </OnboardingFlowProvider>
  );
}
