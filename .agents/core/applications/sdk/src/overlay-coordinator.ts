// One modal per owner. An application window cannot dismiss another window's sheet.
export function createOverlayCoordinator() {
  const current = new Map<string, { token: symbol; close: () => void }>();
  return {
    claim(token: symbol, owner: string, close: () => void) { const previous=current.get(owner); if (previous && previous.token !== token) previous.close(); current.delete(owner); current.set(owner, { token, close }); },
    release(token: symbol) { for(const [owner,value] of current)if(value.token===token){current.delete(owner);break;} },
    owner: () => [...current.keys()].at(-1) ?? null,
  };
}
export const overlays = createOverlayCoordinator();
export type OverlayCoordinator = ReturnType<typeof createOverlayCoordinator>;
