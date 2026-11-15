import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WorkMenu from './WorkMenu';

test('Escape closes a tool and returns focus to its trigger; clicking outside also dismisses it', () => {
  render(<><WorkMenu label="Dates"><input aria-label="Entry date" /></WorkMenu><button>Writing</button></>);
  const trigger = screen.getByLabelText('Dates'), menu = trigger.closest('details');
  fireEvent.click(trigger);
  const input = screen.getByLabelText('Entry date'); input.focus();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(menu.open).toBe(false); expect(trigger).toHaveFocus();
  fireEvent.click(trigger); fireEvent.pointerDown(screen.getByRole('button', { name: 'Writing' }));
  expect(menu.open).toBe(false);
});

test('an inner disclosure can consume Escape without closing the containing tool', () => {
  render(<WorkMenu label="Writing tools"><details open onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus(); }
  }}><summary>Contents</summary><button>Go to entry</button></details></WorkMenu>);
  const trigger = screen.getByLabelText('Writing tools'); fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Go to entry' }), { key: 'Escape' });
  expect(trigger.closest('details').open).toBe(true);
  expect(screen.getByText('Contents')).toHaveFocus();
});
