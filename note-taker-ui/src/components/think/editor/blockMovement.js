export const moveBlockInDocument = (doc, currentIndex, direction = 'up') => {
  const content = Array.isArray(doc?.content) ? [...doc.content] : [];
  if (!Number.isInteger(currentIndex) || content.length < 2) {
    return { moved: false, doc };
  }

  const delta = direction === 'down' ? 1 : -1;
  const targetIndex = currentIndex + delta;
  if (targetIndex < 0 || targetIndex >= content.length) {
    return { moved: false, doc };
  }

  [content[currentIndex], content[targetIndex]] = [content[targetIndex], content[currentIndex]];

  return {
    moved: true,
    doc: {
      ...doc,
      content
    }
  };
};

export const moveCurrentBlock = (editor, direction = 'up') => {
  const currentIndex = editor?.state?.selection?.$from?.index?.(0);
  const doc = editor?.getJSON?.();
  const result = moveBlockInDocument(doc, currentIndex, direction);
  if (!result.moved) return false;
  editor?.commands?.setContent?.(result.doc, false);
  return true;
};
