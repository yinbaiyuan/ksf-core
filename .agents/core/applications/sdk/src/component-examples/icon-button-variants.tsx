import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {IconButton} from '@ksf/sdk/icon-button';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function IconButtonVariantsExample(){const [value,setValue]=useState('');return <div className='ksf-demo-stack'><div className='ksf-demo-row'>{(['solid','outlined','soft','text','dashed'] as const).map(variant=><IconButton key={variant} variant={variant} tone='primary' icon={FolderGlyph} label={variant+'资料'} onClick={()=>setValue(variant)}/>)}</div><output>{value}</output></div>;}
