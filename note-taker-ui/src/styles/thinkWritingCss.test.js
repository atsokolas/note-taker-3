import fs from 'fs';
import path from 'path';

describe('Think writing focus mode', () => {
  const css = fs.readFileSync(path.join(__dirname, 'think-writing.css'), 'utf8');

  it('keeps the words where they are while the room steps away', () => {
    const notes = fs.readFileSync(path.join(__dirname, 'think-notes.css'), 'utf8');
    expect(notes).toContain('grid-template-columns: var(--notes-width) var(--alternatives-width) minmax(0, 1fr) var(--drawer-width)');
    // Writing fades the rails; it never resizes a column, so the text cannot move.
    expect(notes).not.toMatch(/think-rails-away[^{]*\{[^}]*--notes-width/);
    expect(notes).not.toMatch(/think-rails-away[^{]*\{[^}]*--drawer-width/);
    expect(css).not.toMatch(/think-rails-away[^{]*\{[^}]*(width|grid-template-columns)/);
    expect(css).toContain('body:is(.think-rails-away, .think-focus-held) [data-writing-rail] > *');
    expect(css).toMatch(/body\.think-rails-away :is\(\.topbar, \.think-notes__toggles, \.agent-rail-drawer__trigger, \.notebook-arrangement, \.think-focus-mode--rail\) \{[^}]*opacity: 0;/);
  });

  it('fades only when motion is welcome', () => {
    expect(css).toContain('@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    expect(css).not.toContain('content: attr(data-writing-rail-label)');
  });

  it('lets the Think More menu grow the header instead of overlaying the title', () => {
    const notes = fs.readFileSync(path.join(__dirname, 'think-notes.css'), 'utf8');
    const moreMenu = notes.match(/\.think-notebook-utility__more > div \{[^}]+\}/);
    expect(moreMenu?.[0]).toBeTruthy();
    expect(moreMenu?.[0]).not.toMatch(/position:\s*absolute/);
    expect(notes).toMatch(/\.think-notebook-utility__more > summary::-webkit-details-marker/);
    expect(notes).not.toMatch(/@media \(max-width: 760px\)[\s\S]*\.think-notes \.think-notebook-utility \{[^}]*overflow-x:\s*auto;/);
  });

  it('responds to the column rather than the window', () => {
    const notes = fs.readFileSync(path.join(__dirname, 'think-notes.css'), 'utf8');
    expect(notes).toContain('container: noeis-column / inline-size;');
    expect(notes).toContain('@container noeis-column (max-width: 1280px)');
    expect(notes).toContain('@container noeis-column (max-width: 760px)');
    expect(notes).toContain('@container noeis-column (max-width: 1040px)');
  });

  it('styles quiet saved-alternative marks without spellcheck chrome', () => {
    const notes = fs.readFileSync(path.join(__dirname, 'think-notes.css'), 'utf8');
    expect(notes).toContain('height: 100dvh;');
    expect(notes).toContain('.app-shell-new__body:has(.think-notes)');
    expect(notes).toContain('.notebook-saved-alternatives__range');
    expect(notes).toContain('pointer-events: none;');
    expect(notes).toContain('.notebook-saved-alternatives__mark');
    expect(notes).toContain('border-right: 1.5px solid var(--noeis-pointer');
  });

  it('keeps notebook arrangement off the essay until a small right-rail mark is opened', () => {
    expect(css).toContain('.notebook-arrangement {');
    expect(css).toContain('right: 0;');
    expect(css).toContain('.notebook-arrangement__mark {');
    expect(css).toContain('.notebook-arrangement__panel {');
    expect(css).toContain('.notebook-arrangement.is-above .notebook-arrangement__panel');
    expect(css).toContain('@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    expect(css).toContain('animation: notebook-arrangement-in');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.notebook-arrangement,[\s\S]*animation: none !important;/);
    expect(css).not.toContain('.notebook-arrangement__kicker');
    expect(css).not.toContain('.notebook-arrangement__pieces');
    expect(css).not.toContain('.notebook-arrangement__copy');
    expect(css).not.toContain('.think-notebook-editor__body.is-editing');
    expect(css).not.toContain('padding-top: 2.75rem;');
  });
});
