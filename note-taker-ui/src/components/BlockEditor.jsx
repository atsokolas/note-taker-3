import React, { useEffect, useMemo, useRef, useState } from 'react';

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

const createBlock = (overrides = {}) => ({
  id: createId(),
  type: 'paragraph',
  text: '',
  indent: 0,
  level: 1,
  highlightId: null,
  status: 'open',
  ...overrides
});

const focusAtEnd = (el) => {
  if (!el) return;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
};

const BlockEditor = ({ blocks, onChange }) => {
  const blockRefs = useRef({});
  const [pendingFocusId, setPendingFocusId] = useState(null);

  useEffect(() => {
    if (!pendingFocusId) return;
    const el = blockRefs.current[pendingFocusId];
    if (el) {
      requestAnimationFrame(() => focusAtEnd(el));
      setPendingFocusId(null);
    }
  }, [pendingFocusId, blocks]);

  useEffect(() => {
    if (!blocks || blocks.length === 0) {
      onChange([createBlock()]);
    }
  }, [blocks, onChange]);

  const updateBlocks = (updater) => {
    onChange(prev => (typeof updater === 'function' ? updater(prev) : updater));
  };

  const updateBlock = (id, updates) => {
    updateBlocks(prev => prev.map(block => (block.id === id ? { ...block, ...updates } : block)));
  };

  const insertBlockAfter = (index, block) => {
    updateBlocks(prev => {
      const next = [...prev];
      next.splice(index + 1, 0, block);
      return next;
    });
    setPendingFocusId(block.id);
  };

  const removeBlockAt = (index) => {
    updateBlocks(prev => {
      if (prev.length <= 1) return prev;
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  const handleKeyDown = (block, index) => (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextType = block.type === 'heading' ? 'paragraph' : block.type;
      const nextBlock = createBlock({
        type: nextType,
        indent: nextType === 'bullet' ? block.indent || 0 : 0,
        level: 1
      });
      insertBlockAfter(index, nextBlock);
      return;
    }

    if (e.key === 'Tab' && block.type === 'bullet') {
      e.preventDefault();
      const nextIndent = e.shiftKey ? Math.max(0, (block.indent || 0) - 1) : (block.indent || 0) + 1;
      updateBlock(block.id, { indent: nextIndent });
      return;
    }

    if (e.key === 'Backspace' && !block.text) {
      e.preventDefault();
      if (block.type === 'bullet' && block.indent > 0) {
        updateBlock(block.id, { indent: Math.max(0, block.indent - 1) });
        return;
      }
      const prevBlock = blocks[index - 1];
      removeBlockAt(index);
      if (prevBlock) {
        setPendingFocusId(prevBlock.id);
      }
    }
  };

  const handleInput = (block) => (e) => {
    const rawText = e.currentTarget.innerText.replace(/\n/g, '');
    let nextBlock = { ...block, text: rawText };
    let converted = false;

    if (block.type === 'paragraph') {
      if (rawText.startsWith('### ')) {
        nextBlock = { ...nextBlock, type: 'heading', level: 3, text: rawText.slice(4) };
        converted = true;
      } else if (rawText.startsWith('## ')) {
        nextBlock = { ...nextBlock, type: 'heading', level: 2, text: rawText.slice(3) };
        converted = true;
      } else if (rawText.startsWith('# ')) {
        nextBlock = { ...nextBlock, type: 'heading', level: 1, text: rawText.slice(2) };
        converted = true;
      } else if (rawText.startsWith('- ')) {
        nextBlock = { ...nextBlock, type: 'bullet', indent: 0, text: rawText.slice(2) };
        converted = true;
      } else if (rawText.startsWith('> ')) {
        nextBlock = { ...nextBlock, type: 'quote', text: rawText.slice(2) };
        converted = true;
      }
    }

    updateBlocks(prev => prev.map(b => (b.id === block.id ? nextBlock : b)));
    if (converted) {
      setPendingFocusId(block.id);
    }
  };

  const rowClass = useMemo(
    () => ({
      paragraph: 'block-row',
      bullet: 'block-row block-row-bullet',
      heading: 'block-row block-row-heading',
      quote: 'block-row block-row-quote',
      'highlight-ref': 'block-row block-row-highlight',
      question: 'block-row block-row-question'
    }),
    []
  );

  return (
    <div className="block-editor">
      {blocks.map((block, index) => (
        <div
          key={block.id}
          className={rowClass[block.type] || 'block-row'}
          style={block.type === 'bullet' ? { paddingLeft: `${12 + (block.indent || 0) * 16}px` } : undefined}
        >
          {block.type === 'bullet' && <span className="block-bullet-dot">•</span>}
          <div
            ref={(el) => { blockRefs.current[block.id] = el; }}
            className={`block-content ${block.type === 'heading' ? `block-heading-${block.level || 1}` : ''}`}
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Write something…"
            onInput={handleInput(block)}
            onKeyDown={handleKeyDown(block, index)}
          >
            {block.text}
          </div>
        </div>
      ))}
    </div>
  );
};

export default BlockEditor;
