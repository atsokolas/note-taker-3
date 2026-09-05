import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MorningStickyNotes from './MorningStickyNotes';

describe('MorningStickyNotes', () => {
  it('prints dated lines once, with the door back', () => {
    render(
      <MemoryRouter>
        <MorningStickyNotes
          stickies={[{
            stickyId: 's1',
            text: 'Ask him about Thursday.',
            targetTitle: 'The letter',
            href: '/library?articleId=a1'
          }]}
        />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Pinned lines due')).toHaveTextContent('Ask him about Thursday.');
    expect(screen.getByRole('link', { name: 'The letter' }))
      .toHaveAttribute('href', '/library?articleId=a1');
  });

  it('prints the line even when the door is gone, and never an empty row', () => {
    render(
      <MemoryRouter>
        <MorningStickyNotes
          stickies={[
            { stickyId: 's1', text: 'Ask him.', targetTitle: '', href: '' },
            { stickyId: 's2', text: '   ', targetTitle: 'Ghost', href: '/library' }
          ]}
        />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Pinned lines due')).toHaveTextContent('Ask him.');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('omits the block when no morning came', () => {
    const { container } = render(
      <MemoryRouter>
        <MorningStickyNotes stickies={[]} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
