import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {NumberField} from '@ksf/sdk/number-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function NumberFieldConstraintsExample(){return <NumberField label='数量' defaultValue={5} min={1} max={10} description='使用步进按钮或键盘调整，范围1至10。'/>;}
