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

test('action lists close after activation and support arrow keys without stealing form input', () => {
  const rename = jest.fn();
  render(<WorkMenu label="Actions" icon="more" actions><button onClick={rename}>Rename</button><button>Delete</button></WorkMenu>);
  const trigger = screen.getByLabelText('Actions');
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  expect(screen.getByRole('button', { name: 'Rename' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
  expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: 'Home' });
  fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
  expect(rename).toHaveBeenCalledTimes(1);
  expect(trigger.closest('details').open).toBe(false);
  expect(trigger).toHaveFocus();
});

test('action menu placement stays inside a narrow viewport and dismisses on resize', () => {
  render(<WorkMenu label="Actions" actions><button>Rename</button></WorkMenu>);
  const trigger = screen.getByLabelText('Actions');
  trigger.getBoundingClientRect = () => ({ right: 12, bottom: 900 });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const panel = trigger.parentElement.querySelector('.work-menu-body');
  expect(parseInt(panel.style.left, 10)).toBeGreaterThanOrEqual(8);
  expect(parseInt(panel.style.top, 10)).toBeLessThanOrEqual(window.innerHeight - 8);
  fireEvent.resize(window);
  expect(trigger.closest('details').open).toBe(false);
});


test('ArrowUp from the action trigger starts at the last item', () => {
  render(<WorkMenu label="Actions" actions><button>Open</button><button>Delete</button></WorkMenu>);
  fireEvent.keyDown(screen.getByLabelText('Actions'), { key: 'ArrowUp' });
  expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
});


test('native fields inside action menus keep their arrow and Home/End keys', () => {
  render(<WorkMenu label="Task actions" actions><button>Edit</button><select aria-label="Priority"><option>None</option><option>First</option></select></WorkMenu>);
  fireEvent.click(screen.getByLabelText('Task actions'));
  const select = screen.getByLabelText('Priority'); select.focus();
  for (const key of ['ArrowUp', 'ArrowDown', 'Home', 'End']) {
    expect(fireEvent.keyDown(select, { key })).toBe(true);
    expect(select).toHaveFocus();
  }
});


test('scroll dismissal returns focus from an action to its trigger', () => {
  render(<WorkMenu label="Actions" actions><button>Rename</button></WorkMenu>);
  const trigger = screen.getByLabelText('Actions');
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.scroll(document);
  expect(trigger.closest('details').open).toBe(false);
  expect(trigger).toHaveFocus();
});
