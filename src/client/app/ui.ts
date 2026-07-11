import { dom } from './dom';
import type { Status } from './session';

const LABEL: Record<Status, string> = {
  connecting: 'connecting',
  live: 'live',
  reconnecting: 'reconnecting',
  ended: 'ended',
  error: 'error',
};

export function setStatus(status: Status): void {
  dom.status.dataset.state = status;
  dom.status.textContent = LABEL[status];

  // A dropped socket is routine on mobile: the session is still alive on the
  // server. Show a quiet banner, never the full-screen tombstone.
  if (status === 'reconnecting') {
    showBanner('Reconnecting…');
  } else {
    hideBanner();
  }
}

export function showBanner(text: string): void {
  dom.banner.textContent = text;
  dom.banner.hidden = false;
}

export function hideBanner(): void {
  dom.banner.hidden = true;
}

export function friendlyMessage(reason: string): string {
  if (!reason) return 'Connection closed.';
  if (/could not resolve hostname|name or service not known/i.test(reason))
    return 'Host not found.';
  if (/connection refused|no route to host|network is unreachable/i.test(reason))
    return 'Host unreachable.';
  if (/connection timed out|operation timed out/i.test(reason))
    return 'Host timed out.';
  if (/permission denied|host key verification failed/i.test(reason))
    return 'SSH rejected the connection.';
  if (/too many active sessions/i.test(reason)) return reason;
  return 'Session ended.';
}

export function showOverlay(message: string, details = ''): void {
  dom.msg.textContent = message;
  dom.errorDetails.textContent = details;
  dom.errorDetails.hidden = true;
  dom.errorToggle.hidden = !details;
  dom.overlay.style.display = 'block';
}

export function hideOverlay(): void {
  dom.overlay.style.display = 'none';
}

export function initOverlay(onRetry: () => void): void {
  dom.errorToggle.addEventListener('click', () => {
    dom.errorDetails.hidden = !dom.errorDetails.hidden;
  });
  dom.overlayRetry.addEventListener('click', () => {
    hideOverlay();
    onRetry();
  });
}
