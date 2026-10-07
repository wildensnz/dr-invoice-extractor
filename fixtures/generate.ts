/**
 * `npm run fixtures` — renders the 30 synthetic invoices to
 * fixtures/invoices/NNNN.{pdf,png,json} and copies four of them to
 * public/samples for the UI. Requires `npx playwright install chromium`.
 */
import { mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { generateFixtures, type Fixture, type Template } from './data';
import { buildView, renderTemplate } from './render';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'fixtures', 'invoices');
const SAMPLES_DIR = path.join(ROOT, 'public', 'samples');
const TEMPLATES_DIR = path.join(ROOT, 'fixtures', 'templates');

/** Fixture ids copied to public/samples (one per template + one e-CF). */
export const SAMPLE_IDS = ['0001', '0002', '0003', '0008'];

const VIEWPORT: Record<Template, { width: number; height: number }> = {
  classic: { width: 794, height: 1123 },
  modern: { width: 794, height: 1123 },
  thermal: { width: 302, height: 600 },
};

/** Chromium stamps creation/modification dates; pin them so bytes are stable. */
function pinPdfDates(pdf: Buffer): Buffer {
  const text = pdf.toString('latin1');
  const pinned = text.replace(/\(D:\d{14}/g, '(D:20260101000000');
  return Buffer.from(pinned, 'latin1');
}

async function renderFixture(
  page: Page,
  fixture: Fixture,
  templates: Record<Template, string>,
): Promise<void> {
  const html = renderTemplate(templates[fixture.template], buildView(fixture));
  await page.setViewportSize(VIEWPORT[fixture.template]);
  await page.setContent(html, { waitUntil: 'load' });

  const base = path.join(OUT_DIR, fixture.id);
  const png = await page.screenshot({ fullPage: true, type: 'png' });
  await writeFile(`${base}.png`, png);

  const pdf =
    fixture.template === 'thermal'
      ? await page.pdf({
          width: '80mm',
          height: `${await page.evaluate(() => document.body.scrollHeight)}px`,
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        })
      : await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        });
  await writeFile(`${base}.pdf`, pinPdfDates(pdf));

  await writeFile(
    `${base}.json`,
    JSON.stringify(
      { id: fixture.id, template: fixture.template, invoice: fixture.invoice },
      null,
      2,
    ) + '\n',
  );
}

async function main(): Promise<void> {
  const fixtures = generateFixtures();
  const templates = {
    classic: await readFile(path.join(TEMPLATES_DIR, 'classic.html'), 'utf8'),
    modern: await readFile(path.join(TEMPLATES_DIR, 'modern.html'), 'utf8'),
    thermal: await readFile(path.join(TEMPLATES_DIR, 'thermal.html'), 'utf8'),
  };

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(SAMPLES_DIR, { recursive: true });

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.emulateMedia({ media: 'screen' });
    for (const fixture of fixtures) {
      await renderFixture(page, fixture, templates);
      process.stdout.write(`${fixture.id} ${fixture.template}\n`);
    }
  } finally {
    await browser?.close();
  }

  for (const id of SAMPLE_IDS) {
    for (const ext of ['pdf', 'png', 'json']) {
      await copyFile(
        path.join(OUT_DIR, `${id}.${ext}`),
        path.join(SAMPLES_DIR, `${id}.${ext}`),
      );
    }
  }
  console.log(
    `\n${fixtures.length} invoices in fixtures/invoices, ${SAMPLE_IDS.length} samples in public/samples`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
