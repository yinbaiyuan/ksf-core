export function adaptMermaidCSP(code: string, id: string): string | null;
export function mermaidCSPPlugin(): {
  name: string;
  enforce: 'pre';
  transform(code: string, id: string): {code: string; map: null} | null;
};
