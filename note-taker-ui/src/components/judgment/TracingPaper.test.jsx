import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TracingPaper from './TracingPaper';
import { getCaseStress } from '../../api/judgmentResolution';

jest.mock('../../api/judgmentResolution', () => ({
  getCaseStress: jest.fn(),
  draftCaseStress: jest.fn(),
  chooseCaseStress: jest.fn()
}));

jest.mock('../../hooks/useMotionPreferences', () => ({
  usePrefersReducedMotion: () => true
}));

describe('tracing paper', () => {
  it('labels generated ink and names the turned assumption', async () => {
    getCaseStress.mockResolvedValue({
      live: { claim: 'Compute stays scarce through 2027.', assumptions: [{ text: 'Lead times stay long.' }] },
      sheets: [{
        _id: 's1',
        kind: 'alternative_future',
        generated: true,
        generatedLabel: 'Generated. Not yet a decision.',
        line: 'If fabs arrive a year early, Compute stays scarce through 2027. is read on tracing paper.',
        uncertainty: 'Hypothetical. The live case is unchanged until you choose.'
      }]
    });
    render(
      <MemoryRouter>
        <TracingPaper pageId="64f500000000000000000010" />
      </MemoryRouter>
    );
    expect(await screen.findByText(/Generated. Not yet a decision/)).toBeInTheDocument();
    expect(screen.getByText(/tracing paper/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep the live posture' })).toBeInTheDocument();
    expect(document.querySelector('.tracing-paper')).toHaveClass('is-still');
  });
});
