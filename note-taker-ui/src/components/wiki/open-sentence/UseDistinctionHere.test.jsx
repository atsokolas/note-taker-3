import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import UseDistinctionHere from './UseDistinctionHere';
import { distinctionRecord } from '../../../utils/distinctionUse';

const room = distinctionRecord({
  name: 'Room to be wrong',
  definition: 'A mistake that teaches the map, versus one that strands you.',
  sourceId: 'note-1'
});

const downside = distinctionRecord({
  name: 'Whose downside?',
  definition: 'Who pays when the experiment fails.',
  sourceId: 'note-2'
});

describe('UseDistinctionHere', () => {
  it('applies the only held distinction with one press, keyboard or touch', () => {
    const onUse = jest.fn();
    render(<UseDistinctionHere held={room} onUse={onUse} />);
    const action = screen.getByRole('button', { name: 'Use this here' });
    fireEvent.click(action);
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({
      name: room.name,
      definition: room.definition,
      versionId: room.versionId,
      sourceId: 'note-1'
    }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('lets keyboard and touch choose among saved distinctions', () => {
    const onUse = jest.fn();
    render(<UseDistinctionHere distinctions={[room, downside]} onUse={onUse} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use this here' }));
    const list = screen.getByRole('listbox', { name: 'Named distinctions' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ name: downside.name }));
    expect(screen.getByRole('button', { name: 'Use this here' })).toHaveFocus();
  });

  it('stays silent when there is nothing to use', () => {
    const { container } = render(<UseDistinctionHere distinctions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
