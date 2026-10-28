export interface WorkspaceFile { path: string; text: string; version: string; size: number; modifiedAt: string; policy: string; writable: boolean }
export interface TreeEntry { name: string; path: string; kind: 'directory' | 'file' | 'symlink'; policy: string }
