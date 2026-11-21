import {Button} from '@ksf/sdk/button';
import {Slider} from '@ksf/sdk/slider';
import { useId } from 'react';
import { DOCK_SIZE } from '../desktop-model';
import { SettingsGroup } from './settings-controls';
export function DockSizeSettings({ size, change }: {
    size: number;
    change: (size: number) => void;
}) {
    const id = useId();
    return <SettingsGroup title="Dock 大小" description="调整图标大小，Dock 高度随尺寸变化。" action={<Button type="button" className="settings-button" disabled={size === DOCK_SIZE.default} onClick={() => change(DOCK_SIZE.default)}>恢复默认</Button>}>
    <div className="dock-size-setting"><div><label htmlFor={id}>图标大小</label><output htmlFor={id}>{size} 像素</output></div><Slider id={id} min={DOCK_SIZE.min} max={DOCK_SIZE.max} step={1} value={size} aria-label="Dock 图标大小" aria-valuetext={`${size} 像素`} onValueChange={change} label="Dock 图标大小"/><div className="dock-size-labels" aria-hidden="true"><span>小</span><span>大</span></div></div>
  </SettingsGroup>;
}
