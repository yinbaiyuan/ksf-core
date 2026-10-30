import {existsSync} from 'node:fs';
import{mkdir,lstat}from'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, userInfo } from 'node:os';

export const darwin = {
  terminalLaunch(env = process.env) { const account=userInfo(), shell=env.SHELL&&existsSync(env.SHELL)?env.SHELL:account.shell&&existsSync(account.shell)?account.shell:'/bin/sh'; return {shell,args:['-l'],env:{...env,SHELL:shell,USER:env.USER??account.username,HOME:env.HOME??homedir(),TERM:'xterm-256color',COLORTERM:'truecolor'}}; },
  reserveDirectoryRename:async path=>{await mkdir(path);return lstat(path);},
  name: 'darwin', validSegment: () => true, supervisorOptions: {detached:false}, supportsPosixModes: true,
  fileMode: (_path, mode) => mode & 0o111 ? 0o755 : 0o644, detachedChildren: true, directorySyncErrors: [], replaceErrors: [],
  hostsPath: () => '/etc/hosts',
  tool: name => `/usr/bin/${name}`,
  launcher: (root, args) => ({ executable: '/bin/sh', args: [join(root, '.agents/ksf'), ...args] }),
  hookCommand: root => `'${join(root, '.agents/ksf').replaceAll("'", "'\\''")}' task hook`,
  desktopEndpoint: home => join(home, 'ipc/ipc.sock'),
  desktopCandidates: () => [
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
    '/Applications/Codex.app/Contents/Resources/codex',
    join(homedir(), 'Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'),
    join(homedir(), '.local/bin/codex'),
  ],
  openURI: uri => ({ executable: '/usr/bin/open', args: [uri] }),
  processStart(pid) {
    const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8',env:{...process.env,LC_ALL:'C'} });
    if (result.status !== 0 || !result.stdout.trim()) throw new Error('Cannot inspect process start identity.');
    return result.stdout.trim().replace(/\s+/g, ' ');
  },
  terminate(child, signal) { process.kill(-child.pid, signal); },
};
