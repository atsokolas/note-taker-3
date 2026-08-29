import React, { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../motion/columnMotion';
import { oneSentence } from './judgmentModel';

// Ghost of the previous opinion.
//
// When the held sentence changes, the old one stays briefly as faded italic
// ink — dated disagreement with yourself — then yields. It is session-local
// and only for a replacement that just happened. First paint, a blank, and a
// different claim do not linger.

export const OPINION_GHOST_LINGER_MS = 1400;
export const OPINION_GHOST_FADE_MS = 420;

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
    }, OPINION_GHOST_FADE_MS);
    return () => window.clearTimeout(done);
  }, [yielding]);

  return { ghost, yielding };
};

export const OpinionGhost = ({ sentence = '', identity = '' }) => {
  const { ghost, yielding } = useOpinionGhost(sentence, identity);
  if (!ghost) return null;
  return (
    <p
      className={`judgment__opinion-ghost${yielding ? ' is-yielding' : ''}`}
      data-testid="opinion-ghost"
      aria-hidden="true"
    >
      {ghost}
    </p>
  );
};
