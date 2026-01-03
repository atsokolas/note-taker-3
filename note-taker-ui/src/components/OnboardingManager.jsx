import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import { Card, Button } from './ui';

const STORAGE_KEYS = {
  complete: 'onboardingComplete',
  step: 'onboardingStep',
  hasHighlight: 'hasCreatedHighlight',
  hasTagged: 'hasTaggedHighlight',
  hasNote: 'hasCreatedNote',
  hasLinked: 'hasInsertedHighlightIntoNote'
};

const defaultSummary = {
  hasArticle: false,
  hasHighlight: false,
  hasTaggedHighlight: false,
  hasNote: false,
  hasLinkedHighlight: false
};

const OnboardingManager = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(defaultSummary);
  const [loading, setLoading] = useState(false);

  const onboardingComplete = localStorage.getItem(STORAGE_KEYS.complete) === 'true';
  const currentStep = Number(localStorage.getItem(STORAGE_KEYS.step) || 1);

  const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/onboarding/summary', authHeaders());
      const data = res.data || defaultSummary;
      setSummary(data);
      localStorage.setItem(STORAGE_KEYS.hasHighlight, String(Boolean(data.hasHighlight)));
      localStorage.setItem(STORAGE_KEYS.hasTagged, String(Boolean(data.hasTaggedHighlight)));
      localStorage.setItem(STORAGE_KEYS.hasNote, String(Boolean(data.hasNote)));
      localStorage.setItem(STORAGE_KEYS.hasLinked, String(Boolean(data.hasLinkedHighlight)));
    } catch (err) {
      console.error('Onboarding summary failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (onboardingComplete) return;
    fetchSummary();
  }, [location.pathname]);

  const resolveStep = () => {
    if (onboardingComplete) return null;
    if (currentStep <= 1 && summary.hasArticle) return 2;
    if (currentStep <= 2 && summary.hasHighlight) return 3;
    if (currentStep <= 3 && summary.hasTaggedHighlight) return 4;
    if (currentStep <= 4 && summary.hasNote) return 5;
    if (currentStep <= 5 && summary.hasLinkedHighlight) return 'complete';
    return currentStep;
  };

  const nextStep = resolveStep();

  useEffect(() => {
    if (!nextStep) return;
    if (nextStep === 'complete') {
      localStorage.setItem(STORAGE_KEYS.complete, 'true');
      return;
    }
    if (nextStep !== currentStep) {
      localStorage.setItem(STORAGE_KEYS.step, String(nextStep));
    }
  }, [nextStep, currentStep]);

  const stepConfig = useMemo(() => ([
    {
      id: 1,
      title: 'Welcome',
      body: 'This is a place to keep the ideas you care about.',
      cta: 'Save your first article',
      target: 'save-article',
      action: () => navigate('/library')
    },
    {
      id: 2,
      title: 'Highlights are the raw material',
      body: 'Highlight the sentence that made you pause. Don’t overthink it.',
      cta: 'Add a tag',
      target: 'highlight-tags',
      action: () => navigate('/library?tab=highlights')
    },
    {
      id: 3,
      title: 'Tags are ideas, not folders',
      body: 'Make concepts like “Compounding”, “AI Hardware”, “Batteries”.',
      cta: 'Create a note',
      target: 'new-note',
      action: () => navigate('/think')
    },
    {
      id: 4,
      title: 'Thinking happens here',
      body: 'Messy is fine. Use your own words.',
      cta: 'Insert a highlight',
      target: 'insert-highlight',
      action: () => {
        navigate('/think');
        setTimeout(() => {
          window.dispatchEvent(new Event('open-insert-highlight'));
        }, 400);
      }
    },
    {
      id: 5,
      title: 'Your desk',
      body: 'You don’t have to remember everything. The system brings it back.',
      cta: 'Go to Today',
      target: 'today-desk',
      action: () => navigate('/today')
    }
  ]), [navigate]);

  const activeStep = stepConfig.find(step => step.id === (nextStep || currentStep));

  useEffect(() => {
    if (!activeStep?.target) return undefined;
    const element = document.querySelector(`[data-onboard-id="${activeStep.target}"]`);
    if (element) element.classList.add('onboarding-target');
    return () => {
      if (element) element.classList.remove('onboarding-target');
    };
  }, [activeStep?.target, location.pathname]);

  if (onboardingComplete || !activeStep) return null;

  return (
    <div className="onboarding-shell">
      <Card className="onboarding-card">
        <div className="onboarding-header">
          <span className="muted-label">Step {activeStep.id} of 5</span>
          <button
            className="icon-button"
            onClick={() => {
              localStorage.setItem(STORAGE_KEYS.complete, 'true');
            }}
          >
            Skip
          </button>
        </div>
        <h3>{activeStep.title}</h3>
        <p className="muted">{activeStep.body}</p>
        <div className="onboarding-actions">
          <Button onClick={activeStep.action} disabled={loading}>
            {activeStep.cta}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              localStorage.setItem(STORAGE_KEYS.complete, 'true');
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
