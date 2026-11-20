import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Fieldset} from '@ksf/sdk/fieldset';import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FieldsetNestedExample(){return <Fieldset legend='通知设置' ><Checkbox label='任务完成'/><Checkbox label='评审更新'/><Fieldset legend='显示选项'><Checkbox label='显示摘要'/></Fieldset></Fieldset>;}
