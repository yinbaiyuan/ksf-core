import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

// /usr/bin/git is an xcrun shim. An Xcode update can disable that shim
// while an already-installed Command Line Tools or Homebrew Git still works.
// Probe only known installation paths; never change developer settings or
// accept a license on behalf of the user.
export function darwinGit({exists=existsSync,run=spawnSync}={}){
  for(const path of ['/usr/bin/git','/Library/Developer/CommandLineTools/usr/bin/git','/opt/homebrew/bin/git','/usr/local/bin/git']){
    if(!exists(path))continue;
    let result;try{result=run(path,['--version'],{encoding:'utf8',timeout:3000,maxBuffer:64*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'},stdio:['ignore','pipe','pipe']});}catch{continue;}
    if(!result.error&&!result.signal&&result.status===0&&/^git version \S+/m.test(result.stdout??''))return path;
  }
  // Keep the normal missing/broken-tool diagnostics in the operation layer.
  return '/usr/bin/git';
}
