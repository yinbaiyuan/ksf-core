import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Checkbox,CheckboxGroup} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CheckboxLayoutExample(){return <CheckboxGroup label='两列选项' options={['阅读','编辑','分享','评论','归档','审核'].map(value=>({value,label:value}))} style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12}}/>;}
