import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Text,Heading,InlineCode} from '@ksf/sdk/typography';
import {Link} from '@ksf/sdk/link';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TypographyHeadingsExample(){return <div className='ksf-demo-stack'>{([1,2,3,4,5,6] as const).map(level=><Heading level={level} key={level}>{level}级标题 · KSF组件库</Heading>)}</div>;}
