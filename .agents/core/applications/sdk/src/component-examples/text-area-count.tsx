import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {TextArea} from '@ksf/sdk/text-area';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function TextAreaCountExample(){return <TextArea label='项目说明' defaultValue='可以继续输入中文内容，或一次清空。' showCount maxLength={120} clearable minRows={4}/>;}
