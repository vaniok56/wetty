import _ from 'lodash';
import { overlay } from './disconnect/elements';
import { verifyPrompt } from './disconnect/verify';

function friendlyMessage(reason: string): string {
  if (!reason) return 'Connection closed.';
  if (reason.includes('Timed out due to inactivity')) {
    return 'Disconnected after 30 minutes of inactivity.';
  }
  if (
    /could not resolve hostname|connection refused|connection timed out|no route to host|operation timed out/i.test(
      reason,
    )
  ) {
    return 'Host unavailable.';
  }
  if (/permission denied|host key verification failed/i.test(reason)) {
    return 'SSH connection failed.';
  }
  return 'Session ended.';
}

export function disconnect(reason: string): void {
  if (_.isNull(overlay)) return;
  overlay.style.display = 'block';
  const msg = document.getElementById('msg');
  const details = document.getElementById('error-details');
  const toggle = document.getElementById('error-toggle') as HTMLButtonElement | null;
  if (!_.isNull(msg)) msg.innerHTML = friendlyMessage(reason || '');
  if (!_.isNull(details)) {
    details.textContent = reason || '';
    details.hidden = true;
  }
  if (!_.isNull(toggle)) {
    toggle.hidden = !reason;
    toggle.onclick = () => {
      if (_.isNull(details)) return;
      details.hidden = !details.hidden;
    };
  }
  window.removeEventListener('beforeunload', verifyPrompt, false);
}
