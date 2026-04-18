import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applySlashCommand,
  filterSlashCommandItems,
  getNextSlashCommandIndex,
  getSlashCommandItems,
  getSlashCommandMatch
} from './slashCommands';

const CLOSED_MENU = {
  open: false,
  items: [],
  activeIndex: 0,
  query: '',
  range: null,
  position: { top: 0, left: 0 }
};

const clampMenuLeft = (left, containerWidth) => {
  if (!containerWidth) return 12;
  return Math.min(Math.max(12, left), Math.max(12, containerWidth - 304));
};

const getTextBeforeCursor = (selection) => {
  const parentText = selection.$from.parent?.textContent || '';
  return parentText.slice(0, selection.$from.parentOffset);
};

const useSlashCommands = ({
  editor,
  variant = 'full',
  containerRef,
  extraItems = []
}) => {
  const [menu, setMenu] = useState(CLOSED_MENU);
  const items = useMemo(() => getSlashCommandItems(variant, extraItems), [extraItems, variant]);

  const closeMenu = useCallback(() => {
    setMenu((current) => (current.open ? CLOSED_MENU : current));
  }, []);

  const selectCommand = useCallback((command) => {
    setMenu((current) => {
      if (!current.range) return CLOSED_MENU;
      applySlashCommand({ editor, command, range: current.range });
      return CLOSED_MENU;
    });
  }, [editor]);

  const refreshMenu = useCallback(() => {
    if (!editor || !containerRef?.current) {
      closeMenu();
      return;
    }

    const { state, view } = editor;
    if (!state?.selection || !view?.coordsAtPos) {
      closeMenu();
      return;
    }

    if (!state.selection.empty) {
      closeMenu();
      return;
    }

    const textBeforeCursor = getTextBeforeCursor(state.selection);
    const match = getSlashCommandMatch(textBeforeCursor);
    if (!match) {
      closeMenu();
      return;
    }

    const filteredItems = filterSlashCommandItems(items, match.query);
    const range = {
      from: state.selection.from - (match.query.length + 1),
      to: state.selection.from
    };
    const coords = view.coordsAtPos(state.selection.from);
    const rect = containerRef.current.getBoundingClientRect();
    const nextPosition = {
      top: coords.bottom - rect.top + 10,
      left: clampMenuLeft(coords.left - rect.left, rect.width)
    };

    setMenu((current) => ({
      open: true,
      items: filteredItems,
      activeIndex: filteredItems.length > 0 ? Math.min(current.activeIndex, filteredItems.length - 1) : 0,
      query: match.query,
      range,
      position: nextPosition
    }));
  }, [closeMenu, containerRef, editor, items]);

  const onKeyDown = useCallback((_view, event) => {
    if (!menu.open) return false;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setMenu((current) => ({
        ...current,
        activeIndex: getNextSlashCommandIndex({
          currentIndex: current.activeIndex,
          itemCount: current.items.length,
          key: event.key
        })
      }));
      return true;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const selectedItem = menu.items[menu.activeIndex];
      if (selectedItem) {
        selectCommand(selectedItem);
      } else {
        closeMenu();
      }
      return true;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return true;
    }

    return false;
  }, [closeMenu, menu.activeIndex, menu.items, menu.open, selectCommand]);

  useEffect(() => {
    if (!editor) return undefined;

    refreshMenu();
    editor.on?.('update', refreshMenu);
    editor.on?.('selectionUpdate', refreshMenu);
    editor.on?.('blur', closeMenu);

    return () => {
      editor.off?.('update', refreshMenu);
      editor.off?.('selectionUpdate', refreshMenu);
      editor.off?.('blur', closeMenu);
    };
  }, [closeMenu, editor, refreshMenu]);

  return {
    menu,
    closeMenu,
    onKeyDown,
    selectCommand
  };
};

export default useSlashCommands;
