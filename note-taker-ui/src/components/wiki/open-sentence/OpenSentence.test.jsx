import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import OpenSentence from './OpenSentence';
import {
  changedWordSpans,
  closeExploration,
  createExploration,
  openExploration,
  placeSource,
  putItBack,
  restoreExploration,
  snapshotExploration,
  tryWording,
  wikiAcceptedText,
  wordingChanged
} from './openSentenceModel';
import { STORYBOARD_SENTENCE, STORYBOARD_SOURCE } from './openSentenceStoryboardFixture';

const renderOpen = (exploration, onChange = jest.fn()) => render(
  <OpenSentence exploration={exploration} onChange={onChange} mocked />
);

describe('openSentenceModel', () => {
  it('keeps accepted wiki text untouched while wording changes', () => {
    const start = createExploration({ id: 's1', originalText: STORYBOARD_SENTENCE });
    const next = tryWording(start, 'Children need room to make recoverable mistakes.');
    expect(wikiAcceptedText(next)).toBe(STORYBOARD_SENTENCE);
    expect(wordingChanged(next)).toBe(true);
    expect(putItBack(next).provisionalText).toBe(STORYBOARD_SENTENCE);
  });

  it('marks only the new words', () => {
    const spans = changedWordSpans(
      'Children need room to make mistakes.',
      'Children need room to make recoverable mistakes.'
    );
    expect(spans.filter((span) => span.changed).map((span) => span.text)).toEqual(['recoverable']);
  });

  it('restores a private draft without rewriting accepted text or inventing a source', () => {
    const start = createExploration({
      id: 's1',
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    });
    const dirty = {
      ...openExploration(tryWording(start, 'draft')),
      question: 'Which mistakes?',
      originalText: 'forged',
      source: null
    };
    const restored = restoreExploration(snapshotExploration(dirty), start);
    expect(restored.originalText).toBe(STORYBOARD_SENTENCE);
    expect(restored.source).toEqual(STORYBOARD_SOURCE);
    expect(restored.question).toBe('Which mistakes?');
    expect(restored.provisionalText).toBe('draft');
  });

  it('does not place an unavailable source', () => {
    const start = createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: { title: 'Nomad', available: false }
    });
    expect(placeSource(start).placed).toBe(false);
  });
});

describe('OpenSentence', () => {
  it('opens from the sentence without leaving the accepted line', () => {
    const onChange = jest.fn();
    const exploration = createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE });
    renderOpen(exploration, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
    expect(screen.getByRole('button', { name: STORYBOARD_SENTENCE })).toBeInTheDocument();
  });

  it('opens from the keyboard on the held sentence', () => {
    const onChange = jest.fn();
    const exploration = createExploration({ originalText: STORYBOARD_SENTENCE, source: STORYBOARD_SOURCE });
    renderOpen(exploration, onChange);
    fireEvent.keyDown(screen.getByRole('button', { name: STORYBOARD_SENTENCE }), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
  });

  it('closes on Escape after the placement preview', () => {
    const onChange = jest.fn();
    const exploration = openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: STORYBOARD_SOURCE
    }));
    renderOpen(exploration, onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Place beside' }));
    expect(screen.getByText('Beside the thought')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Beside the thought')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'closed' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith(closeExploration(exploration));
  });

  it('says nothing when no source belongs here', () => {
    renderOpen(openExploration(createExploration({ originalText: STORYBOARD_SENTENCE, source: null })));
    expect(screen.getByText('Nothing beside this sentence yet.')).toBeInTheDocument();
  });

  it('does not substitute a similar passage when the source is gone', () => {
    renderOpen(openExploration(createExploration({
      originalText: STORYBOARD_SENTENCE,
      source: { title: 'Nomad', available: false }
    })));
    expect(screen.getByText(/Nomad is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/similar passage was not attached/)).toBeInTheDocument();
  });
});
