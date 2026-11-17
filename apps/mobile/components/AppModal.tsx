/** Register native modals so the proactive trial sheet waits until they close. */
import { useLayoutEffect } from 'react';
import { Modal, type ModalProps } from 'react-native';
import { holdPremiumTrialPrompt } from '@plot/core/premiumTrialPrompt.js';

export default function AppModal({ holdTrialPrompt = true, ...props }: ModalProps & { holdTrialPrompt?: boolean }) {
  useLayoutEffect(() => {
    if (!holdTrialPrompt || props.visible === false) return undefined;
    const release = holdPremiumTrialPrompt();
    // Keep the hold through the native closing animation, including a modal
    // replaced immediately by another one.
    return () => { setTimeout(release, 350); };
  }, [holdTrialPrompt, props.visible]);

  return <Modal {...props} />;
}
