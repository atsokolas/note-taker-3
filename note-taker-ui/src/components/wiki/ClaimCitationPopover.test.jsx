import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ClaimCitationPopover from './ClaimCitationPopover';
const rect = { left: 285, width: 20, top: 700, bottom: 720 };
const source = { type: 'article', articleId: 'owned', title: 'Owned source', snippet: 'Exact retained words', url: 'https://example.test/original' };
const show = props => render(<MemoryRouter><ClaimCitationPopover anchorRect={rect} sources={[source]} {...props} /></MemoryRouter>);
it('keeps unknown unknown and does not invent a count for partial support', () => {
  const view = show({ support: 'unrecognized' });
  expect(screen.getByText('Unknown support')).toBeInTheDocument();
  expect(screen.getByText('The support for this claim has not been recorded.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Attached sources' })).toBeInTheDocument();
  view.unmount(); show({ support: 'partial', sources: [source, { ...source, articleId: 'second' }] });
  expect(screen.getByText('2 sources')).toBeInTheDocument();
  expect(screen.getByText('The recorded evidence supports only part of this claim.')).toBeInTheDocument();
  expect(screen.queryByText(/Only one source/)).toBeNull();
});
it('bounds tall evidence at narrow viewports and reacts to resize', () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
  const view = show({ support: 'supported', sources: Array.from({ length: 30 }, (_, i) => ({ ...source, _id: String(i) })) });
  let panel = screen.getByRole('dialog');
  expect(panel).toHaveStyle({ width: '296px', maxHeight: '376px', overflowY: 'auto', boxSizing: 'border-box' });
  expect(Number.parseFloat(panel.style.left)).toBeGreaterThanOrEqual(12);
  expect(Number.parseFloat(panel.style.top)).toBeGreaterThanOrEqual(12);
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 430 });
  fireEvent(window, new Event('resize'));
  expect(panel).toHaveStyle({ width: '360px' });
  view.unmount();
});
it('enters the evidence from keyboard focus and Escape restores the exact connected marker', () => {
  const anchor = document.createElement('button'); document.body.appendChild(anchor); anchor.focus();
  const onClose = jest.fn(); show({ support: 'supported', anchorElement: anchor, onClose });
  expect(screen.getByRole('dialog')).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1); expect(anchor).toHaveFocus(); anchor.remove();
});
it('does not steal pointer focus and explicit close returns to its marker without jumping', () => {
  const anchor = document.createElement('button'); document.body.appendChild(anchor);
  const focus = jest.spyOn(anchor, 'focus'); const onClose = jest.fn();
  show({ anchorElement: anchor, onClose });
  expect(screen.getByRole('dialog')).not.toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Close claim citations' }));
  expect(focus).toHaveBeenCalledWith({ preventScroll: true }); anchor.remove();
});
it('scroll inside the evidence leaves it open, while outside scroll closes it', () => {
  const onClose = jest.fn(); show({ onClose });
  fireEvent.scroll(screen.getByRole('dialog')); expect(onClose).not.toHaveBeenCalled();
  fireEvent.scroll(window); expect(onClose).toHaveBeenCalledTimes(1);
});

it('renders an empty evidence list when sources are omitted without a render loop', () => {
  render(<MemoryRouter><ClaimCitationPopover anchorRect={rect} /></MemoryRouter>);
  expect(screen.getByText('0 sources')).toBeInTheDocument();
  expect(screen.getByText('Unknown support')).toBeInTheDocument();
});
