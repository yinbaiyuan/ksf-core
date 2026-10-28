import { spawnSync } from 'node:child_process';
import {existsSync} from 'node:fs';
import { win32 } from 'node:path';

export const powershell = (env = process.env) => win32.join(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
export const encodedCommand = script => ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ProgressPreference='SilentlyContinue';"+script, 'utf16le').toString('base64')];
const quote = value => "'" + value.replaceAll("'", "''") + "'";

export const windows = {
  terminalLaunch(env = process.env) { const shell=env.ComSpec??env.COMSPEC??win32.join(env.SystemRoot??'C:\\Windows','System32/cmd.exe');return {shell,args:win32.basename(shell).toLowerCase()==='cmd.exe'?['/d','/k','chcp 65001 >nul']:[],env:{...env,TERM:'xterm-256color',COLORTERM:'truecolor'}}; },
  reserveDirectoryRename:async()=>null,
  name: 'win32', validSegment: name => !/[<>:"\/\\|?*\x00-\x1f]/.test(name) && !/[. ]$/.test(name) && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name), supervisorOptions: {detached:true,windowsHide:true}, supportsPosixModes: false,
  // NTFS has no POSIX executable bit. Preserve the declared Git/archive mode;
  // the fixed POSIX launcher has a canonical mode even in a dirty source tree.
  fileMode: (path, _mode, declared) => declared ?? (/[/\\]\.agents[/\\]ksf$/.test(path) ? 0o755 : 0o644), detachedChildren: false,
  directorySyncErrors: ['EPERM', 'EISDIR', 'EINVAL'], replaceErrors: ['EPERM', 'EACCES', 'EBUSY'],
  hostsPath: env => win32.join(env.SystemRoot || env.WINDIR || 'C:\\Windows','System32/drivers/etc/hosts'),
  tool(name) {
    if(name==='git'){
      const candidates=[...(process.env.Path??process.env.PATH??'').split(';').filter(Boolean).map(path=>win32.join(path,'git.exe')),
        win32.join(process.env.ProgramFiles??'C:\\Program Files','Git/cmd/git.exe'),win32.join(process.env.LOCALAPPDATA??'C:\\Users/Default/AppData/Local','Programs/Git/cmd/git.exe')];
      return candidates.find(existsSync)??'git.exe';
    }
    if(name==='tar'){
      // Git's GNU tar handles UTF-8 PAX names; the inbox bsdtar on supported
      // Windows versions can reject them even with a UTF-8 CRT locale.
      const git=this.tool('git');
      if(win32.isAbsolute(git)&&existsSync(git)){
        const directory=win32.dirname(git);
        for(const offset of ['../usr/bin/tar.exe','../../usr/bin/tar.exe']){const path=win32.resolve(directory,offset);if(existsSync(path))return path;}
      }
      return win32.join(process.env.SystemRoot||'C:\\Windows','System32/tar.exe');
    }
    if(name==='diff'){
      const directory=win32.dirname(this.tool('git'));
      for(const offset of ['../usr/bin/diff.exe','../../usr/bin/diff.exe']){const path=win32.resolve(directory,offset);if(existsSync(path))return path;}
    }
    return `${name}.exe`;
  },
  launcher: (root, args) => ({ executable: powershell(), args: ['-ExecutionPolicy','Bypass',...encodedCommand(`$ksfNativeArguments=@(${args.map(quote).join(',')}); & ${quote(win32.join(root,'.agents/ksf.ps1'))} @ksfNativeArguments; exit $LASTEXITCODE`)] }),
  hookCommand: root => `${powershell()} ${encodedCommand(`& ${quote(win32.join(root, '.agents/ksf.ps1'))} task hook; exit $LASTEXITCODE`).join(' ')}`,
  desktopEndpoint: () => '\\\\.\\pipe\\codex-ipc',
  desktopCandidates() {
    // Query the current user's package registration; never pin a Store version path.
    const result = spawnSync(powershell(), encodedCommand("$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | ForEach-Object { Join-Path $_.InstallLocation 'app\\resources\\codex.exe' }"), { encoding: 'utf8', timeout: 15000, windowsHide: true });
    return result.status === 0 ? result.stdout.trim().split(/\r?\n/).filter(Boolean) : [];
  },
  openURI: uri => ({ executable: powershell(), args: encodedCommand(`$ErrorActionPreference='Stop'; Start-Process ${quote(uri)}`) }),
  processStart(pid) {
    const result = spawnSync(powershell(), encodedCommand(`$ErrorActionPreference='Stop'; (Get-Process -Id ${Number(pid)}).StartTime.ToUniversalTime().Ticks.ToString()`), { encoding: 'utf8', timeout: 10000, windowsHide: true });
    if (result.status !== 0 || !/^\d+$/.test(result.stdout.trim())) throw new Error('Cannot inspect process start identity.');
    return result.stdout.trim();
  },
  terminate(child) {
    // This is called only while the owned child handle is live. Include its descendants.
    const result = spawnSync(win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    if (result.status !== 0 && result.status !== 128) throw Object.assign(new Error('Cannot terminate owned process tree.'), { code: 'PROCESS_STOP_FAILED' });
  },
};
