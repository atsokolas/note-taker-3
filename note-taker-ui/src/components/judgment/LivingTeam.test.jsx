import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LivingTeam from './LivingTeam';
import { SystemStatusProvider } from '../../system/SystemStatusContext';
import {
  approveLivingTeamVersion,
  getLivingTeam,
  grantLivingTeamSeat,
  handOffLivingTeam
} from '../../api/judgmentResolution';

jest.mock('../../api/judgmentResolution', () => ({
  getLivingTeam: jest.fn(),
  grantLivingTeamSeat: jest.fn(),
  approveLivingTeamVersion: jest.fn(),
  handOffLivingTeam: jest.fn()
}));

jest.mock('../../hooks/useMotionPreferences', () => ({
  usePrefersReducedMotion: () => true
}));

const team = {
  visible: true,
  mandate: {
    purpose: 'Hold compute scarce until prices speak.',
    exposure: 'least',
    exposureLabel: 'The overlay names that minds part, not the private notes.'
  },
  members: [
    { userId: 'host', pageId: 'page-host', label: 'Athan', roles: ['administer'], self: true },
    { userId: 'reader', pageId: 'page-reader', label: 'Sam', roles: ['decide'], self: false }
  ],
  positions: [
    {
      userId: 'user-host',
      pageId: '64f500000000000000000010',
      label: 'Athan',
      claim: 'Compute stays scarce through 2027.',
      confidence: 'certain',
      decisionRight: true,
      action: { posture: 'watch' },
      assumptions: ['Lead times stay long.'],
      self: true
    },
    {
      userId: 'user-reader',
      pageId: '64f500000000000000000011',
      label: 'Sam',
      claim: 'Compute eases in two regions.',
      confidence: 'probable',
      decisionRight: true,
      action: { posture: 'act' },
      assumptions: ['Fabs arrive on time.'],
      self: false
    }
  ],
  dissent: [{
    left: { userId: 'user-host', label: 'Athan', pageId: '64f500000000000000000010' },
    right: { userId: 'user-reader', label: 'Sam', pageId: '64f500000000000000000011' },
    parted: ['assumptions', 'interpretation', 'action']
  }],
  brief: {
    silent: false,
    sentences: [
      {
        kind: 'fact',
        text: 'Sam was named to decide.',
        record: { type: 'audit', pageId: '64f500000000000000000010' }
      },
      {
        kind: 'inference',
        text: 'Athan and Sam part on interpretation.',
        record: { type: 'dissent', pageId: '64f500000000000000000011' }
      },
      {
        kind: 'unknown',
        text: 'Does conversion slip in 2027?',
        record: { type: 'unknown', pageId: '64f500000000000000000010' }
      }
    ]
  },
  approvals: [{
    receiptId: 'r1',
    actor: { label: 'Athan' },
    at: '2026-08-01T12:00:00.000Z',
    object: { versionHash: 'abcdef123456' },
    supersededBy: 'superseded:r1',
    conditions: 'If conversion holds.'
  }],
  handoffs: [{
    from: { label: 'Athan', pageId: '64f500000000000000000010' },
    to: { label: 'Sam', pageId: '64f500000000000000000011' },
    fromAuthorshipIntact: true,
    walk: [{
      kind: 'posture',
      title: 'The held sentence',
      text: 'Compute stays scarce through 2027.',
      record: { pageId: '64f500000000000000000010' }
    }]
  }],
  authority: {
    observe: { allowed: true, label: 'You may read the overlay.' },
    approve: { allowed: true, label: 'You may approve this version — you administer this case.' },
    administer: { allowed: true, label: 'You may name rights on this case.' }
  }
};

const controls = {
  setBackgroundWork: jest.fn(),
  setLatestReceipt: jest.fn(),
  clearRecentReceipts: jest.fn(),
  setRecoverableFailure: jest.fn(),
  clearRecoverableFailure: jest.fn(),
  resetSystemStatus: jest.fn()
};

const renderRoom = () => render(
  <MemoryRouter>
    <SystemStatusProvider value={controls}>
      <LivingTeam pageId="64f500000000000000000010" />
    </SystemStatusProvider>
  </MemoryRouter>
);

describe('the living team', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getLivingTeam.mockResolvedValue(team);
    grantLivingTeamSeat.mockResolvedValue({ team, receipt: { id: 'g1', title: 'A right was named', summary: 'Sam may decide.' } });
    approveLivingTeamVersion.mockResolvedValue({
      team: { ...team, approvals: [{ ...team.approvals[0], supersededBy: null }] },
      receipt: { id: 'a1', title: 'A version was approved', summary: 'Approved.' }
    });
    handOffLivingTeam.mockResolvedValue({ team, receipt: { id: 'h1', title: 'The case was handed on', summary: 'Walk.' } });
  });

  it('renders the overlay, dissent, brief, and walk without collab chrome', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('Compute eases in two regions.')).toBeInTheDocument());
    expect(screen.getAllByText('Compute stays scarce through 2027.').length).toBeGreaterThan(0);
    expect(screen.getByText(/Athan and Sam part on assumptions/)).toBeInTheDocument();
    expect(screen.getByText('Before the room begins')).toBeInTheDocument();
    expect(screen.getByText('Does conversion slip in 2027?')).toBeInTheDocument();
    expect(screen.getByText(/paper has moved/)).toBeInTheDocument();
    expect(screen.getByText(/Departed authorship is intact/)).toBeInTheDocument();
    expect(screen.getByText(/You may approve this version/)).toBeInTheDocument();
    expect(screen.queryByText(/toast|like|chat|task/i)).not.toBeInTheDocument();
    expect(document.querySelector('.living-team')).toHaveClass('is-still');
  });

  it('lets the host name a seat onto the overlay', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('Name a seat')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('How they are named'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Their page'), { target: { value: '64f500000000000000000011' } });
    fireEvent.submit(screen.getByText('Name them').closest('form'));
    await waitFor(() => expect(grantLivingTeamSeat).toHaveBeenCalledWith({
      pageId: '64f500000000000000000010',
      memberPageId: '64f500000000000000000011',
      label: 'Sam',
      roles: ['observe']
    }));
    expect(controls.setLatestReceipt).toHaveBeenCalled();
  });

  it('names authority when approving and records a receipt, not a toast', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('Approve this version')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Conditions, if any'), { target: { value: 'If conversion holds.' } });
    fireEvent.submit(screen.getByText('Approve this version').closest('form'));
    await waitFor(() => expect(approveLivingTeamVersion).toHaveBeenCalledWith({
      pageId: '64f500000000000000000010',
      conditions: 'If conversion holds.'
    }));
    expect(controls.setLatestReceipt).toHaveBeenCalled();
    expect(screen.queryByText(/toast/i)).not.toBeInTheDocument();
  });

  it('hands the case on as a guided walk', async () => {
    renderRoom();
    await waitFor(() => expect(screen.getByText('Hand the case on')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Successor’s name'), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText('Successor’s page'), {
      target: { value: '64f500000000000000000011' }
    });
    fireEvent.submit(screen.getByText('Hand it on').closest('form'));
    await waitFor(() => expect(handOffLivingTeam).toHaveBeenCalled());
  });
});
