/**
 * Submits a page's real form the way a visitor does, for a check that measures
 * the page the form answers with.
 *
 * The form is found by its exact action, so a form that moved or changed where
 * it posts fails here rather than letting the check measure some other page. A
 * closed disclosure around the form is opened by its summary, as a visitor
 * would, and only the named fields are filled: hidden inputs post as rendered.
 * The browser sends the session cookie and a same-origin Origin header itself,
 * which a hand-built request would have to forge.
 */
import type { Page, Response } from '@playwright/test';
import type { FormSubmit } from '../../fixtures/pageLists';

export async function submitForm(page: Page, submit: FormSubmit): Promise<Response> {
  const form = page.locator(`form[action="${submit.action}"]`);
  const forms = await form.count();
  if (forms !== 1) throw new Error(`expected one form posting to ${submit.action} on ${page.url()}, found ${forms}`);

  // Ancestors come back outermost first, so each summary is visible when clicked.
  const closed = form.locator('xpath=ancestor::details[not(@open)]');
  for (let i = 0; i < await closed.count(); i++) await closed.nth(i).locator(':scope > summary').click();

  for (const [name, value] of Object.entries(submit.fields ?? {})) {
    const field = form.locator(`[name="${name}"]`);
    if (await field.count() === 0) throw new Error(`form posting to ${submit.action} has no field named ${name}`);
    const kind = await field.first().evaluate((el) => (el.tagName === 'SELECT' ? 'select' : (el as HTMLInputElement).type));
    if (kind === 'select') await field.selectOption(value);
    else if (kind === 'radio' || kind === 'checkbox') await form.locator(`[name="${name}"][value="${value}"]`).check();
    else await field.fill(value);
  }

  const button = form.locator('[type="submit"]');
  const buttons = await button.count();
  if (buttons !== 1) throw new Error(`form posting to ${submit.action} has ${buttons} submit buttons, expected one`);

  // The answer is the first main-frame document that is not a redirect, so a
  // post that redirects (the donate form to checkout) lands on its target.
  const answered = page.waitForResponse((r) =>
    r.request().isNavigationRequest() && r.request().frame() === page.mainFrame() && (r.status() < 300 || r.status() >= 400));
  await button.click();
  const res = await answered;
  await page.waitForLoadState('load');
  // The pointer is left where the button was, over whatever the answer drew
  // there; hovering a card lifts it. Every other page is measured with the
  // pointer at the origin, so this one is too, once the card has settled.
  await page.mouse.move(0, 0);
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished)));
  return res;
}
