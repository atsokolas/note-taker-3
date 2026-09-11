import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FindWhatIAlreadyHave from './FindWhatIAlreadyHave';

const article = {
  _id: 'article-1',
  title: 'Nomad',
  url: 'https://example.com/nomad',
  content: 'Getting lost was part of the work. A wrong turn can still leave another attempt.'
};

const highlight = {
  _id: 'highlight-1',
  articleId: 'article-1',
  articleTitle: 'Nomad',
  text: 'A wrong turn can still leave another attempt.',
  anchor: { text: 'A wrong turn can still leave another attempt.' }
};

describe('FindWhatIAlreadyHave', () => {
  const pickerProps = () => ({
    loadFolders: jest.fn().mockResolvedValue([]),
    loadArticles: jest.fn().mockResolvedValue([]),
    loadArticle: jest.fn().mockResolvedValue({ article, highlights: [highlight] }),
    search: jest.fn().mockResolvedValue({ articles: [], highlights: [highlight] })
  });

  it('inspects an authorized Library passage and places it beside the question', async () => {
    const onPlace = jest.fn();
    render(<FindWhatIAlreadyHave onPlace={onPlace} pickerProps={pickerProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Find what I already have' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Nomad' } });
    fireEvent.click(within(await screen.findByRole('listitem')).getByRole('button'));
    fireEvent.click(await screen.findByRole('button', { name: 'Place here' }));
    expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({
      articleId: 'article-1',
      highlightId: 'highlight-1',
      passage: highlight.text
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Find what I already have' })).toHaveFocus();
  });

  it('offers undo only after a placement', () => {
    const onUndo = jest.fn();
    const { rerender } = render(<FindWhatIAlreadyHave onUndo={onUndo} />);
    expect(screen.queryByRole('button', { name: 'Undo passage placement' })).not.toBeInTheDocument();
    rerender(<FindWhatIAlreadyHave canUndo onUndo={onUndo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo passage placement' }));
    expect(onUndo).toHaveBeenCalled();
  });
});
