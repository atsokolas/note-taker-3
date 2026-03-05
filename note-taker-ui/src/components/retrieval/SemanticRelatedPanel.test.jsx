import { fireEvent, render, screen } from '@testing-library/react';
import SemanticRelatedPanel from './SemanticRelatedPanel';
import useSemanticRelated from '../../hooks/useSemanticRelated';

jest.mock('../../hooks/useSemanticRelated', () => jest.fn());

jest.mock('react-router-dom', () => ({
  Link: ({ to, children, className }) => <a href={to} className={className}>{children}</a>
}), { virtual: true });

describe('SemanticRelatedPanel', () => {
  beforeEach(() => {
    useSemanticRelated.mockReset();
  });

  it('renders explanation copy and semantic rows with similarity band', () => {
    useSemanticRelated.mockReturnValue({
      results: [
        {
          objectType: 'highlight',
          objectId: 'h-1',
          title: 'Transformer scaling law',
          snippet: 'Paper notes',
          metadata: { articleId: 'a-1', articleTitle: 'Scaling paper' },
          score: 0.9,
          similarityBand: 'High'
        }
      ],
      meta: { modelAvailable: true },
      loading: false,
      error: ''
    });

    render(
      <SemanticRelatedPanel
        sourceType="highlight"
        sourceId="h-0"
        renderAction={(item) => <button type="button">Add {item.objectId}</button>}
      />
    );

    expect(screen.getByText('AI Related Highlights')).toBeInTheDocument();
    expect(screen.getByText('How similarity works')).toBeInTheDocument();
    expect(screen.getByText('Transformer scaling law')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Add h-1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Add h-1'));
  });

  it('shows unavailable message when AI model is unavailable', () => {
    useSemanticRelated.mockReturnValue({
      results: [],
      meta: { modelAvailable: false },
      loading: false,
      error: ''
    });

    render(<SemanticRelatedPanel sourceType="concept" sourceId="c-1" />);
    expect(screen.getByText('AI suggestions unavailable right now.')).toBeInTheDocument();
  });
});
