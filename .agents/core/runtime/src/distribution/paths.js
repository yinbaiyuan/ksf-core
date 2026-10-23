import { isAbsolute } from 'node:path';
import { launcherFiles } from './products.js';

export function validRelative(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 1000 && !isAbsolute(path) &&
    !/[\\\x00-\x1f\x7f:]/.test(path) && path.split('/').every(p => p && p !== '.' && p !== '..' && p !== '.git');
}
export function managedPath(path) {
  return validRelative(path) && (path === 'AGENTS.md' || launcherFiles.includes(path) ||
    (path.startsWith('.agents/core/') && !path.split('/').some(p => ['.agents/runtime-data', '.DS_Store'].includes(p)) &&
      !/^\.agents\/core\/(?:release\.json|\.manifest\.yaml\..*\.tmp)$/.test(path)));
}
