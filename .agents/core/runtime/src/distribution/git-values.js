export const isRevision = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
export const isRepository = value => typeof value === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) &&
  !value.split('/').some(part => part === '.' || part === '..');
export const isBranch = value => typeof value === 'string' && value.length > 0 && value !== '@' &&
  !value.startsWith('-') && !value.includes('..') && !value.includes('@{') &&
  !/[\x00-\x20\x7f~^:?*\[\\]/.test(value) &&
  value.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.') && !part.endsWith('.lock'));

