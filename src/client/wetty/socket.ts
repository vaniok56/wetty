import io from 'socket.io-client';

export const trim = (str: string): string => str.replace(/\/*$/, '');

const bodyBase = (window as any).WETTY_BASE || document.body.getAttribute('data-base') || '';
export const socket = io(window.location.origin, {
  path: `${trim(bodyBase)}/socket.io`,
});
