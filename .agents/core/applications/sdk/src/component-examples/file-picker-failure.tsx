import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {FilePicker} from '@ksf/sdk/file-picker';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FilePickerFailureExample(){const [fail,setFail]=useState(true);return <FilePicker label='模拟应用选择' onPick={async()=>{if(fail){setFail(false);throw new Error('选择失败');}return [{id:'a',name:'恢复后的资料.txt'}];}}/>;}
