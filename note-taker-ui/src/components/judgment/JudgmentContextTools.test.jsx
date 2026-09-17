import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import JudgmentContextTools from './JudgmentContextTools';

const Tool = ({ expanded, onExpandedChange, name }) => expanded ? (
  <section aria-labelledby={`${name}-title`}>
    <h2 id={`${name}-title`}>{name} context</h2>
  </section>
) : <section><button type="button" onClick={() => onExpandedChange(true)}>Open {name}</button></section>;

it('uses one URL-addressable context slot and Escape returns to the case', async () => {
  render(
    <MemoryRouter initialEntries={['/judgment/case-1']}>
      <JudgmentContextTools>
        <Tool contextId="lineage" name="lineage" />
        <Tool contextId="stress" name="stress" />
      </JudgmentContextTools>
    </MemoryRouter>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Open lineage' }));
  expect(await screen.findByRole('heading', { name: 'lineage context' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'stress context' })).not.toBeInTheDocument();
  expect(useNavigate()).toHaveBeenCalledWith(
    expect.objectContaining({ search: 'context=judgment-tool&contextTool=lineage' }),
    expect.objectContaining({ state: expect.objectContaining({ judgmentContextDepth: 1 }) })
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'lineage context' })).not.toBeInTheDocument());
});
