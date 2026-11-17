/**
 * The icons for buttons, drawn inline as SVG (24 x 24 grid) so there is no icon library to
 * load and they take the color of the text around them.
 */
export type UiIconName = 'play' | 'stop' | 'back' | 'next' | 'check' | 'edit' | 'save' | 'reset' | 'close';

export interface UiIcon {
  /** SVG path data, one entry per path. */
  paths: readonly string[];
  /** `fill` icons are solid shapes; `stroke` icons are drawn with a line. */
  style: 'fill' | 'stroke';
}

export const UI_ICONS: Readonly<Record<UiIconName, UiIcon>> = {
  play: { style: 'fill', paths: ['M8 5v14l11-7z'] },
  stop: { style: 'fill', paths: ['M7 7h10v10H7z'] },
  back: { style: 'stroke', paths: ['M15 5l-7 7 7 7'] },
  next: { style: 'stroke', paths: ['M9 5l7 7-7 7'] },
  check: { style: 'stroke', paths: ['M5 12.5l4.5 4.5L19 7.5'] },
  edit: { style: 'stroke', paths: ['M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z', 'M14 7l3 3'] },
  save: { style: 'stroke', paths: ['M5 4h11l3 3v13H5z', 'M8 4v5h7V4', 'M8 20v-6h8v6'] },
  reset: { style: 'stroke', paths: ['M5 12a7 7 0 1 0 2.2-5.1', 'M5 4v4h4'] },
  close: { style: 'stroke', paths: ['M6 6l12 12', 'M18 6L6 18'] },
};

export const UI_ICON_NAMES = Object.keys(UI_ICONS) as UiIconName[];
