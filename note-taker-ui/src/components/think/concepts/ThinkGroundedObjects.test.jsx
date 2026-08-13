import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ThinkGroundedObjects, { highlightPath, objectPath, toDraftCard } from './ThinkGroundedObjects';
import useConceptMaterial from '../../../hooks/useConceptMaterial';
import useConceptWorkspace from '../../../hooks/useConceptWorkspace';
import { attachConceptWorkspaceBlock, updateConceptWorkspaceBlock } from '../../../api/concepts';

jest.mock('../../../hooks/useConceptMaterial');
jest.mock('../../../hooks/useConceptWorkspace');
jest.mock('../../../api/concepts', () => ({
  attachConceptWorkspaceBlock: jest.fn(),
  updateConceptWorkspaceBlock: jest.fn()
}));

const highlight = {
  _id: 'highlight-1',
  articleId: 'article-1',
  articleTitle: 'Exact source',
  text: 'A claim carried from the Library.'
};

const setup = ({ attachedItems = [] } = {}) => {
  const setWorkspace = jest.fn();
  const refreshWorkspace = jest.fn().mockResolvedValue(undefined);
  const refreshMaterial = jest.fn().mockResolvedValue(undefined);
  useConceptMaterial.mockReturnValue({
    material: { pinnedHighlights: [highlight], recentHighlights: [], linkedArticles: [], linkedNotes: [] },
    loading: false,
    error: '',
    refresh: refreshMaterial
  });
  useConceptWorkspace.mockReturnValue({
    workspace: { attachedItems },
    loading: false,
    error: '',
    setWorkspace,
    refresh: refreshWorkspace
  });
  return { setWorkspace, refreshWorkspace, refreshMaterial };
};

beforeEach(() => jest.clearAllMocks());

test('builds an exact Library return path and draft card identity', () => {
  expect(highlightPath(highlight)).toBe('/library?articleId=article-1&highlightId=highlight-1');
  expect(toDraftCard(highlight)).toEqual(expect.objectContaining({
    objectId: 'highlight-1',
    sourceKey: 'highlight:highlight-1',
    origin: 'library'
  }));
});

test('persists an unattached highlight before placing it in the draft', async () => {
  const onInsert = jest.fn();
  setup();
  attachConceptWorkspaceBlock.mockResolvedValue({ workspace: { attachedItems: [{ id: 'block-1' }] } });
  render(<ThinkGroundedObjects conceptId="concept-1" onInsert={onInsert} />);

  fireEvent.click(screen.getByRole('button', { name: 'Insert at cursor' }));

  await waitFor(() => expect(attachConceptWorkspaceBlock).toHaveBeenCalledWith('concept-1', {
    type: 'highlight',
    refId: 'highlight-1',
    sectionId: 'working',
    stage: 'working',
    inlineTitle: 'Exact source',
    inlineText: 'A claim carried from the Library.'
  }));
  expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ objectId: 'highlight-1' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Inserted at the cursor'));
});

test('maps every retrievable object to an exact return path', () => {
  expect(objectPath({ type: 'article', refId: 'article-1' })).toBe('/library?articleId=article-1');
  expect(objectPath({ type: 'notebook', refId: 'note-1' })).toBe('/think?tab=notebook&entryId=note-1');
  expect(objectPath({ type: 'question', refId: 'question-1' })).toBe('/think?tab=questions&questionId=question-1');
  expect(objectPath({ type: 'concept', refId: 'concept-2', title: 'Never use this as identity' }))
    .toBe('/think?tab=concepts&conceptId=concept-2');
  expect(objectPath({ type: 'wiki_page', refId: 'page-1' })).toBe('/wiki/workspace?page=page-1');
  expect(objectPath({ type: 'wiki_claim', refId: 'page-1:claim:with:colons' }))
    .toBe('/wiki/workspace?page=page-1&claimId=claim%3Awith%3Acolons');
});

