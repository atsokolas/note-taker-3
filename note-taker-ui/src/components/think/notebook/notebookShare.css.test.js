import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, 'notebookShare.css'), 'utf8');

const printRulesOf = (source) => {
  const start = source.indexOf('@media print');
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return '';
};

const printCss = printRulesOf(css);

describe('printed notebook paper', () => {
  it('resets ink tokens so a dark theme cannot print pale on white', () => {
    expect(printCss).toMatch(/--noeis-ink:\s*#1c1812/);
    expect(printCss).toMatch(/--noeis-ink-subtle:\s*#6b6458/);
    expect(printCss).toMatch(/--text-primary:\s*var\(--noeis-ink\)/);
    expect(printCss).toMatch(/--vellum-muted:\s*var\(--noeis-ink-subtle\)/);
    expect(printCss).toMatch(/--noeis-rule:\s*rgba\(28,\s*24,\s*18/);
    expect(printCss).toMatch(/background:\s*#fff/);
    expect(printCss).toMatch(/color-scheme:\s*light/);
    expect(printCss).toMatch(/\.notebook-essay__title/);
    expect(printCss).toMatch(/color:\s*var\(--noeis-ink\)\s*!important/);
    expect(printCss).toMatch(/\.notebook-essay__by/);
    expect(printCss).toMatch(/color:\s*var\(--noeis-ink-subtle\)\s*!important/);
    expect(printCss).not.toMatch(/#f1eadc/);
  });

  it('still hides chrome and writes public source doors', () => {
    expect(printCss).toMatch(/\.shared-notebook-page__home/);
    expect(printCss).toMatch(/\.shared-notebook-page__print/);
    expect(printCss).toMatch(/\.notebook-essay__copy/);
    expect(printCss).toMatch(/\.notebook-share,/);
    expect(printCss).toMatch(/content:\s*" · " attr\(href\)/);
    expect(printCss).toMatch(/\.notebook-essay__correction/);
    expect(printCss.slice(0, printCss.indexOf('--noeis-ink'))).not.toMatch(/correction/);
  });

  it('resolves paper tokens on the page even when html still holds dark ink', () => {
    const style = document.createElement('style');
    style.textContent = `${css}\n${printCss}`;
    document.head.appendChild(style);
    document.documentElement.setAttribute('data-noeis-theme', 'theme.editorial.dark');
    document.documentElement.style.setProperty('--noeis-ink', '#f1eadc');
    document.documentElement.style.setProperty('--noeis-ink-subtle', '#948b7d');
    document.documentElement.style.setProperty('--noeis-rule', 'rgba(223, 206, 166, 0.16)');
    document.body.innerHTML = `
      <main class="shared-notebook-page">
        <a class="shared-notebook-page__home" href="/">Noeis</a>
        <article class="notebook-essay">
          <h1 class="notebook-essay__title">Who gets to experiment, and who pays?</h1>
          <p class="notebook-essay__by">Shared by Athan</p>
          <blockquote class="notebook-essay__quote">
            <cite class="notebook-essay__source">
              <a href="https://example.com/letter">A letter on time</a>
            </cite>
            <p class="notebook-essay__copy"><button type="button">Copy with source</button></p>
          </blockquote>
        </article>
        <p class="shared-notebook-page__colophon">This is the version that was published.</p>
        <p class="shared-notebook-page__print"><button type="button">Print this note</button></p>
      </main>
    `;

    try {
      const page = document.querySelector('.shared-notebook-page');
      expect(getComputedStyle(document.documentElement).getPropertyValue('--noeis-ink').trim()).toBe('#f1eadc');
      expect(getComputedStyle(page).getPropertyValue('--noeis-ink').trim()).toBe('#1c1812');
      expect(getComputedStyle(page).getPropertyValue('--noeis-ink-subtle').trim()).toBe('#6b6458');
      expect(getComputedStyle(page).getPropertyValue('--text-primary').trim()).toBe('var(--noeis-ink)');
      expect(getComputedStyle(page).getPropertyValue('--vellum-muted').trim()).toBe('var(--noeis-ink-subtle)');
      expect(getComputedStyle(page).getPropertyValue('--noeis-rule').trim()).toBe('rgba(28, 24, 18, 0.18)');
      expect(getComputedStyle(page).backgroundColor).toBe('rgb(255, 255, 255)');
      expect(getComputedStyle(document.querySelector('.shared-notebook-page__print')).display).toBe('none');
      expect(getComputedStyle(document.querySelector('.shared-notebook-page__home')).display).toBe('none');
      expect(getComputedStyle(document.querySelector('.notebook-essay__copy')).display).toBe('none');
    } finally {
      style.remove();
      document.body.innerHTML = '';
      document.documentElement.removeAttribute('data-noeis-theme');
      document.documentElement.style.removeProperty('--noeis-ink');
      document.documentElement.style.removeProperty('--noeis-ink-subtle');
      document.documentElement.style.removeProperty('--noeis-rule');
    }
  });
});
