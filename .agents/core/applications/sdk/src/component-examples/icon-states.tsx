import {useState,type SVGProps} from 'react';
import {Button} from '@ksf/sdk/button';
import '@ksf/sdk/component-examples/catalog-examples.css';
import {Icon} from '@ksf/sdk/icon';
export function IconStatesExample(){const Glyph=(props:SVGProps<SVGSVGElement>)=><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' {...props}><path d='M20 11a8 8 0 1 0-3 7M20 3v8h-8'/></svg>;return <div className='ksf-demo-row'><Icon icon={Glyph} label='正在同步' spin size={24}/><Icon icon={Glyph} label='旋转45度' rotate={45} size={24}/><Icon icon={Glyph} size={32} style={{color:'var(--ksf-color-primary)'}}/><span>旋转、尺寸与继承语义色；动画遵循减少动态设置。</span></div>;}
