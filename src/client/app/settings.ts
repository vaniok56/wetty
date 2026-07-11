export interface Settings {
  fontSize: number;
  keybarExpanded: boolean;
}

const KEY = 'cactuz.settings';
const DEFAULTS: Settings = { fontSize: 14, keybarExpanded: false };

export const MIN_FONT = 8;
export const MAX_FONT = 32;

export const clampFont = (size: number): number =>
  Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(size)));

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };

    // Carry over the font size from the pre-rewrite `options` blob.
    const legacy = localStorage.getItem('options');
    if (legacy) {
      const parsed = JSON.parse(legacy) as { xterm?: { fontSize?: number } };
      const fontSize = parsed?.xterm?.fontSize;
      if (typeof fontSize === 'number') {
        return { ...DEFAULTS, fontSize: clampFont(fontSize) };
      }
    }
  } catch {
    /* corrupt storage is not worth crashing over */
  }
  return { ...DEFAULTS };
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* private mode, quota, whatever */
  }
}
