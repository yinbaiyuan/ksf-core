/** Host DOM ownership. Window and card roots use the same boundary; UI preview roots do not grant ownership. */
export function surfaceOwner(element:Element|null):string|null {
 const root=element?.closest<HTMLElement>('[data-surface-owner],[data-window-id]');
 return root?.dataset.surfaceOwner??root?.dataset.windowId??null;
}
