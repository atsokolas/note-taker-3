import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button } from './ui';
import OnboardingChecklist from './OnboardingChecklist';

const COMPLETE_KEY = 'onboardingChecklistComplete';

const OnboardingManager = () => {
  const navigate = useNavigate();
  const onboardingComplete = localStorage.getItem(COMPLETE_KEY) === 'true';
  if (onboardingComplete) return null;

  return (
    <div className="onboarding-shell">
      <Card className="onboarding-card">
        <div className="onboarding-header">
          <span className="muted-label">Getting started</span>
          <button
            className="icon-button"
            onClick={() => {
              localStorage.setItem(COMPLETE_KEY, 'true');
            }}
          >
            Skip
          </button>
        </div>
        <h3>Your first five moves</h3>
        <p className="muted">Short, clear, and you’re rolling.</p>
        <OnboardingChecklist compact onComplete={() => { localStorage.setItem(COMPLETE_KEY, 'true'); }} />
        <div className="onboarding-actions">
          <Button onClick={() => navigate('/how-to-use')}>Open How To Use</Button>
          <Button
            variant="secondary"
            onClick={() => {
              localStorage.setItem(COMPLETE_KEY, 'true');
            }}
          >
            Skip for now
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default OnboardingManager;
