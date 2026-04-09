export default function StepUsername({ username, setUsername, usernameChecking, usernameError, onSkip }) {
  return (
    <div>
      <h1 className="onboarding-step-heading">What should we call you?</h1>
      <p className="onboarding-step-sub">
        Choose a username for your public profile. You can change this any time.
      </p>
      <div className={`onboarding-input-wrap${usernameError ? ' has-error' : ''}`}>
        <span className="onboarding-input-prefix">@</span>
        <input
          type="text"
          placeholder="yourname"
          value={username}
          autoFocus
          maxLength={30}
          onChange={e =>
            setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
          }
        />
        {usernameChecking && (
          <span className="onboarding-input-status">checking…</span>
        )}
        {!usernameChecking && username && !usernameError && (
          <span className="onboarding-input-status onboarding-input-valid">✓</span>
        )}
      </div>
      {usernameError && (
        <p className="onboarding-field-error">{usernameError}</p>
      )}
      <button className="onboarding-skip-link" onClick={onSkip}>
        Skip for now
      </button>
    </div>
  );
}
