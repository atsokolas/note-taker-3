import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import PublicProofGallery, { buildPublicProofGallerySchema } from './PublicProofGallery';
import { getPublicWikiCollection } from '../api/wiki';

jest.mock('../api/wiki', () => ({
  getPublicWikiCollection: jest.fn()
}));

const collectionPayload = (id, name, description, pageTitle = 'Margin of Safety') => ({
  collection: {
    _id: id,
    name,
    description,
    slug: id,
    pages: [
      {
        _id: `${id}-page-1`,
        title: pageTitle,
        sourceCount: 2,
        claimCount: 3,
        wordCount: 180,
        lastReviewedAt: '2026-07-04T00:00:00.000Z',
        updatedAt: '2026-07-03T00:00:00.000Z'
      },
      {
        _id: `${id}-page-2`,
        title: 'Circle of Competence',
        sourceCount: 1,
        claimCount: 2,
        wordCount: 120,
        lastReviewedAt: '2026-07-02T00:00:00.000Z'
      }
    ]
  }
});

describe('PublicProofGallery', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    getPublicWikiCollection.mockImplementation(async (id) => collectionPayload(
      id,
      id === 'value-investing' ? 'Value Investing' : id,
      'A maintained public proof collection.'
    ));
  });

  it('renders public living dossiers with maintenance stamps and safe links', async () => {
    render(
      <MemoryRouter initialEntries={['/proof']}>
        <PublicProofGallery />
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading public proof pages');
    expect(await screen.findByRole('heading', { name: 'Living research dossiers, not generated pages.' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Value Investing' })).toBeInTheDocument();
    expect(getPublicWikiCollection).toHaveBeenCalledWith('value-investing');
    expect(getPublicWikiCollection).toHaveBeenCalledWith('mental-models');
    expect(screen.getAllByText(/Maintained by the owner's agent/i).length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText(/Last reviewed Jul 4, 2026/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: 'Open public dossier' })[0]).toHaveAttribute('href', '/share/wiki/collection/value-investing');
    await waitFor(() => expect(document.title).toBe('Living Research Dossiers | Noeis'));
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.noeis.io/proof');
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
    const schema = JSON.parse(document.getElementById('seo-schema').textContent);
    expect(schema).toEqual(expect.objectContaining({
      '@type': 'CollectionPage',
      name: 'Living Research Dossiers',
      mainEntityOfPage: 'https://www.noeis.io/proof'
    }));
    expect(schema.mainEntity.numberOfItems).toBe(4);
  });

  it('keeps the page useful when one public collection is unavailable', async () => {
    getPublicWikiCollection.mockImplementation(async (id) => {
      if (id === 'value-investing') throw new Error('not ready');
      return collectionPayload(id, id, 'A maintained public proof collection.');
    });

    render(
      <MemoryRouter initialEntries={['/proof']}>
        <PublicProofGallery />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'mental-models' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Value Investing' })).not.toBeInTheDocument();
  });
});

describe('buildPublicProofGallerySchema', () => {
  it('builds CollectionPage schema for public proof dossiers', () => {
    const schema = buildPublicProofGallerySchema([
      {
        name: 'Value Investing',
        href: '/share/wiki/collection/value-investing',
        description: 'Maintained value investing pages.'
      }
    ]);

    expect(schema).toEqual(expect.objectContaining({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      url: 'https://www.noeis.io/proof',
      isAccessibleForFree: true
    }));
    expect(schema.mainEntity.itemListElement[0]).toEqual(expect.objectContaining({
      '@type': 'ListItem',
      position: 1,
      name: 'Value Investing',
      url: 'https://www.noeis.io/share/wiki/collection/value-investing'
    }));
  });
});
