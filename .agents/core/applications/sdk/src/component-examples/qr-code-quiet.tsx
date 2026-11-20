import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {QRCode} from '@ksf/sdk/qr-code';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function QrCodeQuietExample(){return <QRCode value='https://ksf.localhost/components' quietZone={8} style={{border:'1px solid var(--ksf-color-border)',padding:8}}/>;}
