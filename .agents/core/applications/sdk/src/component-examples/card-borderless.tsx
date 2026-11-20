import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Card} from '@ksf/sdk/card';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CardBorderlessExample(){return <Card title='项目资料' bordered={false}>适合有底色的容器区域。</Card>;}
