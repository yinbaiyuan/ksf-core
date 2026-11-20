/** `control` means a native control change; its precise input device is deliberately not guessed. */
export type UIChangeSource='control'|'pointer'|'keyboard';
export interface UIValueChangeDetail {
 readonly reason:'input'|'clear'|'selection'|'toggle'|'step'|'commit';
 readonly source:UIChangeSource;
}
export const valueChange=(reason:UIValueChangeDetail['reason'],source:UIChangeSource='control'):Readonly<UIValueChangeDetail>=>Object.freeze({reason,source});