test('persists a retrieved wiki claim with inline context and restores its exact source', async () => {
  const onInsert = jest.fn();
  setup();
  attachConceptWorkspaceBlock.mockResolvedValue({ workspace: { attachedItems: [{ id: 'claim-block' }] } });
  render(
    <ThinkGroundedObjects
      conceptId="concept-1"
      candidates={[{
        type: 'wiki_claim',
        id: 'page-1:claim-7',
        title: 'Margin of safety',
        snippet: 'Price must remain below conservative value.'
      }]}
      onInsert={onInsert}
    />
  );

  const claimRow = screen.getByText('Wiki claim · retrieved').closest('li');
  expect(claimRow).toHaveTextContent('Margin of safety');
  expect(claimRow.querySelector('a')).toHaveAttribute('href', '/wiki/workspace?page=page-1&claimId=claim-7');
  fireEvent.click(claimRow.querySelector('button'));

  await waitFor(() => expect(attachConceptWorkspaceBlock).toHaveBeenCalledWith('concept-1', {
    type: 'wiki_claim',
    refId: 'page-1:claim-7',
    sectionId: 'working',
    stage: 'working',
    inlineTitle: 'Margin of safety',
    inlineText: 'Price must remain below conservative value.'
  }));
  expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({
    sourceKey: 'wiki_claim:page-1:claim-7',
    objectId: 'page-1:claim-7',
    workspaceAttached: true
  }));
});

test('provides a native drag payload for exact-position notebook insertion', () => {
  setup();
  render(<ThinkGroundedObjects conceptId="concept-1" variant="rail" />);
  const setData = jest.fn();
  fireEvent.dragStart(screen.getByRole('listitem'), {
    dataTransfer: { setData, effectAllowed: '' }
  });

  expect(setData).toHaveBeenCalledWith('application/x-noeis-card-id', 'highlight:highlight-1');
  const jsonCall = setData.mock.calls.find(([type]) => type === 'application/x-noeis-card-json');
  expect(JSON.parse(jsonCall[1])).toEqual(expect.objectContaining({
    sourceKey: 'highlight:highlight-1',
    workspaceAttached: false,
    workspaceRef: expect.objectContaining({ type: 'highlight', refId: 'highlight-1' })
  }));
});

test('renders a durable mixed object from workspace inline context after reload', () => {
  setup({
    attachedItems: [{
      id: 'question-block',
      type: 'question',
      refId: 'question-1',
      inlineTitle: 'What would change my mind?',
      inlineText: 'Find disconfirming evidence.',
      sectionId: 'working',
      order: 0
    }]
  });
  render(<ThinkGroundedObjects conceptId="concept-1" />);

  expect(screen.getByText('Question · in working set')).toBeInTheDocument();
  expect(screen.getByText('Find disconfirming evidence.')).toBeInTheDocument();
  const questionRow = screen.getByText('Question · in working set').closest('li');
  expect(questionRow.querySelector('a'))
    .toHaveAttribute('href', '/think?tab=questions&questionId=question-1');
});

test('does not duplicate the attach POST after reload and supports keyboard reordering', async () => {
  const attachedItems = [
    { id: 'block-1', type: 'highlight', refId: 'highlight-1', sectionId: 'working', order: 0 },
    { id: 'block-2', type: 'highlight', refId: 'highlight-2', sectionId: 'working', order: 1 }
  ];
  useConceptMaterial.mockReturnValue({
    material: {
      pinnedHighlights: [highlight, { ...highlight, _id: 'highlight-2', text: 'Second source.' }],
      recentHighlights: [], linkedArticles: [], linkedNotes: []
    },
    loading: false,
    error: '',
    refresh: jest.fn().mockResolvedValue(undefined)
  });
  useConceptWorkspace.mockReturnValue({
    workspace: { attachedItems }, loading: false, error: '', setWorkspace: jest.fn(), refresh: jest.fn()
  });
  updateConceptWorkspaceBlock.mockResolvedValue({ workspace: { attachedItems } });
  const onInsert = jest.fn();
  render(<ThinkGroundedObjects conceptId="concept-1" onInsert={onInsert} />);

  fireEvent.click(screen.getAllByRole('button', { name: 'Insert at cursor' })[0]);
  await waitFor(() => expect(onInsert).toHaveBeenCalled());
  expect(attachConceptWorkspaceBlock).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Insert at cursor' })[0]).toBeEnabled());

  fireEvent.keyDown(screen.getAllByRole('listitem')[1], { key: 'ArrowUp', altKey: true });
  await waitFor(() => expect(updateConceptWorkspaceBlock).toHaveBeenCalledWith('concept-1', 'block-2', {
    sectionId: 'working',
    order: 0
  }));
});
