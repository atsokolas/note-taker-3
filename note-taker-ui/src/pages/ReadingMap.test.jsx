import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import ReadingMap from './ReadingMap';
import { getReadingMap } from '../api/library';

jest.mock('../api/library', () => ({ getReadingMap: jest.fn() }));

const MAP = {
  status: 'ready',
  basis: 'words',
  sourceCount: 4,
  clusters: [
    { id: 'c0', name: 'Inflation', x: -0.5, y: 0, radius: 0.1, size: 2 },
    { id: 'c1', name: 'Chess', x: 0.5, y: 0, radius: 0.1, size: 2 }
  ],
  sources: [
    { id: '64f100000000000000000001', title: 'Rates and the bank', line: 'Rates rose again.', marks: 3, cluster: 'c0', x: -0.55, y: 0 },
    { id: '64f100000000000000000002', title: 'Tight money', line: '', marks: 1, cluster: 'c0', x: -0.45, y: 0.05 },
    { id: '64f100000000000000000003', title: 'The gambit', line: 'Give a pawn for time.', marks: 2, cluster: 'c1', x: 0.5, y: 0 },
    { id: '64f100000000000000000004', title: 'Endgames', line: '', marks: 1, cluster: 'c1', x: 0.55, y: 0.05 }
  ],
  gaps: [{ name: 'Urban Planning', writing: 4, reading: 0, x: 0, y: 0.8 }]
};

/* The router is mocked for every suite; its navigate is one shared spy. */
const navigate = useNavigate();

const renderMap = ({ narrow = false } = {}) => {
  window.matchMedia = (query) => ({
    matches: query.includes('max-width') ? narrow : query.includes('reduced-motion'),
    addEventListener() {},
    removeEventListener() {}
  });
  navigate.mockClear();
  return render(<ReadingMap />);
};

describe('ReadingMap', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => { window.matchMedia = realMatchMedia; });

  it('says plainly that the map comes later, and shows nothing else', async () => {
    getReadingMap.mockResolvedValue({ status: 'quiet', sourceCount: 3, sources: [], clusters: [], gaps: [] });
    renderMap();
    expect(await screen.findByText(/The map appears once there is enough reading/)).toBeInTheDocument();
    expect(screen.queryByTestId('reading-map-frame')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('draws a dot per source, names subjects and the blind spot', async () => {
    getReadingMap.mockResolvedValue(MAP);
    renderMap();
    expect(await screen.findByTestId('reading-map-frame')).toBeInTheDocument();
    expect(screen.getAllByTestId('reading-map-dot')).toHaveLength(4);
    expect(screen.getByText('Inflation')).toBeInTheDocument();
    expect(screen.getByText('Chess')).toBeInTheDocument();
    expect(screen.getAllByTestId('reading-map-gap')).toHaveLength(1);
    expect(screen.getByText(/nothing you saved holds it yet/)).toBeInTheDocument();
  });

  it('hover shows the title and one marked line; a click opens the source', async () => {
    getReadingMap.mockResolvedValue(MAP);
    renderMap();
    const [first] = await screen.findAllByTestId('reading-map-dot');
    fireEvent.pointerEnter(first);
    expect(screen.getByText('Rates and the bank')).toBeInTheDocument();
    expect(screen.getByText('“Rates rose again.”')).toBeInTheDocument();
    fireEvent.click(first);
    expect(navigate).toHaveBeenCalledWith('/library?articleId=64f100000000000000000001');
  });

  it('keyboard: arrows move between subjects, Enter steps in, Enter opens, Escape steps out', async () => {
    getReadingMap.mockResolvedValue(MAP);
    renderMap();
    const frame = await screen.findByTestId('reading-map-frame');
    const status = () => screen.getByRole('status');
    fireEvent.keyDown(frame, { key: 'ArrowRight' });
    expect(status()).toHaveTextContent('Inflation, 2 sources');
    fireEvent.keyDown(frame, { key: 'ArrowRight' });
    expect(status()).toHaveTextContent('Chess, 2 sources');
    fireEvent.keyDown(frame, { key: 'ArrowLeft' });
    fireEvent.keyDown(frame, { key: 'Enter' });
    expect(status()).toHaveTextContent('Rates and the bank');
    fireEvent.keyDown(frame, { key: 'ArrowRight' });
    expect(status()).toHaveTextContent('Tight money');
    fireEvent.keyDown(frame, { key: 'Escape' });
    expect(status()).toHaveTextContent('Inflation');
    fireEvent.keyDown(frame, { key: 'Enter' });
    fireEvent.keyDown(frame, { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/library?articleId=64f100000000000000000001');
  });

  it('on a phone, the map becomes its index of subjects', async () => {
    getReadingMap.mockResolvedValue(MAP);
    renderMap({ narrow: true });
    expect(await screen.findByRole('heading', { level: 2, name: 'Inflation' })).toBeInTheDocument();
    expect(screen.queryByTestId('reading-map-frame')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The gambit' })).toHaveAttribute('href', '/library?articleId=64f100000000000000000003');
    expect(screen.getByRole('heading', { level: 2, name: 'Where your reading has not gone' })).toBeInTheDocument();
  });
});
