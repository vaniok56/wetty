import {spawn} from 'node:child_process';
import * as esbuild from 'esbuild';
import {copy} from 'esbuild-plugin-copy';
import {sassPlugin} from 'esbuild-sass-plugin';

/** @param {string} prog
 * @param {string[]} [args=[]]
 * @returns {[import('node:child_process').ChildProcess, Promise<{ret: number, sig: NodeJS.Signals}>]}
 */
function cmd(prog, args = []) {
    const proc = spawn(prog, args, { cwd: import.meta.dirname, stdio: 'inherit', env: process.env });
    const done = new Promise((resolve) => {
        proc.addListener('exit', (ret, sig) => resolve({ ret, sig }));
    });
    return [proc, done];
}

/**
 * Type errors used to be reported as esbuild *warnings*, and the build was not
 * awaited — so broken TypeScript shipped silently. In a one-shot build a type
 * error is now a hard failure; while watching it stays a warning so the dev
 * loop keeps going.
 * @param {boolean} watching
 * @returns {import('esbuild').Plugin}
 */
const typechecker = (watching) => ({
    name: 'typechecker',
    setup(build) {
        build.onStart(async () => {
            const [, tscDone] = cmd('pnpm', ['tsc', '-p', 'tsconfig.browser.json']);
            const { ret } = await tscDone;
            if (ret === 0) return {};
            const message = { text: `Type checking failed: tsc exited with code ${ret}` };
            return watching ? { warnings: [message] } : { errors: [message] };
        });
    },
});

/** @param {boolean} watching */
async function buildClient(watching) {
    /** @type {esbuild.BuildOptions} */
    const esConf = {
        entryPoints: ['src/client/main.ts', 'src/client/dev.ts'],
        outdir: 'build/client',
        bundle: true,
        platform: 'browser',
        format: 'esm',
        minify: !watching,
        sourcemap: !watching,
        // main.scss now pulls in fonts.scss, so woff2 needs a loader. Emitted
        // beside main.css, which is where the rewritten url() points.
        loader: { '.woff2': 'file' },
        assetNames: '[name]-[hash]',
        plugins: [
            typechecker(watching),
            sassPlugin({
                embedded: true,
                loadPaths: ['node_modules'],
                style: watching ? 'expanded' : 'compressed',
            }),
            copy({
                assets: [
                    { from: './src/assets/favicon.ico', to: 'favicon.ico' },
                    // Served from the base path so its scope covers the app.
                    { from: './src/assets/sw.js', to: 'sw.js' },
                    { from: './src/assets/icons/*', to: 'icons' },
                ],
                watch: watching,
            }),
        ],
        logLevel: 'info',
    };

    if (watching) {
        const buildCtx = await esbuild.context(esConf);
        await buildCtx.watch();
    } else {
        await esbuild.build(esConf);
    }
}

/** @param {boolean} watching */
async function buildServer(watching) {
    const tscArgs = ['tsc', '-p', 'tsconfig.node.json'];
    if (watching) tscArgs.push('--watch', '--preserveWatchOutput');
    const [, tscDone] = cmd('pnpm', tscArgs);
    if (watching) return;
    const { ret } = await tscDone;
    if (ret !== 0) throw new Error(`Server build failed: tsc exited with code ${ret}`);
}

const watching = process.argv.includes('--watch');
await buildClient(watching);
await buildServer(watching);
