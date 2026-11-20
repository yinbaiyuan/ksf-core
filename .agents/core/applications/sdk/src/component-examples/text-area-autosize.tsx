import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextArea} from '@ksf/sdk/text-area';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextAreaAutosizeExample(){const [value,setValue]=useState('输入更多文字时会自动增高。');return <TextArea label='自动高度' value={value} onValueChange={setValue} autoSize minRows={2} maxRows={6}/>;}
