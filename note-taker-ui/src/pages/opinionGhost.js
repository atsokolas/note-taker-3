import React, { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../motion/columnMotion';
import { oneSentence } from './judgmentModel';
import { normalizeSpaces } from '../utils/editorialText';

// Ghost ink: a name that is not there yet, and the opinion you just left.
// Same fade, same italic paper. The missing name is not a form label; the
// previous hold is not a banner. Both yield.

export const GHOST_FADE_MS = 420;
export const OPINION_GHOST_LINGER_MS = 1400;
export const OPINION_GHOST_FADE_MS = GHOST_FADE_MS;
export const MISSING_NAME = 'Name this';
export const GHOST_INK_CLASS = 'judgment__ghost';

/** The ghost of a missing name. Empty once the case is named. Never the claim. */
export const ghostOfMissingName = (name = '') => (normalizeSpaces(name) ? '' : MISSING_NAME);

/** The previous held sentence, or empty when nothing should linger. */
export const ghostOfPreviousOpinion = (previous, next) => {
  const prior = oneSentence(previous);
  const held = oneSentence(next);
  if (!prior || !held || prior === held) return '';
  return prior;
};

export const useOpinionGhost = (sentence, identity = '') => {
  const [ghost, setGhost] = useState('');
  const [yielding, setYielding] = useState(false);
  const heldRef = useRef(null);
  const identityRef = useRef(identity);
  const ghostingRef = useRef('');

  useEffect(() => {
    if (identityRef.current !== identity) {
      identityRef.current = identity;
      heldRef.current = null;
      ghostingRef.current = '';
      setGhost('');
      setYielding(false);
    }

    const next = oneSentence(sentence);
    if (heldRef.current === null) {
      heldRef.current = next;
      return;
    }

    const previous = heldRef.current;
    if (next === previous) return;
    if (!next) return;

    const lingering = ghostOfPreviousOpinion(previous, next);
    heldRef.current = next;
    if (ghostingRef.current || !lingering || prefersReducedMotion()) return;

    ghostingRef.current = lingering;
    setGhost(lingering);
    setYielding(false);
  }, [sentence, identity]);

  useEffect(() => {
    if (!ghost) return undefined;
    const fade = window.setTimeout(() => setYielding(true), OPINION_GHOST_LINGER_MS);
    return () => window.clearTimeout(fade);
  }, [ghost]);

  useEffect(() => {
    if (!yielding) return undefined;
    const done = window.setTimeout(() => {
      ghostingRef.current = '';
      setGhost('');
      setYielding(false);
    }, GHOST_FADE_MS);
    return () => window.clearTimeout(done);
  }, [yielding]);

  return { ghost, yielding };
};

export const GhostInk = ({ as: Tag = 'p', yielding = false, className = '', testId, children }) => (
  <Tag
    className={[GHOST_INK_CLASS, className, yielding ? 'is-yielding' : '']
      .filter(Boolean)
      .join(' ')}
    data-testid={testId}
    aria-hidden="true"
  >
    {children}
  </Tag>
);

export const OpinionGhost = ({ sentence = '', identity = '' }) => {
  const { ghost, yielding } = useOpinionGhost(sentence, identity);
  if (!ghost) return null;
  return (
    <GhostInk
      yielding={yielding}
      className="judgment__opinion-ghost"
      testId="opinion-ghost"
    >
      {ghost}
    </GhostInk>
  );
};
