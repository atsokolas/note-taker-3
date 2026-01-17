import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const CHECKLIST = [
  { key: 'onboard_save_article', label: 'Save your first article', href: '/library' },
  { key: 'onboard_highlight', label: 'Highlight a passage', href: '/library' },
  { key: 'onboard_to_concept', label: 'Send a highlight to a concept', href: '/think?view=concepts' },
  { key: 'onboard_question', label: 'Create a question', href: '/think?view=questions' },
  { key: 'onboard_notebook', label: 'Write a notebook entry', href: '/think?view=notebook' }
];

const COMPLETE_KEY = 'onboardingChecklistComplete';

const OnboardingChecklist = ({ compact = false, onComplete }) => {
  const [state, setState] = useState(() => {
    const initial = {};
    CHECKLIST.forEach(item => {
      initial[item.key] = localStorage.getItem(item.key) === 'true';
    });
    return initial;
  });

  const allComplete = useMemo(
    () => CHECKLIST.every(item => state[item.key]),
    [state]
  );

  const toggle = (key) => {
    setState(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(key, String(next[key]));
      const done = CHECKLIST.every(item => next[item.key]);
      localStorage.setItem(COMPLETE_KEY, String(done));
      if (done && onComplete) onComplete();
      return next;
    });
  };

  return (
    <div className={compact ? 'onboarding-checklist compact' : 'onboarding-checklist'}>
      {CHECKLIST.map(item => (
        <div key={item.key} className="onboarding-checklist-row">
          <label className="onboarding-checklist-label">
            <input
              type="checkbox"
              checked={state[item.key]}
              onChange={() => toggle(item.key)}
            />
            <span>{item.label}</span>
          </label>
          {!compact && (
            <Link className="muted small" to={item.href}>Go</Link>
          )}
        </div>
      ))}
      {allComplete && (
        <p className="status-message success-message">Checklist complete. You are officially dangerous.</p>
      )}
    </div>
  );
};

export default OnboardingChecklist;
