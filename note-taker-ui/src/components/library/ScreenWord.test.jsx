import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  clearSentenceHandoff,
  peekSentenceHandoff
} from '../../motion/columnMotion';
import ScreenWord from './ScreenWord';

describe('ScreenWord', () => {
  afterEach(clearSentenceHandoff);

  it('hands the folder name off when you screen it', () => {
    const onScreen = jest.fn();
    render(<ScreenWord asFeed={false} sentence="Newsletters" onScreen={onScreen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read as feed' }));
    expect(peekSentenceHandoff()?.sentence).toBe('Newsletters');
    expect(onScreen).toHaveBeenCalledWith(true);
  });

  it('does not hand a name off when you keep it in the Library', () => {
    const onScreen = jest.fn();
    render(<ScreenWord asFeed sentence="Newsletters" onScreen={onScreen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep in Library' }));
    expect(peekSentenceHandoff()).toBeNull();
    expect(onScreen).toHaveBeenCalledWith(false);
  });
});
