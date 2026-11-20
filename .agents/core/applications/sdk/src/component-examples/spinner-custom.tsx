import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Spinner} from '@ksf/sdk/spinner';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function SpinnerCustomExample(){return <Spinner indicator={<span style={{fontSize:28}}>◌</span>} label='正在读取资料'/>;}
