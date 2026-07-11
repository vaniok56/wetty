import fs from 'fs';
import JSON5 from 'json5';

export interface TerminalTarget {
  slug: string;
  name: string;
  host: string;
  user: string;
  port: number;
  /** Wrap the remote shell in `tmux new-session -A`, so sessions survive us. */
  tmux: boolean;
}

type TerminalTargetInput = Omit<TerminalTarget, 'slug'>;

/** URL path segments that are already claimed by the Express router. */
export const RESERVED_SLUGS = new Set([
  'client',
  'metrics',
  'ssh',
  'favicon.ico',
]);

/** Valid slug: starts with a lowercase letter or digit, then any combo of those + hyphens. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Fields every machine entry may contain (unknown keys are rejected). */
const KNOWN_KEYS = new Set(['slug', 'name', 'host', 'user', 'port', 'tmux']);

/** `typeof` is not enough: null and arrays both report as "object". */
function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function createTerminalTargets(
  targets: Record<string, TerminalTargetInput>,
): Record<string, TerminalTarget> {
  return Object.fromEntries(
    Object.entries(targets).map(([slug, target]) => [slug, { slug, ...target }]),
  );
}

export function getTerminalTarget(
  targets: Record<string, TerminalTarget>,
  slug: string,
): TerminalTarget | undefined {
  return targets[slug];
}

/**
 * Load and strictly validate machines from the JSON5 file pointed to by
 * TARGETS_FILE (default: conf/targets.json5).
 *
 * Throws a descriptive Error — listing every problem found — on any issue:
 * missing file, parse failure, wrong structure, unknown keys, invalid field
 * values, reserved or duplicate slugs, or empty list.
 */
export function loadTerminalTargets(): Record<string, TerminalTarget> {
  const filePath = process.env.TARGETS_FILE || 'conf/targets.json5';

  // ── 1. Read ──────────────────────────────────────────────────────────────
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`targets: cannot read ${filePath}: ${msg}`);
  }

  // ── 2. Parse ─────────────────────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = JSON5.parse(content);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`targets: ${filePath} is not valid JSON5: ${msg}`);
  }

  // ── 3. Must be a non-empty array ─────────────────────────────────────────
  if (!Array.isArray(raw)) {
    throw new Error(
      `targets: ${filePath} must be a JSON5 array, got ${raw === null ? 'null' : typeof raw}`,
    );
  }
  if (raw.length === 0) {
    throw new Error(
      `targets: ${filePath} has no machines — add at least one entry`,
    );
  }

  // ── 4. Validate each entry ───────────────────────────────────────────────
  const errors: string[] = [];
  const seenSlugs = new Set<string>();
  const valid: Record<string, TerminalTargetInput> = {};

  for (let i = 0; i < raw.length; i++) {
    const rawEntry = raw[i];
    const prefix = `entry #${i + 1}`;
    const entryErrors: string[] = [];

    if (rawEntry === null || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      errors.push(`  ${prefix}: must be an object, got ${describeType(rawEntry)}`);
      continue;
    }

    const entry = rawEntry as Record<string, unknown>;

    // Unknown keys (catches typos like `prot`, `usr`)
    const unknownKeys = Object.keys(entry).filter(k => !KNOWN_KEYS.has(k));
    if (unknownKeys.length > 0) {
      entryErrors.push(
        `unknown field(s): ${unknownKeys.map(k => `"${k}"`).join(', ')}` +
        ` — allowed: ${[...KNOWN_KEYS].join(', ')}`,
      );
    }

    // slug — validate first so later error lines can reference it
    const rawSlug = entry.slug;
    let slug: string | undefined;
    if (!rawSlug || typeof rawSlug !== 'string') {
      entryErrors.push('slug: required non-empty string');
    } else if (!SLUG_RE.test(rawSlug)) {
      entryErrors.push(
        `slug "${rawSlug}": must match ^[a-z0-9][a-z0-9-]*$` +
        ` (lowercase letters, digits, hyphens only; must start with letter or digit)`,
      );
    } else if (RESERVED_SLUGS.has(rawSlug)) {
      entryErrors.push(
        `slug "${rawSlug}": reserved — choose a different name` +
        ` (reserved: ${[...RESERVED_SLUGS].join(', ')})`,
      );
    } else if (seenSlugs.has(rawSlug)) {
      entryErrors.push(`slug "${rawSlug}": duplicate — already used in this file`);
    } else {
      slug = rawSlug;
      seenSlugs.add(slug); // reserve it early so later duplicates are caught
    }

    // name, host, user — required non-empty strings
    for (const field of ['name', 'host', 'user'] as const) {
      if (!entry[field] || typeof entry[field] !== 'string') {
        entryErrors.push(`${field}: required non-empty string`);
      }
    }

    // port — optional integer 1–65535
    let port = 22;
    if (entry.port !== undefined) {
      const p = entry.port;
      if (typeof p !== 'number' || !Number.isInteger(p) || p < 1 || p > 65535) {
        entryErrors.push(`port "${p}": must be an integer between 1 and 65535`);
      } else {
        port = p;
      }
    }

    // tmux — optional boolean; on by default because session persistence is
    // the whole point. Set false for hosts without tmux installed.
    let tmux = true;
    if (entry.tmux !== undefined) {
      if (typeof entry.tmux !== 'boolean') {
        entryErrors.push(`tmux "${String(entry.tmux)}": must be true or false`);
      } else {
        tmux = entry.tmux;
      }
    }

    if (entryErrors.length > 0) {
      const label = rawSlug && typeof rawSlug === 'string' ? ` (slug: "${rawSlug}")` : '';
      errors.push(`  ${prefix}${label}:\n    - ${entryErrors.join('\n    - ')}`);
    } else if (slug) {
      // slug is always set when entryErrors is empty; the guard just proves it
      valid[slug] = {
        name: entry.name as string,
        host: entry.host as string,
        user: entry.user as string,
        port,
        tmux,
      };
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `targets: ${filePath} has ${errors.length} invalid ` +
      `${errors.length === 1 ? 'entry' : 'entries'}:\n${errors.join('\n')}`,
    );
  }

  return createTerminalTargets(valid);
}
