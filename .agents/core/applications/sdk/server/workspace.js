export const workspaceSkippedDirectories = new Set(['.git', 'node_modules', '.DS_Store', '.cache', '.next', '.venv', '__pycache__', 'dist', 'target', 'build']);
const SKIP=workspaceSkippedDirectories;
const PRIVATE = /^(?:\.env(?:\..*)?|\.git-credentials|\.?netrc|_netrc|\.npmrc|\.pypirc|\.ssh|\.aws|\.gnupg|\.azure|\.kube|\.docker|\.?credentials(?:\..*)?|auth\.json|id_(?:rsa|ed25519|ecdsa)(?:\.pub)?|identity\.key|.*\.(?:pem|p12|pfx|key))$/i;
export function filePolicy(path) {
  const parts = path.split('/');
  if (parts.some(p => p.toLowerCase() === '.git' || PRIVATE.test(p)) || /^\.agents\/runtime-data(?:\/|$)/i.test(path)) return 'blocked';
  if (/^档案\/对话\/(?:Codex|[^/]+\/turns)(?:\/|$)/i.test(path)) return 'readonly';
  if (parts.some(p => SKIP.has(p))) return 'readonly';
  if (/^\.agents(?:\/|$)/i.test(path) || ['agents.md', 'readme.md', '.gitignore'].includes(path.toLowerCase()) || path.toLowerCase().startsWith('.github/')) return 'system';
  return 'editable';
}
