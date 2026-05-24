import url from 'url';
export function createTerminalTargets(targets) {
    return Object.fromEntries(Object.entries(targets).map(([slug, target]) => [slug, { slug, ...target }]));
}
export function getTerminalTarget(targets, slug) {
    return targets[slug];
}
export function getTerminalTargetFromReferer(targets, referer) {
    if (!referer)
        return undefined;
    const pathname = url.parse(referer).pathname || '/';
    const slug = pathname.replace(/^\/+/, '').split('/')[0];
    if (!slug)
        return undefined;
    return getTerminalTarget(targets, slug);
}
export function defaultTerminalTargets() {
    return createTerminalTargets({
        raspik4b: {
            name: 'raspik4b',
            host: process.env.TERMINAL_RASPIK4B_HOST || '192.168.100.105',
            user: process.env.TERMINAL_RASPIK4B_USER || 'raspik4b',
            port: parseInt(process.env.TERMINAL_RASPIK4B_PORT || '22', 10),
        },
        raspik: {
            name: 'raspik',
            host: process.env.TERMINAL_RASPIK_HOST || '192.168.100.51',
            user: process.env.TERMINAL_RASPIK_USER || 'vaniok56',
            port: parseInt(process.env.TERMINAL_RASPIK_PORT || '22', 10),
        },
    });
}
