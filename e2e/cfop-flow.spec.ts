import { expect, test, Page } from '@playwright/test';
import { COLOR_NAME, SCRAMBLED, distance, isUniform, paintCube, sampleAllFaces, sampleFace } from './support';

/**
 * CFOP in a real browser: the solution arrives in four stages (Cross, F2L, OLL, PLL), the
 * panel shows them as sections, and the 3D cube reaches each stage's finish line at the
 * step where that stage ends.
 */

const STAGES = ['Cross', 'F2L', 'OLL', 'PLL'];

/** Number of moves in each section, read from the panel ("skipped" means none). */
async function stageCounts(page: Page): Promise<number[]> {
  const texts = await page.locator('.stage .stage-count').allTextContents();
  return texts.map(t => (t.trim() === 'skipped' ? 0 : Number(t.trim().split(' ')[0])));
}

/** Drag the slider to a step and wait for the label. */
async function goToStep(page: Page, step: number, total: number): Promise<void> {
  await page.getByRole('slider', { name: 'Solution progress' }).fill(String(step));
  await expect(page.getByText(`Step ${step} / ${total}`)).toBeVisible();
}

test('CFOP: four stages in the panel, each one finished on the cube when its stage ends', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', e => problems.push(`page error: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });

  await page.goto('/');
  await paintCube(page, SCRAMBLED);
  await page.locator('.action-slot button').click(); // Save
  await page.getByRole('radio', { name: 'CFOP' }).click();
  await page.getByRole('button', { name: 'Start' }).click();

  // --- The dialog describes CFOP by its stages, then the solution arrives.
  await expect(page.getByRole('alertdialog')).toContainText('Cross, F2L, OLL and PLL');
  await expect(page.getByText(/Total steps:/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  // --- Four sections, in order, whose counts add up to the total.
  const total = Number((await page.locator('.total strong').textContent())!);
  await expect(page.locator('.stage .stage-name')).toHaveText(STAGES);
  const counts = await stageCounts(page);
  expect(counts).toHaveLength(4);
  expect(counts.reduce((a, b) => a + b, 0)).toBe(total);
  expect(counts[0]).toBeLessThanOrEqual(8); // the cross is optimal: never more than 8 moves
  expect(total).toBeGreaterThan(30);
  expect(total).toBeLessThan(90);
  await expect(page.locator('.chip')).toHaveCount(total);

  // The progress panel shows the same four stages along its scale.
  await expect(page.locator('app-progress .band:not(.skipped)')).toHaveCount(counts.filter(c => c > 0).length);
  await expect(page.getByText(`Step 0 / ${total}`)).toBeVisible();
  await expect(page.locator('app-progress .stage-now')).toHaveCount(0); // nothing played yet

  // --- Stepping into a stage names it, in the panel and on the scale.
  const firstStage = STAGES[counts.findIndex(c => c > 0)];
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText(`Step 1 / ${total}`)).toBeVisible();
  await expect(page.locator('app-progress .stage-now')).toHaveText(firstStage);
  await expect(page.locator('.stage.active .stage-name')).toHaveText(firstStage);

  // --- At the end of each stage the cube has that stage's finish line (looked at on the real 3D view).
  const ends = counts.map((_, i) => counts.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const centerColor = async (side: string) => {
    await page.getByRole('button', { name: side, exact: true }).click();
    await page.waitForTimeout(1100);
    return sampleFace(page);
  };

  /**
   * Look at the four side faces and check that the given cells (0..8, row by row from the top
   * left) match each face's own center. A cross or a layer is only right when it lines up with
   * the sides, which the bottom face alone cannot show: a turn of the bottom layer leaves it looking the same.
   */
  const sidesMatchCenters = async (cells: number[], what: string) => {
    for (const side of ['F', 'R', 'B', 'L']) {
      const face = await centerColor(COLOR_NAME[side]);
      for (const cell of cells) {
        expect(distance(face[cell], face[4]), `${what}: ${COLOR_NAME[side]} side, cell ${cell}`).toBeLessThan(40);
      }
    }
  };

  // Cross done: white edges around the white center on the bottom, and each one lined up with its side.
  await goToStep(page, ends[0], total);
  const afterCross = await centerColor(COLOR_NAME['D']);
  for (const cell of [1, 3, 5, 7]) expect(distance(afterCross[cell], afterCross[4]), `bottom edge ${cell}`).toBeLessThan(40);
  await sidesMatchCenters([7], 'cross');

  // F2L done: the whole bottom face is white, and the bottom two rows of every side match its center.
  await goToStep(page, ends[1], total);
  expect(isUniform(await centerColor(COLOR_NAME['D'])), 'bottom face after F2L').toBe(true);
  await sidesMatchCenters([3, 4, 5, 6, 7, 8], 'F2L');

  // OLL done: the whole top face is yellow, and the two lower layers are still intact.
  await goToStep(page, ends[2], total);
  expect(isUniform(await centerColor(COLOR_NAME['U'])), 'top face after OLL').toBe(true);
  expect(isUniform(await centerColor(COLOR_NAME['D'])), 'bottom face after OLL').toBe(true);
  await sidesMatchCenters([3, 4, 5, 6, 7, 8], 'OLL');

  // PLL done: the whole cube is solved, every side one color and the six colors all different.
  await goToStep(page, total, total);
  await expect(page.locator('app-progress .stage-now')).toHaveText(STAGES[counts.map(c => c > 0).lastIndexOf(true)]);
  const faces = await sampleAllFaces(page);
  faces.forEach((face, i) => expect(isUniform(face), `side ${Object.values(COLOR_NAME)[i]}`).toBe(true));
  const centers = faces.map(f => f[4]);
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) expect(distance(centers[i], centers[j])).toBeGreaterThan(60);

  expect(problems).toEqual([]);
});
