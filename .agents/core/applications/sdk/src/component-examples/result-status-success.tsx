import {Button} from '@ksf/sdk/button';
import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Result} from '@ksf/sdk/result';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function ResultStatusSuccessExample(){return <Result status='success' heading='成功结果' description='这里说明当前结果及可采取的下一步。' actions={<Button>返回列表</Button>}/>;}
