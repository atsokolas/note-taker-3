import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LegalDocument from './LegalDocument';
import legalContent from './legalContent.json';

const plain = (text) => text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

describe('published NOEIS information', () => {
  it.each(Object.keys(legalContent))('renders every approved paragraph and link on /%s', (page) => {
    render(<MemoryRouter><LegalDocument page={page} /></MemoryRouter>);
    const content = legalContent[page];
    const article = screen.getByRole('article', { name: content.title });
    expect(within(article).getByRole('heading', { level: 1 })).toHaveTextContent(content.title);
    expect(within(article).getByText('Last updated October 11, 2026.')).toBeInTheDocument();
    content.sections.forEach(({ heading, paragraphs }) => {
      expect(within(article).getByRole('heading', { name: heading })).toBeInTheDocument();
      paragraphs.forEach((paragraph) => {
        expect(Array.from(article.querySelectorAll('p')).some((p) => p.textContent === plain(paragraph))).toBe(true);
        Array.from(paragraph.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)).forEach(([, label, href]) => {
          expect(within(article).getAllByRole('link', { name: label }).some((a) => a.getAttribute('href') === href)).toBe(true);
        });
      });
    });
    const nav = screen.getByRole('navigation', { name: 'NOEIS information' });
    Object.entries(legalContent).filter(([key]) => key !== page).forEach(([key, other]) => {
      expect(within(nav).getByRole('link', { name: other.title })).toHaveAttribute('href', `/${key}`);
    });
    expect(article).not.toHaveTextContent('Owner recording instructions');
    expect(article).not.toHaveTextContent('policy starter');
  });
});
