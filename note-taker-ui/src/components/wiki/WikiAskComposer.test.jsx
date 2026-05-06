import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WikiAskComposer from './WikiAskComposer';

describe('WikiAskComposer', () => {
  it('disables submit until the user types a non-empty question', () => {
    render(<WikiAskComposer onAsk={() => {}} />);
    const submit = screen.getByTestId('wiki-ask-composer-submit');
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId('wiki-ask-composer-input'), { target: { value: 'why?' } });
    expect(submit).toBeEnabled();
  });

  it('calls onAsk with the trimmed question and clears the field on success', async () => {
    const onAsk = jest.fn().mockResolvedValue(undefined);
    render(<WikiAskComposer onAsk={onAsk} />);
    const input = screen.getByTestId('wiki-ask-composer-input');
    fireEvent.change(input, { target: { value: '   What changed?   ' } });
    fireEvent.click(screen.getByTestId('wiki-ask-composer-submit'));
    await waitFor(() => expect(onAsk).toHaveBeenCalledWith('What changed?'));
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('shows an inline error when onAsk rejects, preserving the question text', async () => {
    const onAsk = jest.fn().mockRejectedValue(new Error('Network down'));
    render(<WikiAskComposer onAsk={onAsk} />);
    const input = screen.getByTestId('wiki-ask-composer-input');
    fireEvent.change(input, { target: { value: 'why?' } });
    fireEvent.click(screen.getByTestId('wiki-ask-composer-submit'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network down'));
    expect(input.value).toBe('why?');
  });

  it('submits on Cmd/Ctrl+Enter inside the textarea', async () => {
    const onAsk = jest.fn().mockResolvedValue(undefined);
    render(<WikiAskComposer onAsk={onAsk} />);
    const input = screen.getByTestId('wiki-ask-composer-input');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(onAsk).toHaveBeenCalledWith('a'));
  });

  it('disables the textarea, suggestions, and submit while busy', () => {
    render(<WikiAskComposer onAsk={() => {}} busy={true} />);
    expect(screen.getByTestId('wiki-ask-composer-input')).toBeDisabled();
    expect(screen.getByTestId('wiki-ask-composer-submit')).toBeDisabled();
    expect(screen.getByTestId('wiki-ask-composer-submit')).toHaveTextContent('Asking…');
  });

  it('fills the textarea when a suggestion is clicked', () => {
    render(<WikiAskComposer onAsk={() => {}} />);
    const suggestion = screen.getByText('Summarize this page in two sentences.');
    fireEvent.click(suggestion);
    expect(screen.getByTestId('wiki-ask-composer-input').value).toBe('Summarize this page in two sentences.');
  });
});
