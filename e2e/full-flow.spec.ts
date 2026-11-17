import { expect, test } from '@playwright/test';
import { COLOR_NAME, SCRAMBLED, distance, isUniform, paintCube, sampleAllFaces } from './support';

/**
 * The whole journey in a real browser: paint a scrambled cube, save it, solve it with
 * Kociemba, step through the solution, and check the 3D cube really ends up solved.
 */

test('paint, save, solve with Kociemba, step through, and end with a solved cube', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', e => problems.push(`page error: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'VeryCube' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();

  // --- An empty cube offers neither Save nor Start.
  const slotButton = page.locator('.action-slot button');
  await expect(slotButton).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);

  // --- Paint a scrambled cube; nothing is wrong with it, so Save appears.
  await paintCube(page, SCRAMBLED);
  await expect(page.getByText('54 / 54 filled')).toBeVisible();
  await expect(page.getByText('No problems found.')).toBeVisible();
  await expect(slotButton).toHaveText('Save');

  // The 3D cube is not solved yet (this keeps the final check below honest).
  const before = await sampleAllFaces(page);
  expect(before.some(face => !isUniform(face))).toBe(true);

  // --- Save turns into Edit in exactly the same place.
  const saveBox = (await slotButton.boundingBox())!;
  await slotButton.click();
  await expect(slotButton).toHaveText('Edit');
  expect(await slotButton.boundingBox()).toEqual(saveBox);
  await expect(page.getByRole('heading', { name: 'Solution' })).toBeVisible();

  // --- Start needs a method.
  const start = page.getByRole('button', { name: 'Start' });
  await expect(start).toBeDisabled();
  await page.getByRole('radio', { name: 'Kociemba' }).click();
  await expect(start).toBeEnabled();

  // --- Start: a dialog while solving, and Edit and Start disappear.
  await start.click();
  await expect(page.getByRole('alertdialog')).toContainText('Generating solution');
  await expect(slotButton).toHaveCount(0);
  await expect(start).toHaveCount(0);

  // --- The solution arrives.
  await expect(page.getByText(/Total steps:/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  const total = Number((await page.locator('.total strong').textContent())!);
  expect(total).toBeGreaterThan(0);
  expect(total).toBeLessThanOrEqual(22);

  const moves = (await page.locator('.chip').allTextContents()).map(m => m.trim());
  expect(moves).toHaveLength(total);
  for (const m of moves) expect(m).toMatch(/^[URFDLB](2|')?$/);

  // The method buttons are locked, the chosen one still marked.
  for (const name of ['Kociemba', 'CFOP', 'LBL']) await expect(page.getByRole('radio', { name })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'Kociemba' })).toHaveAttribute('aria-checked', 'true');

  // The progress panel appears, at the start.
  await expect(page.getByText(`Step 0 / ${total}`)).toBeVisible();
  const back = page.getByRole('button', { name: 'Back' });
  const next = page.getByRole('button', { name: 'Next' });
  await expect(back).toBeDisabled();
  await expect(next).toBeEnabled();

  // --- Next plays one move (the buttons wait while it plays, which the unit tests cover:
  //     it is over in about 400 ms, too quick to check reliably here), then Back works.
  await next.click();
  await expect(page.getByText(`Step 1 / ${total}`)).toBeVisible();
  await expect(next).toBeEnabled({ timeout: 5_000 });
  await expect(back).toBeEnabled();

  await back.click();
  await expect(page.getByText(`Step 0 / ${total}`)).toBeVisible();
  await expect(next).toBeEnabled({ timeout: 5_000 }); // the move has finished playing
  await expect(back).toBeDisabled(); // and we are at the start again

  // --- Play runs the solution by itself, Stop holds it where it is, Play carries on to the end.
  const stepText = () => page.locator('app-progress .value').innerText();
  const play = page.getByRole('button', { name: 'Play', exact: true });
  const stop = page.getByRole('button', { name: 'Stop', exact: true });

  await expect(play).toBeEnabled();
  await play.click();
  await expect(stop).toBeVisible(); // the same button now says Stop
  await expect(page.getByText(/^Step [1-9]\d* \//)).toBeVisible(); // it moved on, and nobody clicked Next

  // While it plays, Back and Next must not blink on and off with every move being drawn.
  if (total > 12) {
    let disabledSamples = 0;
    for (let i = 0; i < 50; i++) {
      if ((await next.isDisabled()) || (await back.isDisabled())) disabledSamples++;
      await page.waitForTimeout(50);
    }
    expect(disabledSamples, 'Back and Next stay enabled while playing').toBe(0);
  }

  // Pressing Next during Play pauses it (like a video player) and steps once.
  await next.click();
  await expect(play).toBeVisible();
  await play.click(); // and Play carries on
  await expect(stop).toBeVisible();

  await stop.click();
  await expect(play).toBeVisible();
  await page.waitForTimeout(900); // a move that was already playing may finish
  const held = await stepText();
  await page.waitForTimeout(1500);
  expect(await stepText(), 'Stop holds the cube where it is').toBe(held);

  await play.click(); // carries on from there
  await expect(page.getByText(`Step ${total} / ${total}`)).toBeVisible({ timeout: 90_000 });
  await expect(play).toBeVisible({ timeout: 5_000 }); // at the end it stops by itself and says Play again
  await expect(next).toBeDisabled();

  // --- The slider still works after playing: drag it back to the start.
  const slider = page.getByRole('slider', { name: 'Solution progress' });
  await slider.fill('0');
  await expect(page.getByText(`Step 0 / ${total}`)).toBeVisible();

  // --- Quick clicks queue: three Next clicks, faster than a move is drawn, all count...
  await next.click();
  await next.click();
  await next.click();
  await expect(page.getByText(`Step 3 / ${total}`)).toBeVisible();
  await expect(back).toBeEnabled();
  // ...and the cube walks through all three moves. Once it has settled it must look exactly
  // like the cube after a jump to the same step.
  await page.waitForTimeout(3000);
  const walked = await page.locator('canvas').screenshot();
  await slider.fill('0');
  await slider.fill('3');
  await expect(page.getByText(`Step 3 / ${total}`)).toBeVisible();
  await page.waitForTimeout(800);
  const jumped = await page.locator('canvas').screenshot();
  expect(walked.equals(jumped), 'walking three moves ends on the same cube as jumping there').toBe(true);

  // --- And the slider takes it to the end.
  await slider.fill(String(total));
  await expect(page.getByText(`Step ${total} / ${total}`)).toBeVisible();
  await expect(next).toBeDisabled();

  // --- The cube really is solved: every side is one color, and the six colors differ.
  const after = await sampleAllFaces(page);
  after.forEach((face, i) => expect(isUniform(face), `side ${Object.values(COLOR_NAME)[i]} is one color`).toBe(true));
  const centers = after.map(face => face[4]);
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) expect(distance(centers[i], centers[j]), `sides ${i} and ${j} differ`).toBeGreaterThan(60);
  }

  expect(problems).toEqual([]);
});
