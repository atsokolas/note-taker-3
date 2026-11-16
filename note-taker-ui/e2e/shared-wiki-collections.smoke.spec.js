const { test, expect } = require('@playwright/test');

const collections = ['how-to-think-about-ai', 'mental-models', 'behavioral-economics', 'value-investing'];

for (const slug of collections) {
  test(`${slug}: signed-out full reading and every entry round trip`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const collectionPath = `/share/wiki/collection/${slug}`;
    const publicResponse = page.waitForResponse(response => response.url().includes(`/api/public/wiki/collections/${slug}`));
    await page.goto(collectionPath);
    const publicPages = (await (await publicResponse).json()).collection.pages;
    const cards = page.locator('.shared-wiki-collection__page');
    await expect(cards.first()).toBeVisible();
    const sharing = page.locator('.shared-wiki-collection__sharing');
    await expect(sharing).not.toHaveAttribute('open', '');
    await sharing.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(sharing).toHaveAttribute('open', '');
    await expect(sharing).toContainText('Backlinks, highlights, source notes, and agent work stay private.');
    await page.keyboard.press('Enter');
    await expect(sharing).not.toHaveAttribute('open', '');
    const adopt = page.getByRole('button', { name: 'Add to my library', exact: true });
    const buttonBox = await adopt.boundingBox();
    const headerBox = await page.locator('.shared-wiki-page__hero').boundingBox();
    expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    expect(buttonBox.width).toBeLessThan(headerBox.width);

    const title = await page.locator('.shared-wiki-page__hero > h1').innerText();
    const entries = await cards.locator('.shared-wiki-collection__page-header h2 a').evaluateAll(links =>
      links.map(link => ({ title: link.textContent, href: link.getAttribute('href') }))
    );
    expect(entries.length).toBe(await cards.count());
    expect(entries.length).toBe(publicPages.length);
    expect(entries.length).toBeGreaterThan(0);
    for (const body of await page.locator('.shared-wiki-collection__page-preview').all()) {
      expect(await body.evaluate(element => ({
        clipped: element.scrollHeight > element.clientHeight + 1,
        mask: getComputedStyle(element).maskImage
      }))).toEqual({ clipped: false, mask: 'none' });
    }
    await cards.last().scrollIntoViewIfNeeded();
    await expect(cards.last()).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('collection.png'), fullPage: true });

    for (const [index, entry] of entries.entries()) {
      await page.locator('.shared-wiki-collection__page-header a').nth(index).click();
      await expect(page).toHaveURL(new RegExp(`${entry.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
      await expect(page.locator('.shared-wiki-page__hero > h1')).toHaveText(entry.title);
      const expectedPage = publicPages[index];
      const textOf = node => [node.text || '', ...(node.content || []).map(textOf)].join('');
      const normalize = text => text.replace(/\s+/g, ' ').trim();
      const rendered = normalize(await page.locator('.shared-wiki-page__body').innerText()).replace(/\[\d+(?:,\s*\d+)*\]/g, '');
      for (const block of expectedPage.body.content) {
        const blockText = normalize(textOf(block));
        if (blockText) expect(normalize(rendered)).toContain(blockText);
      }
      expect(await page.locator('.shared-wiki-page__sources li').count()).toBe(expectedPage.sourceRefs.length);
      expect(await page.locator('.shared-wiki-page__sources a').evaluateAll(links => links.map(link => link.getAttribute('href'))))
        .toEqual(expectedPage.sourceRefs.filter(source => source.url).map(source => source.url));
      await expect(page.getByRole('region', { name: 'References' })).toBeVisible();
      await page.goBack();
      await expect(page.locator('.shared-wiki-page__hero > h1')).toHaveText(title);
      await page.goForward();
      await expect(page.locator('.shared-wiki-page__hero > h1')).toHaveText(entry.title);
      await page.goto(entry.href); // direct URL, no router state from the collection
      await expect(page.locator('.shared-wiki-page__hero > h1')).toHaveText(entry.title);
      const references = page.getByRole('region', { name: 'References' });
      const citation = page.locator('.wiki-claim-citation').first();
      if (await citation.count()) {
        const target = await citation.getAttribute('data-footnote-target');
        await citation.click();
        await expect(page.locator(`[data-reference="${target}"]`)).toBeInViewport();
      }
      await references.scrollIntoViewIfNeeded();
      await expect(references).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`entry-${index}.png`), fullPage: true });
      await page.getByRole('link', { name: `Back to ${title}`, exact: true }).click();
      await expect(page.locator('.shared-wiki-page__hero > h1')).toHaveText(title);
    }
    expect(await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('authToken'))).toBeNull();
    await page.getByRole('button', { name: 'Add to my library', exact: true }).click();
    await expect(page).toHaveURL(/\/register$/);
    expect(await page.evaluate(() => sessionStorage.getItem('auth_return_to'))).toBe(`${collectionPath}?adopt=1`);
    expect(errors).toEqual([]);
  });
}
