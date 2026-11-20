import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Fieldset} from '@ksf/sdk/fieldset';import {Checkbox} from '@ksf/sdk/checkbox';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function FieldsetDescriptionExample(){return <Fieldset legend='通知设置' description='通知仅在当前应用中使用，不会自动发送外部消息。'><Checkbox label='任务完成'/><Checkbox label='评审更新'/></Fieldset>;}
