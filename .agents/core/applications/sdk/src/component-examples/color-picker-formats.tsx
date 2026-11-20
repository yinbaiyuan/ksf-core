import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ColorPicker} from '@ksf/sdk/color-picker';
import {Popover} from '@ksf/sdk/popover';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ColorPickerFormatsExample(){return <div className='ksf-demo-stack'><ColorPicker label='HEX格式' defaultFormat='hex' showValue/><ColorPicker label='HSB格式' defaultFormat='hsb' showValue/><ColorPicker showValue label='RGB格式' defaultFormat='rgb'/><ColorPicker showValue label='HSL格式' defaultFormat='hsl'/></div>;}
