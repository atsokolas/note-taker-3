import { currentAccountId, purgeUnscopedKeys, scopedKey } from './browserScope';

/** Build an unsigned JWT whose payload carries an account id. */
const tokenFor = (id) => {
  const payload = Buffer.from(JSON.stringify({ id, exp: 4102444800 })).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${payload}.signature`;
};

describe('browserScope', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('namespaces a key to the signed-in account', () => {
    localStorage.setItem('token', tokenFor('account-a'));
    expect(currentAccountId()).toBe('account-a');
    expect(scopedKey('noeis.thing')).toBe('noeis.thing::account-a');
  });

  it('gives two accounts different keys for the same state', () => {
    localStorage.setItem('token', tokenFor('account-a'));
    const a = scopedKey('noeis.wikiOnboardingComplete');
    localStorage.setItem('token', tokenFor('account-b'));
    const b = scopedKey('noeis.wikiOnboardingComplete');
    // This is the whole point: one account finishing onboarding must not answer
    // for the next account signing in on the same browser.
    expect(a).not.toBe(b);
  });

  it('leaves keys bare when signed out', () => {
    expect(currentAccountId()).toBe('');
    expect(scopedKey('noeis.thing')).toBe('noeis.thing');
  });

  it('survives a token that is not a readable JWT', () => {
    localStorage.setItem('token', 'not-a-jwt');
    expect(currentAccountId()).toBe('');
    expect(scopedKey('noeis.thing')).toBe('noeis.thing');
  });

  it('removes pre-scoping copies once there is an account to scope to', () => {
    localStorage.setItem('token', tokenFor('account-a'));
    localStorage.setItem('noeis.wikiOnboardingComplete', 'true');
    purgeUnscopedKeys(['noeis.wikiOnboardingComplete']);
    expect(localStorage.getItem('noeis.wikiOnboardingComplete')).toBeNull();
  });

  it('leaves a bare key alone while signed out, since it is the correct key there', () => {
    localStorage.setItem('noeis.wikiOnboardingComplete', 'true');
    purgeUnscopedKeys(['noeis.wikiOnboardingComplete']);
    expect(localStorage.getItem('noeis.wikiOnboardingComplete')).toBe('true');
  });
});
