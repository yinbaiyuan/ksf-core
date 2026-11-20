import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {NumberField} from '@ksf/sdk/number-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function NumberFieldWithoutControlsExample(){return <NumberField label='直接输入数值' controls={false} defaultValue={48}/>;}
