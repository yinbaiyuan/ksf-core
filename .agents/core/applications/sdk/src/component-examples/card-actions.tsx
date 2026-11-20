import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Card} from '@ksf/sdk/card';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CardActionsExample(){return <Card title='项目资料' actions={[<Button key='edit' variant='text'>编辑</Button>,<Button key='view' variant='text'>查看</Button>]}>将同级操作组合在底部。</Card>;}
