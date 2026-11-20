import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Tag} from '@ksf/sdk/tag';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TagDisabledExample(){return <div className='ksf-demo-row'><Tag disabled checkable>不可选择</Tag><Tag title='完整的交付范围说明' style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>一段较长的交付范围说明，用标题提供全文</Tag></div>;}
