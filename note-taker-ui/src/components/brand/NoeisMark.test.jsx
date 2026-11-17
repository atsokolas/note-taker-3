import React from 'react';
import { render } from '@testing-library/react';
import NoeisMark from './NoeisMark';

test('the decorative mark inherits the surrounding theme without duplicating its accessible name', () => {
  const { container } = render(<a href="/wiki"><NoeisMark size={22} />Noeis</a>);
  const mark = container.querySelector('[aria-hidden="true"]');
  expect(mark).toHaveStyle({ width: '22px', height: '22px', background: 'currentColor' });
  expect(mark.style.mask).toContain('no-repeat');
  expect(container.querySelector('a')).toHaveTextContent('Noeis');
});
