import io from 'socket.io-client';
export const trim = (str) => str.replace(/\/*$/, '');
const bodyBase = window.WETTY_BASE || document.body.getAttribute('data-base') || '';
export const socket = io(window.location.origin, {
    path: `${trim(bodyBase)}/socket.io`,
});
