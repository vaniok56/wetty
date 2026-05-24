import _ from 'lodash';
import { login } from '../login.js';
import { escapeShell } from '../shared/shell.js';
export async function address(socket, user, host) {
    const { request: { headers: { 'remote-user': userFromHeader, referer } } } = socket;
    let username;
    if (!_.isUndefined(userFromHeader) && !Array.isArray(userFromHeader)) {
        username = userFromHeader;
    }
    else {
        const userFromPathMatch = referer === null || referer === void 0 ? void 0 : referer.match('.+/ssh/([^/]+)$');
        if (userFromPathMatch) {
            username = userFromPathMatch[1].split('?')[0];
        }
        else if (user) {
            username = user;
        }
        else {
            username = await login(socket);
        }
    }
    return `${escapeShell(username)}@${host}`;
}
