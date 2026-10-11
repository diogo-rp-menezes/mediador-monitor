const { chromium } = require('playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(__dirname, 'workspace-conceito.html')).href);
    await page.screenshot({ path: path.join(__dirname, 'workspace-desktop.png'), fullPage: true });
    await page.click('[data-action="nav:records"]');
    await page.screenshot({ path: path.join(__dirname, 'workspace-registros.png'), fullPage: true });
    await page.click('[data-action="review"]');
    if (!await page.locator('dialog').isVisible()) throw Error('Modal ausente');
    await page.keyboard.press('Escape');
    await page.selectOption('#office', 'gconta');
    if (!await page.getByText('Nenhum documento por aqui').isVisible()) throw Error('Contexto vazio ausente');
    await page.click('[data-action="nav:overview"]');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(__dirname, 'workspace-mobile.png'), fullPage: true });
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await page.click('#profile');
    await page.keyboard.press('Escape');
    await page.click('#theme');
    console.log(JSON.stringify({ errors, mobileOverflow, modal: true, contextSwitch: true }));
    if (errors.length || mobileOverflow) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
