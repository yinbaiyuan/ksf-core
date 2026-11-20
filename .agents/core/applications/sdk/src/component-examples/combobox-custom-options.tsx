import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Combobox} from '@ksf/sdk/combobox';
import {SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph,DemoPanel} from '@ksf/sdk/component-examples/showcase-utils';

import '@ksf/sdk/component-examples/catalog-examples.css';
export function ComboboxCustomOptionsExample(){return <Combobox label='查询文档' options={[{value:'one',label:'研究资料',description:'最近更新于今天'},{value:'two',label:'交付记录',description:'包含3份清单'}]} renderOption={option=><div className='ksf-demo-row'><FolderGlyph/><div><strong>{option.label}</strong><small style={{display:'block',color:'var(--ksf-color-muted-foreground)'}}>{option.description}</small></div></div>}/>;}
