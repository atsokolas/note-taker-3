import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  RoomShelf,
  RoomShelfButton,
  RoomShelfList,
  RoomShelfMeta,
  RoomShelfSection
} from './RoomShelf';

describe('RoomShelf', () => {
  it('keeps room navigation, search, counts, and selection in one grammar', () => {
    const onSearchChange = jest.fn();
    render(
      <RoomShelf
        as="nav"
        aria-label="Notes"
        label="Notes"
        count={12}
        search=""
        searchLabel="Find a note"
        searchPlaceholder="Find a note"
        onSearchChange={onSearchChange}
      >
        <RoomShelfSection label="Recent">
          <RoomShelfList>
            <li>
              <RoomShelfButton active>
                <span>Open note</span>
                <RoomShelfMeta>Today</RoomShelfMeta>
              </RoomShelfButton>
            </li>
          </RoomShelfList>
        </RoomShelfSection>
      </RoomShelf>
    );

    expect(screen.getByRole('navigation', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open note Today/ })).toHaveAttribute('aria-current', 'true');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a note' }), { target: { value: 'open' } });
    expect(onSearchChange).toHaveBeenCalledWith('open');
  });
});
