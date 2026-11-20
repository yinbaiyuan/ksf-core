import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Card} from '@ksf/sdk/card';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CardFooterExample(){return <Card title='项目资料' footer={<small>更新于 11 月 18 日</small>}>展示摘要与来源说明。</Card>;}
