import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Card} from '@ksf/sdk/card';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CardExtraExample(){return <Card title='项目资料' extra={<Button size='small' variant='text'>更多</Button>}>卡片右上角可以承载应用操作。</Card>;}
