import {
  applyNotebookDoc,
  movePieceInDocument,
  pieceIndexForNode
} from '../../../utils/notebookArrangement';

export const moveBlockInDocument = (doc, currentIndex, direction = 'up') => {
  const pieceIndex = pieceIndexForNode(doc, currentIndex);
  const result = movePieceInDocument(doc, pieceIndex, direction);
  return {
    moved: result.moved,
    doc: result.doc,
    label: result.label || '',
    fromIndex: result.fromIndex,
    toIndex: result.toIndex
  };
};

export const moveCurrentBlock = (editor, direction = 'up') => {
  const currentIndex = editor?.state?.selection?.$from?.index?.(0);
  const doc = editor?.getJSON?.();
  const result = moveBlockInDocument(doc, currentIndex, direction);
  if (!result.moved) return false;
  applyNotebookDoc(editor, result.doc);
  return result;
};
