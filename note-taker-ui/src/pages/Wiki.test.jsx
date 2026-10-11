import React from 'react';
import { render, screen } from '@testing-library/react';
import Wiki from './Wiki';

jest.mock('../components/wiki/WikiWorkspace', () => () => <div data-testid="wiki-workspace">Wiki workspace</div>);

describe('Wiki workspace route', () => {
  it('renders the workspace', async () => {
    render(<Wiki />);
    expect(await screen.findByTestId('wiki-workspace')).toBeInTheDocument();
  });
});
