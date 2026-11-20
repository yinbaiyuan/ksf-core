import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Divider} from '@ksf/sdk/divider';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function DividerLineVariantsExample(){return <div className='ksf-demo-stack'>{(['solid','dashed','dotted'] as const).map(variant=><Divider variant={variant} key={variant}>{variant}</Divider>)}</div>;}
