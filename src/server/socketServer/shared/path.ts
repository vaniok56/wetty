import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const filePath = fileURLToPath(new URL('../../../../', import.meta.url));

export const assetsPath = (...args: string[]) =>
  resolve(filePath, 'build', ...args);
