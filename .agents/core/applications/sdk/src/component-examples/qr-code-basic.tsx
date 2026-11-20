import {useState} from 'react';
import {QRCode} from '@ksf/sdk/qr-code';
import {Button} from '@ksf/sdk/button';
import {Card} from '@ksf/sdk/card';
import {TextField} from '@ksf/sdk/text-field';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function QRCodeBasicExample(){const [value,setValue]=useState('https://ant.design/components/');return <div className='ksf-demo-stack'><TextField label='二维码内容' value={value} onValueChange={setValue} description='文本在本地编码，不发起请求'/><QRCode value={value} label='组件资料二维码'/></div>;}
