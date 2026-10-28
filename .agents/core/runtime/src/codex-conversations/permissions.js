import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { failure } from './protocol.js';

export const STATE_PROFILE = 'ksf-workbench-chat-state-v1';
const BEGIN = '# BEGIN KSF WORKBENCH CHAT STATE PERMISSIONS V1';
const END = '# END KSF WORKBENCH CHAT STATE PERMISSIONS V1';
export const STATE_DIRECTORIES = ['.agents/user-data/chats', '.agents/runtime-data/chat-state'];

// Installation is an explicit user choice. Merely using the service never writes
// Codex configuration or changes the default permissions of other chats.
export function stateProfileBlock(root) {
  return `${BEGIN}\n[permissions.${STATE_PROFILE}]\ndescription = "KSF 工作台：仅增加聊天状态目录写权限"\nextends = ":workspace"\n[permissions.${STATE_PROFILE}.workspace_roots]\n${JSON.stringify(realpathSync(root))} = true\n[permissions.${STATE_PROFILE}.filesystem.":workspace_roots"]\n"." = "write"\n".agents" = "read"\n".git" = "read"\n".codex" = "read"\n".aws" = "read"\n".agents/user-data/chats" = "write"\n".agents/runtime-data/chat-state" = "write"\n${END}\n`;
}

export function workbenchPermissions(root) {
  let text;
  try { text = readFileSync(join(root, '.codex/config.toml'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!text.includes(STATE_PROFILE) && !text.includes(BEGIN)) return null;
  // The installed, root-bound policy is deliberately exact. A changed or partial
  // policy requires review rather than silently granting a different boundary.
  const topLevel = text.split(/^\s*\[/m)[0];
  if (text.length > 1024 * 1024 || text.split(BEGIN).length !== 2 || !text.includes(stateProfileBlock(root)) || !/^\s*default_permissions\s*=\s*"[^"]+"/m.test(topLevel)) {
    throw failure('CODEX_PERMISSIONS_CONFIG', '工作台聊天状态权限配置不完整或已改变，请核对 .codex/config.toml。');
  }
  return { id: STATE_PROFILE, additionalWritablePaths: [...STATE_DIRECTORIES] };
}
