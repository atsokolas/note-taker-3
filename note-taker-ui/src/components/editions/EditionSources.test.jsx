import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  EditionSourcesJump,
  EditionSourcesList,
  SOURCES_JUMP_COPY,
  SOURCES_LIST_COPY,
  useEditionSources
} from './EditionSources';

const edition = {
  _id: 'e2',
  items: [
    { title: 'A Unified Framework for VLA Agents', url: 'https://example.com/vla', sourceLabel: 'arXiv' },
    { title: 'Duplicate href', url: 'https://example.com/vla', sourceLabel: 'arXiv' },
    { title: 'Unsafe', url: 'javascript:alert(1)' },
    { title: 'A second paper', url: 'https://example.com/two', sourceLabel: 'Lab Blog' }
  ]
};

const Harness = ({ paper = edition }) => {
  const { sources, listId, listRef, jump } = useEditionSources(paper);
  if (!sources.length) return <p>silence</p>;
  return (
    <>
      <EditionSourcesJump listId={listId} onJump={jump} />
      <EditionSourcesList sources={sources} listId={listId} listRef={listRef} />
    </>
  );
};

describe('the sources of an issue', () => {
  const originalMatchMedia = window.matchMedia;
  const originalScroll = Element.prototype.scrollIntoView;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    Element.prototype.scrollIntoView = originalScroll;
  });

  it('names the jump the way a person would ask', () => {
    render(<Harness />);
    expect(screen.getByTestId('edition-sources-jump')).toHaveTextContent(SOURCES_JUMP_COPY);
  });

  it('keeps the list folded until you open it, then shows every followable link', async () => {
    render(<Harness />);
    const list = screen.getByTestId('edition-sources');
    expect(list).not.toHaveAttribute('open');
    expect(screen.getByText(SOURCES_LIST_COPY)).toBeInTheDocument();
    await userEvent.click(screen.getByText(SOURCES_LIST_COPY));
    expect(list).toHaveAttribute('open');
    expect(screen.getByRole('link', { name: 'arXiv · A Unified Framework for VLA Agents' }))
      .toHaveAttribute('href', 'https://example.com/vla');
    expect(screen.getByRole('link', { name: 'Lab Blog · A second paper' }))
      .toHaveAttribute('href', 'https://example.com/two');
    expect(screen.queryByRole('link', { name: /Unsafe/ })).not.toBeInTheDocument();
  });

  const stubMedia = (matches) => {
    window.matchMedia = (query) => ({
      matches: matches(query),
      addEventListener: () => {},
      removeEventListener: () => {}
    });
  };

  it('scrolls to the folded list without opening it, and leaves focus there', async () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    stubMedia((query) => query === '(hover: hover) and (pointer: fine)');
    render(<Harness />);
    await userEvent.click(screen.getByTestId('edition-sources-jump'));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    const list = screen.getByTestId('edition-sources');
    expect(list).not.toHaveAttribute('open');
    expect(document.activeElement).toBe(list.querySelector('summary'));
  });

  it('jumps instantly on a coarse pointer', async () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    stubMedia(() => false);
    render(<Harness />);
    await userEvent.click(screen.getByTestId('edition-sources-jump'));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('jumps instantly when the reader prefers less motion', async () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    stubMedia((query) => (
      query === '(prefers-reduced-motion: reduce)'
      || query === '(hover: hover) and (pointer: fine)'
    ));
    render(<Harness />);
    await userEvent.click(screen.getByTestId('edition-sources-jump'));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('stays silent when nothing is followable', () => {
    render(<Harness paper={{ _id: 'e0', items: [{ title: 'No link' }, { url: 'javascript:alert(1)' }] }} />);
    expect(screen.getByText('silence')).toBeInTheDocument();
    expect(screen.queryByTestId('edition-sources-jump')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edition-sources')).not.toBeInTheDocument();
  });
});
