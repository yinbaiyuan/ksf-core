import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Card} from '@ksf/sdk/card';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function CardHoverExample(){return <Card title='项目资料' hoverable>将焦点移动到操作按钮也能保留清晰反馈。</Card>;}
