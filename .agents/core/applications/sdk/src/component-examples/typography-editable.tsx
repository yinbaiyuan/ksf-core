import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Text,Heading,InlineCode} from '@ksf/sdk/typography';
import {Link} from '@ksf/sdk/link';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TypographyEditableExample(){const [value,setValue]=useState('点击编辑，Enter保存，Shift+Enter换行。');return <div className='ksf-demo-stack'><Text as='p' editable value={value} onValueChange={setValue} label='说明'/><output>当前值：{value}</output></div>;}
