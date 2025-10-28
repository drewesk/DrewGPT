import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactTerminal, { ReactThemes } from 'react-terminal-component-new';

const WIZARD_STEPS = [
  {
    key: 'systemPrompt',
    label: 'custom system prompt message',
    placeholder: 'You are a concise assistant focused on high-signal answers.',
  },
  {
    key: 'tone',
    label: 'preferred assistant tone or voice',
    placeholder: 'Friendly, direct, and curious.',
  },
  {
    key: 'safetyNotes',
    label: 'safety guardrails or refusal guidance',
    placeholder: 'Decline disallowed or insecure requests and steer toward safe usage.',
  },
];

function sanitizeInput(value) {
  return value?.trim?.() || '';
}

export default function PreferencesWizard({ onComplete }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [placeholders, setPlaceholders] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [awaitingDetail, setAwaitingDetail] = useState(false);
  const [responses, setResponses] = useState({});
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);

  const currentStep = currentIndex < WIZARD_STEPS.length ? WIZARD_STEPS[currentIndex] : null;

  const introMessage = useMemo(() => {
    const lines = [
      'Welcome to the Llama setup wizard.',
      'Reply with y = yes, n = no, q = quit.',
      'You can also enter q while editing a value to cancel it.',
    ];

    if (currentStep) {
      lines.push('');
      lines.push(buildPrompt(currentStep, placeholders[currentStep.key]));
    }

    return lines.join('\n');
  }, [currentStep, placeholders]);

  useEffect(() => {
    let didCancel = false;

    async function fetchPreferences() {
      try {
        const res = await fetch('/api/preferences');
        if (!res.ok) {
          throw new Error(`Failed to load preferences (${res.status})`);
        }
        const data = await res.json();
        if (!didCancel) {
          setPlaceholders(data?.preferences || {});
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load preferences:', err);
        if (!didCancel) {
          setLoadError('Unable to load preferences. Using defaults.');
          setLoading(false);
        }
      }
    }

    fetchPreferences();

    return () => {
      didCancel = true;
    };
  }, []);

  const advanceToNextStep = useCallback(() => {
    setCurrentIndex((prev) => prev + 1);
    setAwaitingDetail(false);
  }, []);

  const finishWizard = useCallback(
    async (didSave) => {
      setFinished(true);
      setSaving(false);
      if (typeof onComplete === 'function') {
        onComplete({ saved: didSave, preferences: didSave ? { ...placeholders, ...responses } : placeholders });
      }
    },
    [onComplete, placeholders, responses]
  );

  const persistPreferences = useCallback(async () => {
    const payload = Object.fromEntries(
      Object.entries(responses)
        .map(([key, value]) => [key, sanitizeInput(value)])
        .filter(([, value]) => Boolean(value))
    );

    if (Object.keys(payload).length === 0) {
      await finishWizard(false);
      return 'No changes recorded. Keeping existing defaults.';
    }

    try {
      setSaving(true);
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to save preferences');
      }

      const data = await res.json();
      setPlaceholders(data?.preferences || {});
      await finishWizard(true);
      return 'Preferences saved. Launching chat...';
    } catch (err) {
      console.error('Failed to store preferences:', err);
      setSaving(false);
      return 'Failed to save preferences. Please try again or continue with defaults.';
    }
  }, [responses, finishWizard]);

  const handleInput = useCallback(
    async (rawCommand) => {
      if (loading) {
        return 'Still loading wizard. Please wait...';
      }

      if (finished) {
        return 'Wizard finished. Close this window to continue.';
      }

      const input = rawCommand.trim();
      if (!input) {
        return 'Please type a response.';
      }

      if (!currentStep) {
        return await persistPreferences();
      }

      if (awaitingDetail) {
        if (input.toLowerCase() === 'q') {
          setAwaitingDetail(false);
          advanceToNextStep();
          const nextStep = WIZARD_STEPS[currentIndex + 1];
          return nextStep
            ? `Skipped ${currentStep.label}.\n\n${buildPrompt(nextStep, placeholders[nextStep.key])}`
            : await persistPreferences();
        }

        setResponses((prev) => ({ ...prev, [currentStep.key]: input }));
        advanceToNextStep();
        const nextStep = WIZARD_STEPS[currentIndex + 1];
        return nextStep
          ? `Saved ${currentStep.label}.\n\n${buildPrompt(nextStep, placeholders[nextStep.key])}`
          : await persistPreferences();
      }

      const lowered = input.toLowerCase();
      if (lowered === 'q') {
        await finishWizard(false);
        return 'Wizard cancelled. Using server defaults.';
      }

      if (lowered === 'n') {
        advanceToNextStep();
        const nextStep = WIZARD_STEPS[currentIndex + 1];
        return nextStep
          ? `Skipped ${currentStep.label}.\n\n${buildPrompt(nextStep, placeholders[nextStep.key])}`
          : await persistPreferences();
      }

      if (lowered === 'y') {
        setAwaitingDetail(true);
        const placeholder = placeholders[currentStep.key] || currentStep.placeholder;
        return `Type the ${currentStep.label}.\n(Press q to cancel this entry.)\n${placeholder ? `Suggested: ${placeholder}` : ''}`.trim();
      }

      return 'Please respond with y, n, or q.';
    },
    [advanceToNextStep, awaitingDetail, currentIndex, currentStep, finishWizard, loading, persistPreferences, placeholders, finished]
  );

  if (loading) {
    return (
      <div className="preferences-overlay">
        <div className="preferences-modal">
          <p className="preferences-status">Loading terminal wizard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="preferences-overlay">
      <div className="preferences-modal">
        {loadError && <p className="preferences-status error">{loadError}</p>}
        {saving && <p className="preferences-status">Saving preferences...</p>}
        <ReactTerminal
          theme={ReactThemes.hacker}
          promptSymbol=">"
          errorText="Command not recognised."
          welcomeMessage={introMessage}
          allowTabs={false}
          commandPassThrough={handleInput}
        />
      </div>
    </div>
  );
}

function buildPrompt(step, currentValue) {
  const parts = [`Would you like to set a ${step.label}? (y/n/q)`];
  if (currentValue) {
    parts.push(`Current: ${currentValue}`);
  } else if (step.placeholder) {
    parts.push(`Placeholder: ${step.placeholder}`);
  }
  return parts.join('\n');
}
