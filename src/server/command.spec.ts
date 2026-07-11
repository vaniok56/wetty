import 'mocha';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';

import { remoteCommand, sshArgs } from './command';
import type { TerminalTarget } from './targets';
import type { SSH } from '../shared/interfaces';

const target: TerminalTarget = {
  slug: 'raspik',
  name: 'raspik',
  host: '192.168.100.51',
  user: 'vaniok56',
  port: 2222,
  tmux: true,
};

const ssh: SSH = { auth: 'publickey', knownHosts: '/run/known_hosts' };

describe('remoteCommand', () => {
  it('attaches or creates a tmux session named for the target and tab', () => {
    expect(remoteCommand(target, 0)).to.contain(
      'tmux new-session -A -s cactuz-raspik-0',
    );
    expect(remoteCommand(target, 3)).to.contain('cactuz-raspik-3');
  });

  it('falls back to a login shell when tmux is absent on the host', () => {
    const cmd = remoteCommand(target, 0);
    expect(cmd).to.contain('command -v tmux');
    // eslint-disable-next-line no-template-curly-in-string -- remote shell expands this, not JS
    expect(cmd).to.contain('|| exec "${SHELL:-/bin/sh}" -l');
  });

  it('returns an empty command when tmux is disabled for the target', () => {
    expect(remoteCommand({ ...target, tmux: false }, 0)).to.equal('');
  });

  it('does not kill the session on a normal (non-fresh) attach', () => {
    expect(remoteCommand(target, 0)).to.not.contain('kill-session');
  });

  it('kills the existing session first when fresh, then recreates it', () => {
    const cmd = remoteCommand(target, 0, true);
    expect(cmd).to.contain('tmux kill-session -t cactuz-raspik-0');
    expect(cmd).to.contain('tmux new-session -A -s cactuz-raspik-0');
    // kill must precede the new-session so we land in a clean shell.
    expect(cmd.indexOf('kill-session')).to.be.lessThan(cmd.indexOf('new-session'));
  });

  it('still has no remote command when fresh but tmux is disabled', () => {
    expect(remoteCommand({ ...target, tmux: false }, 0, true)).to.equal('');
  });

  // Mouse mode lets a wheel/touch drag scroll tmux history (session-scoped, no
  // -g). set-clipboard makes a drag-selection emit OSC 52 to the browser's
  // clipboard; allow-passthrough lets an inner app's DCS-wrapped OSC 52 through.
  it('sets mouse mode (per session) plus clipboard passthrough', () => {
    const cmd = remoteCommand(target, 0);
    expect(cmd).to.contain('tmux new-session -A -s cactuz-raspik-0 \\; set mouse on');
    expect(cmd).to.contain('\\; set -g set-clipboard on');
    expect(cmd).to.contain('\\; set allow-passthrough on');
    expect(cmd).to.not.contain('-g mouse');
    expect(remoteCommand(target, 0, true)).to.contain('\\; set mouse on');
  });
});

describe('sshArgs', () => {
  it('uses the target port, not the global ssh port', () => {
    const args = sshArgs(target, ssh, 0);
    expect(args).to.include('-p');
    expect(args[args.indexOf('-p') + 1]).to.equal('2222');
  });

  it('connects as user@host after the -- separator', () => {
    const args = sshArgs(target, ssh, 0);
    const sep = args.indexOf('--');
    expect(sep).to.be.greaterThan(0);
    expect(args[sep + 1]).to.equal('vaniok56@192.168.100.51');
  });

  it('keeps long-lived detached sessions alive', () => {
    const args = sshArgs(target, ssh, 0).join(' ');
    expect(args).to.contain('ServerAliveInterval=20');
    expect(args).to.contain('TCPKeepAlive=yes');
  });

  it('disables the ssh escape char so ~. cannot kill the session', () => {
    expect(sshArgs(target, ssh, 0).join(' ')).to.contain('EscapeChar=none');
  });

  it('verifies host keys when a known_hosts file is configured', () => {
    const args = sshArgs(target, ssh, 0).join(' ');
    expect(args).to.contain('StrictHostKeyChecking=accept-new');
    expect(args).to.contain('UserKnownHostsFile=/run/known_hosts');
  });

  it('cannot verify host keys when known_hosts is /dev/null', () => {
    const args = sshArgs(target, { ...ssh, knownHosts: '/dev/null' }, 0).join(' ');
    expect(args).to.contain('StrictHostKeyChecking=no');
  });

  // BatchMode makes a passwordless key connection fail fast instead of hanging
  // a PTY nobody is watching. But it also suppresses ssh's interactive password
  // prompt, so it must only appear when we can authenticate without one.
  describe('BatchMode', () => {
    let keyFile: string;

    before(() => {
      keyFile = path.join(os.tmpdir(), `cactuz-key-${process.pid}`);
      fs.writeFileSync(
        keyFile,
        '-----BEGIN OPENSSH PRIVATE KEY-----\nx\n-----END OPENSSH PRIVATE KEY-----\n',
      );
    });

    after(() => {
      try {
        fs.unlinkSync(keyFile);
      } catch {
        /* ignore */
      }
    });

    // The regression: with neither a key nor a password, BatchMode used to be
    // set and blocked the password prompt the deploy relies on.
    it('is omitted when there is no key and no password', () => {
      expect(sshArgs(target, ssh, 0).join(' ')).to.not.contain('BatchMode');
    });

    it('is omitted for a dummy/placeholder key so ssh can prompt', () => {
      const dummy = path.join(os.tmpdir(), `cactuz-dummy-${process.pid}`);
      fs.writeFileSync(dummy, 'DUMMY KEY');
      try {
        const args = sshArgs(target, { ...ssh, key: dummy }, 0);
        expect(args.join(' ')).to.not.contain('BatchMode');
        expect(args).to.not.include('-i');
      } finally {
        fs.unlinkSync(dummy);
      }
    });

    it('is set for a real key, so a passwordless attempt fails fast', () => {
      const args = sshArgs(target, { ...ssh, key: keyFile }, 0);
      expect(args.join(' ')).to.contain('BatchMode=yes');
      expect(args).to.include('-i');
    });

    it('is omitted when a password is supplied, since sshpass needs the prompt', () => {
      const withPass = sshArgs(target, { ...ssh, pass: 'hunter2' }, 0);
      expect(withPass.join(' ')).to.not.contain('BatchMode');
      expect(withPass[0]).to.equal('sshpass');
    });
  });

  it('omits -i when no key is configured', () => {
    expect(sshArgs(target, ssh, 0)).to.not.include('-i');
  });

  it('passes no remote command when tmux is disabled', () => {
    const args = sshArgs({ ...target, tmux: false }, ssh, 0);
    expect(args[args.length - 1]).to.equal('vaniok56@192.168.100.51');
  });
});
