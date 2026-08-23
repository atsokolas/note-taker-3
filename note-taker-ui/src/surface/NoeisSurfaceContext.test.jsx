import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NoeisSurfaceProvider, useNoeisSurface, useNoeisSurfaceState } from './NoeisSurfaceContext';

const DeclaredSurfaceProbe = () => {
  useNoeisSurface({
    room: 'think',
    objectType: 'notebook',
    objectId: 'note-1',
    title: 'A working note'
  });
  const { surface } = useNoeisSurfaceState();
  return <output data-testid="surface">{JSON.stringify(surface)}</output>;
};

describe('NoeisSurfaceProvider', () => {
  it('starts with route identity and accepts an exact object declaration', async () => {
    render(
      <MemoryRouter initialEntries={['/think']}>
        <NoeisSurfaceProvider>
          <DeclaredSurfaceProbe />
        </NoeisSurfaceProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(JSON.parse(screen.getByTestId('surface').textContent)).toEqual(
      expect.objectContaining({ room: 'think', objectId: 'note-1', title: 'A working note' })
    ));
  });
});
