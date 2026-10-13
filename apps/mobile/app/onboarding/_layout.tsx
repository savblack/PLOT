import { useContext, useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { OnboardingCompleteContext } from '../../contexts/OnboardingContext';
import { OnboardingFlowProvider } from '../../contexts/OnboardingFlowContext';
import { track, EVENTS } from '../../lib/analytics';

export default function OnboardingLayout() {
  const { colors } = useTheme();
  const onboardingComplete = useContext(OnboardingCompleteContext);

  // The first screen is where the auth guard drops a user with onboarding still
  // to do, so this is the top of the funnel. Web fires it from OnboardingFlow
  // once the profile row says setup is unfinished, for the same reason. A
  // finished account can mount this stack for a frame on the way home.
  const started = useRef(false);
  useEffect(() => {
    if (onboardingComplete !== false || started.current) return;
    started.current = true;
    track(EVENTS.ONBOARDING_STARTED);
  }, [onboardingComplete]);

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
