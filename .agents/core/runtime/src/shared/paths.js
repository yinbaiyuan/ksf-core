import { sep } from 'node:path';
export const portable = path => path.split(sep).join('/');
