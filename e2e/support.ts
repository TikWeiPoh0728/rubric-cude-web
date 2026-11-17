import { Page } from '@playwright/test';

/** Shared by the end-to-end tests: painting a cube through the UI and reading the 3D view back. */

/** A scrambled cube as 54 face letters in U R F D L B order (R U R' U' F2 D L2 B' U2 R2 F D' L). */
export const SCRAMBLED = 'DDFRUUFLDBFDBRLFBLDBLFFUBBRRDULDRUUFRDLRLRBDURFBFBUULL';

/** The color scheme: the face a sticker belongs to -> the name on its palette swatch. */
export const COLOR_NAME: Record<string, string> = { U: 'Yellow', D: 'White', F: 'Green', B: 'Blue', L: 'Red', R: 'Orange' };

export const FACE_ORDER = 'URFDLB';
const isCenter = (index: number) => index % 9 === 4;

/** The accessible name of a sticker in the unfolded net, e.g. "U face, row 1, column 1". */
const stickerName = (index: number) =>
  `${FACE_ORDER[Math.floor(index / 9)]} face, row ${Math.floor((index % 9) / 3) + 1}, column ${(index % 3) + 1}`;

export async function paintCube(page: Page, facelets: string): Promise<void> {
  for (const face of FACE_ORDER) {
    await page.getByRole('radio', { name: COLOR_NAME[face], exact: true }).click();
    for (let i = 0; i < 54; i++) {
      if (facelets[i] === face && !isCenter(i)) await page.getByRole('button', { name: stickerName(i), exact: true }).click();
    }
  }
}

export type RGB = [number, number, number];

/** Colors at the centers of the nine stickers of the face the camera is looking at. */
export async function sampleFace(page: Page): Promise<RGB[]> {
  const png = (await page.locator('canvas').screenshot()).toString('base64');
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const g = canvas.getContext('2d')!;
    g.drawImage(img, 0, 0);
    // Face-on, the nine stickers sit on a 3 x 3 grid around the middle of the square view.
    const spots = [0.33, 0.5, 0.67];
    const out: [number, number, number][] = [];
    for (const fy of spots) {
      for (const fx of spots) {
        const d = g.getImageData(Math.round(img.width * fx), Math.round(img.height * fy), 1, 1).data;
        out.push([d[0], d[1], d[2]]);
      }
    }
    return out;
  }, png);
}

export const distance = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const isUniform = (face: RGB[]) => face.every(c => distance(c, face[4]) < 40);

/** Look at each of the six sides in turn and return the colors seen on each. */
export async function sampleAllFaces(page: Page): Promise<RGB[][]> {
  const faces: RGB[][] = [];
  for (const name of Object.values(COLOR_NAME)) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(1100); // the camera glides for about 650 ms
    faces.push(await sampleFace(page));
  }
  return faces;
}

