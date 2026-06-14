import { render, screen } from '@testing-library/react';
import ArticleReader from './ArticleReader';

jest.mock('../api/highlights', () => ({
  createHighlight: jest.fn()
}));
jest.mock('./reader/SelectionMenu', () => () => <div data-testid="selection-menu" />);
jest.mock('./reader/MagneticReadingRail', () => () => <div data-testid="magnetic-reading-rail" />);
jest.mock('./reader/useTextSelection', () => () => ({
  selectionState: {
    isOpen: false,
    text: '',
    rect: null,
    anchor: null
  },
  clearSelection: jest.fn()
}));
jest.mock('../tour/useTourSignal', () => () => jest.fn());
jest.mock('./agent/ThoughtPartnerPanel', () => () => <div data-testid="thought-partner-panel" />);
jest.mock('./agent/AgentSkillDock', () => () => <div data-testid="agent-skill-dock" />);

describe('ArticleReader', () => {
  it('shows saved highlights as the reading body when an imported source has no full text', () => {
    render(
      <ArticleReader
        article={{
          _id: 'article-1',
          title: 'Poor Charlie\'s Almanack',
          content: '',
          createdAt: '2026-06-07T00:00:00.000Z'
        }}
        highlights={[
          {
            _id: 'highlight-1',
            text: 'Invert, always invert.',
            note: 'Useful for decision-making.',
            tags: ['mental models'],
            createdAt: '2026-06-07T00:00:00.000Z'
          }
        ]}
      />
    );

    expect(screen.getByText('Highlight edition')).toBeInTheDocument();
    expect(screen.getByText(/No full article text was imported/)).toBeInTheDocument();
    expect(screen.getByText('Invert, always invert.')).toBeInTheDocument();
    expect(screen.getByText('Useful for decision-making.')).toBeInTheDocument();
    expect(screen.getByText('mental models')).toBeInTheDocument();
  });
});
