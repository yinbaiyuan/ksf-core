import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ColorPicker} from '@ksf/sdk/color-picker';
import {Popover} from '@ksf/sdk/popover';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ColorPickerFooterExample(){return <ColorPicker label='有帮助说明的颜色' presets={['#005fb8','#60cdff','#0f7b0f','#9d5d00','#c42b1c','#282828']} panelFooter={<span>颜色值由当前应用持有，不修改KSF主题。</span>}/>;}
