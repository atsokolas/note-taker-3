import { isOnboardingComplete, markOnboardingComplete } from './onboardingState';

const BARE_KEY = 'noeis.wikiOnboardingComplete';

jest.mock('../api/onboarding', () => ({
  markOnboardingCompleteOnServer: jest.fn().mockResolvedValue({})
}));

const tokenFor = (id) => {
  const payload = Buffer.from(JSON.stringify({ id, exp: 4102444800 })).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${payload}.signature`;
};

describe('onboardingState completion flag', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not let one account answer for another on the same browser', () => {
    localStorage.setItem('token', tokenFor('account-a'));
    markOnboardingComplete();
    expect(isOnboardingComplete()).toBe(true);

    // A different person signs in on the same machine. They have onboarded nothing.
    localStorage.setItem('token', tokenFor('account-b'));
    expect(isOnboardingComplete()).toBe(false);

    // And the first account is unaffected by the second's state.
    localStorage.setItem('token', tokenFor('account-a'));
    expect(isOnboardingComplete()).toBe(true);
  });

  it('ignores and removes a pre-scoping flag left by an earlier build', () => {
    localStorage.setItem('token', tokenFor('account-new'));
    localStorage.setItem(BARE_KEY, 'true');

    // The bare key was written before completion was per-account. Honouring it would
    // skip first-run for someone who has never seen it.
    expect(isOnboardingComplete()).toBe(false);
    expect(localStorage.getItem(BARE_KEY)).toBeNull();
  });

  it('still works signed out rather than throwing', () => {
    expect(isOnboardingComplete()).toBe(false);
    markOnboardingComplete();
    expect(isOnboardingComplete()).toBe(true);
  });
});
