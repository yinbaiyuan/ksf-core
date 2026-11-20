import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {QRCode} from '@ksf/sdk/qr-code';import {mediaSamples} from '@ksf/sdk/component-examples/media-samples';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function QrCodeColorsExample(){return <QRCode value='https://ksf.localhost/components' foreground='var(--ksf-color-primary)' background='var(--ksf-color-surface)'/>;}
