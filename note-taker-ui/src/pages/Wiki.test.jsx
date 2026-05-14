import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockUseParams = jest.fn();
const mockUseLocation = jest.fn();

jest.mock('../utils/wikiFeatureFlags', () => ({
  isWikiReadModeV2Enabled: jest.fn()
}));

jest.mock('../utils/wikiAnalytics', () => ({
  trackWikiEditModeEntered: jest.fn()
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
  useParams: () => mockUseParams()
}));

jest.mock('../components/wiki/WikiIndex', () => () => <div data-testid="wiki-index">Wiki graph index</div>);
jest.mock('../components/wiki/WikiList', () => () => <div data-testid="wiki-list">Wiki list</div>);
jest.mock('../components/wiki/WikiPageReadView', () => ({ onEdit, pageId }) => (
  <div data-testid="wiki-read-view">
    Read {pageId}
    <button type="button" onClick={onEdit}>Edit</button>
  </div>
));
jest.mock('../components/wiki/WikiPageEditor', () => ({ onDoneEditing, pageId }) => (
  <div data-testid="wiki-page-editor">
    Edit {pageId}
    {onDoneEditing ? <button type="button" onClick={onDoneEditing}>Done editing</button> : null}
  </div>
));

import Wiki from './Wiki';
import { isWikiReadModeV2Enabled } from '../utils/wikiFeatureFlags';
import { trackWikiEditModeEntered } from '../utils/wikiAnalytics';

describe('Wiki route shell', () => {
  let originalRequestAnimationFrame;
  let originalScrollTo;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ id: 'wiki-1' });
    mockUseLocation.mockReturnValue({ pathname: '/wiki/wiki-1' });
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalScrollTo = window.scrollTo;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 320 });
    window.requestAnimationFrame = callback => {
      callback();
      return 1;
    };
    window.scrollTo = jest.fn();
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.scrollTo = originalScrollTo;
  });

  it('keeps the existing editor as the default when read mode v2 is disabled', () => {
    isWikiReadModeV2Enabled.mockReturnValue(false);

    render(<Wiki />);

    expect(screen.getByTestId('wiki-page-editor')).toHaveTextContent('wiki-1');
    expect(screen.queryByTestId('wiki-read-view')).not.toBeInTheDocument();
  });

  it('opens read mode when the flag is enabled and returns from edit mode', () => {
    isWikiReadModeV2Enabled.mockReturnValue(true);

    render(<Wiki />);

    expect(screen.getByTestId('wiki-read-view')).toHaveTextContent('wiki-1');
    expect(screen.queryByTestId('wiki-page-editor')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(trackWikiEditModeEntered).toHaveBeenCalledWith({ pageId: 'wiki-1', source: 'wiki_route_shell' });
    expect(screen.getByTestId('wiki-page-editor')).toHaveTextContent('wiki-1');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 320);

    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    expect(screen.getByTestId('wiki-read-view')).toHaveTextContent('wiki-1');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 320);
  });

  it('renders the graph index at /wiki', () => {
    isWikiReadModeV2Enabled.mockReturnValue(true);

    mockUseParams.mockReturnValue({});
    mockUseLocation.mockReturnValue({ pathname: '/wiki' });

    render(<Wiki />);

    expect(screen.getByTestId('wiki-index')).toBeInTheDocument();
  });

  it('keeps the card list at /wiki when read mode v2 is disabled', () => {
    isWikiReadModeV2Enabled.mockReturnValue(false);

    mockUseParams.mockReturnValue({});
    mockUseLocation.mockReturnValue({ pathname: '/wiki' });

    render(<Wiki />);

    expect(screen.getByTestId('wiki-list')).toBeInTheDocument();
    expect(screen.queryByTestId('wiki-index')).not.toBeInTheDocument();
  });

  it('renders the card list at /wiki/list', () => {
    isWikiReadModeV2Enabled.mockReturnValue(true);

    mockUseParams.mockReturnValue({});
    mockUseLocation.mockReturnValue({ pathname: '/wiki/list' });

    render(<Wiki />);

    expect(screen.getByTestId('wiki-list')).toBeInTheDocument();
  });
});
