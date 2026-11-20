import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {NumberField} from '@ksf/sdk/number-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function NumberFieldPrefixSuffixExample(){return <div className='ksf-demo-stack'><NumberField label='预算' prefix='¥' suffix='元' defaultValue={1200} step={100}/><NumberField label='完成度' suffix='%' defaultValue={65} min={0} max={100}/></div>;}
