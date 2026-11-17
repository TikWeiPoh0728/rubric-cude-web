/**
 * The one color palette for buttons and labels. Each color has the same five parts, so any
 * control can be drawn in any color as a solid, soft or outlined element:
 *  - main:     the strong fill (white text on top of it)
 *  - dark:     the fill when hovered, and outlines of the current item
 *  - soft:     the pale fill
 *  - softText: the text on the pale fill, and on an outlined control
 *  - border:   the outline
 */
export type UiColor = 'navy' | 'slate' | 'green' | 'indigo' | 'red' | 'sky' | 'amber' | 'violet';

export interface UiPalette {
  main: string;
  dark: string;
  soft: string;
  softText: string;
  border: string;
}

export const UI_COLORS: Readonly<Record<UiColor, UiPalette>> = {
  navy: { main: '#0f172a', dark: '#1e293b', soft: '#e2e8f0', softText: '#0f172a', border: '#0f172a' },
  slate: { main: '#475569', dark: '#334155', soft: '#f1f5f9', softText: '#334155', border: '#cbd5e1' },
  green: { main: '#15803d', dark: '#166534', soft: '#dcfce7', softText: '#14532d', border: '#86efac' },
  indigo: { main: '#4f46e5', dark: '#4338ca', soft: '#e0e7ff', softText: '#3730a3', border: '#a5b4fc' },
  red: { main: '#dc2626', dark: '#b91c1c', soft: '#fee2e2', softText: '#991b1b', border: '#fca5a5' },
  sky: { main: '#0369a1', dark: '#0c4a6e', soft: '#e0f2fe', softText: '#0c4a6e', border: '#7dd3fc' },
  amber: { main: '#b45309', dark: '#78350f', soft: '#fef3c7', softText: '#78350f', border: '#fcd34d' },
  violet: { main: '#7c3aed', dark: '#4c1d95', soft: '#ede9fe', softText: '#4c1d95', border: '#c4b5fd' },
};

/** The CSS custom properties that make an element draw itself in `color`. */
export function colorVars(color: UiColor): Record<string, string> {
  const p = UI_COLORS[color];
  return { '--ui-main': p.main, '--ui-dark': p.dark, '--ui-soft': p.soft, '--ui-soft-text': p.softText, '--ui-border': p.border };
}
