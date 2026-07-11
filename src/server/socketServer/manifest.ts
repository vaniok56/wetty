/**
 * Rendered per-request so the paths honour whatever BASE the server runs under.
 */
export const manifest = (basePath: string, title: string): string => {
  const rootPath = basePath || '/';
  return JSON.stringify(
    {
      name: title,
      short_name: 'cactuz',
      description: 'Terminal access from anywhere.',
      start_url: rootPath,
      scope: rootPath,
      // Standalone strips the browser chrome, which is the entire point on a
      // phone: it buys back the ~110px the URL bar and toolbar were eating.
      display: 'standalone',
      orientation: 'any',
      background_color: '#05070a',
      theme_color: '#05070a',
      icons: [
        {
          src: `${basePath}/client/icons/icon-192.png`,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: `${basePath}/client/icons/icon-512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: `${basePath}/client/icons/icon-maskable-512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    null,
    2,
  );
};
