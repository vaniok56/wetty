const need = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`terminal-cactuz: missing element ${selector}`);
  return el;
};

export const dom = {
  terminal: need<HTMLDivElement>('#terminal'),
  wrap: need<HTMLDivElement>('#terminal-wrap'),
  keybar: need<HTMLDivElement>('#keybar'),
  banner: need<HTMLDivElement>('#banner'),
  overlay: need<HTMLDivElement>('#overlay'),
  status: need<HTMLSpanElement>('#status'),
  tabs: need<HTMLDivElement>('#tabs'),
  findbar: need<HTMLDivElement>('#findbar'),
  findInput: need<HTMLInputElement>('#find-input'),
  msg: need<HTMLDivElement>('#msg'),
  errorDetails: need<HTMLPreElement>('#error-details'),
  errorToggle: need<HTMLButtonElement>('#error-toggle'),
  overlayRetry: need<HTMLButtonElement>('#overlay-retry'),
};

export const pageConfig = {
  base: document.body.dataset.base ?? '',
  slug: document.body.dataset.slug ?? '',
  name: document.body.dataset.name ?? '',
  maxTabs: Number(document.body.dataset.maxTabs ?? 4),
};
