import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiDriftSentence from './WikiDriftSentence';
import { getArticles } from '../../api/articles';
import { getFolders } from '../../api/folders';

jest.mock('../../api/articles', () => ({
  getArticles: jest.fn()
}));

jest.mock('../../api/folders', () => ({
  getFolders: jest.fn(() => Promise.resolve([]))
}));

const filed = (n, topic, at) => Array.from({ length: n }, (_, i) => ({
  _id: `${topic}-${i}`,
  folder: { name: topic },
  createdAt: at
}));

const CLOSE = '2026-09-12T12:00:00.000Z';
const CLOSE_NOW = new Date('2026-09-12T18:00:00.000Z').getTime();

describe('WikiDriftSentence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    /* clearAllMocks restores bare jest.fn()s: the cabinet mock has to be
       taught again every morning. */
    getFolders.mockResolvedValue([]);
  });

  it('prints the sentence with a door on the closing morning', async () => {
    getArticles.mockResolvedValue([
      ...filed(8, 'Capacity', '2026-09-01T12:00:00.000Z'),
      ...filed(8, 'Power', '2026-08-10T12:00:00.000Z')
    ]);
    render(
      <MemoryRouter>
        <WikiDriftSentence driftClosesAt={CLOSE} now={CLOSE_NOW} />
      </MemoryRouter>
    );
    expect(await screen.findByLabelText('Reading drift')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How your reading moved →' }))
      .toHaveAttribute('href', '/judgment');
    expect(screen.queryByText(/\(0\)/)).not.toBeInTheDocument();
  });

  it('fetches nothing and prints nothing the other thirteen mornings', () => {
    const { container } = render(
      <MemoryRouter>
        <WikiDriftSentence driftClosesAt="2026-09-26T12:00:00.000Z" />
      </MemoryRouter>
    );
    expect(getArticles).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent below the minimum, however interesting the shape', async () => {
    getArticles.mockResolvedValue(filed(3, 'Capacity', '2026-09-01T12:00:00.000Z'));
    const { container } = render(
      <MemoryRouter>
        <WikiDriftSentence driftClosesAt={CLOSE} now={CLOSE_NOW} />
      </MemoryRouter>
    );
    await waitFor(() => expect(getArticles).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('a drift we could not read is not a still drift', async () => {
    getArticles.mockRejectedValue(new Error('nope'));
    const { container } = render(
      <MemoryRouter>
        <WikiDriftSentence driftClosesAt={CLOSE} now={CLOSE_NOW} />
      </MemoryRouter>
    );
    await waitFor(() => expect(getArticles).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
