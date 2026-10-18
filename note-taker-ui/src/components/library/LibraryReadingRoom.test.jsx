import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LibraryReadingRoom from './LibraryReadingRoom';
import { getReadingRoom, getWorthSayingPhrasing } from '../../api/readingRoom';
import { weekKey } from './libraryReadingRoomModel';

jest.mock('../../api/readingRoom', () => ({
  getReadingRoom: jest.fn(),
  getWorthSayingPhrasing: jest.fn()
}));

const EMPTY = { pick: null, stillReading: [], newFromSources: [], weather: null, worthSaying: [], modelAvailable: false };
const SAYING = [1, 2, 3].map((n) => ({ articleId: `s${n}`, title: `Source ${n}`, highlightId: `h${n}`, quote: `Quoted line ${n}.` }));

const renderRoom = (room) => {
  getReadingRoom.mockResolvedValue(room);
  const onOpen = jest.fn();
  const view = render(<LibraryReadingRoom onOpen={onOpen} />);
  return { ...view, onOpen };
};

const at = (date) => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(date);
};
const WEDNESDAY = new Date(2026, 9, 14, 9);
const MONDAY = new Date(2026, 9, 12, 9);

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});
afterEach(() => jest.useRealTimers());

describe('LibraryReadingRoom', () => {
  it('renders nothing at all when every section is empty', async () => {
    const { container } = renderRoom(EMPTY);
    await waitFor(() => expect(getReadingRoom).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the room cannot load', async () => {
    getReadingRoom.mockRejectedValue(new Error('down'));
    const { container } = render(<LibraryReadingRoom onOpen={jest.fn()} />);
    await waitFor(() => expect(getReadingRoom).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the pick with its stated rule and opens it', async () => {
    const { onOpen } = renderRoom({ ...EMPTY, pick: { articleId: 'p1', title: 'The oldest unread', siteName: 'Aeon' } });
    fireEvent.click(await screen.findByRole('button', { name: 'The oldest unread' }));
    expect(onOpen).toHaveBeenCalledWith('p1', undefined);
    expect(screen.getByText(/Not yet opened\. · Aeon/)).toBeInTheDocument();
    expect(screen.getByText(/oldest pieces you saved yourself/)).toBeInTheDocument();
    expect(screen.queryByText('Still reading')).not.toBeInTheDocument();
    expect(screen.queryByText('New from your sources')).not.toBeInTheDocument();
  });

  it('lists what you are partway through and what arrived from your sources', async () => {
    renderRoom({
      ...EMPTY,
      stillReading: [{ articleId: 'r1', title: 'Halfway piece', ratio: 0.5 }, { articleId: 'r2', title: 'Marked piece', ratio: null }],
      newFromSources: [{ articleId: 'n1', title: 'Fresh letter', sourceName: 'Stratechery' }]
    });
    expect(await screen.findByText('Still reading')).toBeInTheDocument();
    expect(screen.getByText('about halfway')).toBeInTheDocument();
    expect(screen.getByText('marked recently')).toBeInTheDocument();
    expect(screen.getByText('New from your sources')).toBeInTheDocument();
    expect(screen.getByText('Stratechery')).toBeInTheDocument();
    expect(screen.queryByText('For today')).not.toBeInTheDocument();
  });

  it('shows the weather on the first visit of the week, then keeps quiet until Monday', async () => {
    at(WEDNESDAY);
    const room = { ...EMPTY, weather: { line: 'Mostly semiconductors, with a chance of Stoicism.' } };
    const { unmount } = renderRoom(room);
    expect(await screen.findByTestId('reading-weather')).toHaveTextContent('Mostly semiconductors, with a chance of Stoicism.');
    unmount();
    const { container } = renderRoom(room);
    await waitFor(() => expect(getReadingRoom).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the weather quiet when it was already seen this week', async () => {
    at(WEDNESDAY);
    window.localStorage.setItem('library.readingWeather.seenWeek', weekKey(WEDNESDAY));
    renderRoom({ ...EMPTY, weather: { line: 'Mostly chips.' }, pick: { articleId: 'p1', title: 'Piece' } });
    await screen.findByText('Piece');
    expect(screen.queryByTestId('reading-weather')).not.toBeInTheDocument();
  });

  it('shows the weather all Monday', async () => {
    at(MONDAY);
    window.localStorage.setItem('library.readingWeather.seenWeek', weekKey(MONDAY));
    renderRoom({ ...EMPTY, weather: { line: 'Mostly chips.' } });
    expect(await screen.findByTestId('reading-weather')).toHaveTextContent('Mostly chips.');
  });

  it('shows only the quoted lines and their sources when there is no model', async () => {
    const { onOpen } = renderRoom({ ...EMPTY, worthSaying: SAYING });
    expect(await screen.findByText('Three things worth saying this week')).toBeInTheDocument();
    expect(screen.getByText('Quoted line 2.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Source 3' }));
    expect(onOpen).toHaveBeenCalledWith('s3', { highlightId: 'h3' });
    expect(getWorthSayingPhrasing).not.toHaveBeenCalled();
  });

  it('adds the sentence you would say out loud when the model phrased all three', async () => {
    getWorthSayingPhrasing.mockResolvedValue(SAYING.map((line) => ({ articleId: line.articleId, said: `I read ${line.title}.` })));
    renderRoom({ ...EMPTY, worthSaying: SAYING, modelAvailable: true });
    expect(await screen.findByText('I read Source 1.')).toBeInTheDocument();
    expect(screen.getByText('Quoted line 1.')).toBeInTheDocument();
  });

  it('stays quotes-only when phrasing comes back empty', async () => {
    getWorthSayingPhrasing.mockResolvedValue(null);
    renderRoom({ ...EMPTY, worthSaying: SAYING, modelAvailable: true });
    await screen.findByText('Quoted line 1.');
    await waitFor(() => expect(getWorthSayingPhrasing).toHaveBeenCalled());
    expect(document.querySelector('.reading-room__said')).toBeNull();
  });

  it('is silent about the dinner party with fewer than three lines', async () => {
    renderRoom({ ...EMPTY, worthSaying: SAYING.slice(0, 2), pick: { articleId: 'p1', title: 'Piece' } });
    await screen.findByText('Piece');
    expect(screen.queryByText('Three things worth saying this week')).not.toBeInTheDocument();
  });
});
