// One business/system modal overlay at a time; the live material panel is nonmodal.
export function createOverlayCoordinator() {
  let current: { token: symbol; owner: string; close: () => void } | null = null;
  return {
    claim(token: symbol, owner: string, close: () => void) { if (current && current.token !== token) current.close(); current = { token, owner, close }; },
    release(token: symbol) { if (current?.token === token) current = null; },
    owner: () => current?.owner ?? null,
  };
}
export const overlays = createOverlayCoordinator();
