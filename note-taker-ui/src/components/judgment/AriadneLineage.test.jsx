import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AriadneLineage from './AriadneLineage';
import {
  getCaseLineage,
  proposeCaseLineage,
  rejectCaseLineage
} from '../../api/judgmentResolution';

jest.mock('../../api/judgmentResolution', () => ({
  getCaseLineage: jest.fn(),
  proposeCaseLineage: jest.fn(),
  rejectCaseLineage: jest.fn(),
  acceptCaseLineage: jest.fn()
}));

jest.mock('../../hooks/useMotionPreferences', () => ({
  usePrefersReducedMotion: () => true
}));

const thread = {
  silent: false,
  knots: [{
    _id: 'link-1',
    fromPageId: '64f500000000000000000010',
    toPageId: '64f500000000000000000011',
    status: 'proposed',
    kind: 'assumption',
    object: { text: 'Lead times stay long.' },
    line: 'Compute stays scarce through 2027. also rests on Lead times stay long.',
    contradiction: false
  }],
  cut: [],
  contradictions: []
};

describe('Ariadne lineage', () => {
  it('lets a reader cut a proposed thread', async () => {
    getCaseLineage.mockResolvedValue(thread);
    rejectCaseLineage.mockResolvedValue({
      thread: { silent: true, knots: [], cut: [{ ...thread.knots[0], status: 'rejected' }], contradictions: [] }
    });
    render(
      <MemoryRouter>
        <AriadneLineage pageId="64f500000000000000000010" />
      </MemoryRouter>
    );
    expect(await screen.findByText(/rests on Lead times stay long/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cut it' }));
    await waitFor(() => expect(rejectCaseLineage).toHaveBeenCalledWith({
      pageId: '64f500000000000000000010',
      linkId: 'link-1'
    }));
    expect(document.querySelector('.ariadne-lineage')).toHaveClass('is-still');
  });

  it('refuses to thread without a named shared object', async () => {
    getCaseLineage.mockResolvedValue({ silent: true, knots: [], cut: [], contradictions: [] });
    render(
      <MemoryRouter>
        <AriadneLineage pageId="64f500000000000000000010" />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Thread a later case' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thread them' }));
    expect(proposeCaseLineage).not.toHaveBeenCalled();
  });
});
