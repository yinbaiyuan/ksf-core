import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {ColorPicker} from '@ksf/sdk/color-picker';
import {Popover} from '@ksf/sdk/popover';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ColorPickerAlphaExample(){const [value,setValue]=useState('#005fb899');return <div className='ksf-demo-stack'><ColorPicker label='带透明度颜色' alpha value={value} onValueChange={setValue}/><div style={{height:70,borderRadius:8,background:value,display:'grid',placeItems:'center',border:'1px solid var(--ksf-color-border)'}}>{value}</div></div>;}
