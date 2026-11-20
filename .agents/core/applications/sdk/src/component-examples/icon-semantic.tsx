import {useState,useRef,useEffect,useId,useMemo} from 'react';
import {Icon} from '@ksf/sdk/icon';
import {DemoPanel,SearchGlyph,CheckGlyph,FolderGlyph,ArrowGlyph} from '@ksf/sdk/component-examples/showcase-utils';
import '@ksf/sdk/component-examples/catalog-examples.css';
export function IconSemanticExample(){const TwoTone=(props:import('react').SVGProps<SVGSVGElement>)=><svg viewBox='0 0 24 24' {...props}><circle cx='12' cy='12' r='10' fill='var(--ksf-color-primary-surface)'/><path d='m7 12 3 3 7-7' stroke='var(--ksf-color-primary)' strokeWidth='2' fill='none'/></svg>;return <div className='ksf-demo-row'><Icon icon={CheckGlyph} label='已完成' size={28} style={{color:'var(--ksf-color-success)'}}/><Icon icon={TwoTone} label='双色勾选' size={32}/><Icon icon={SearchGlyph} size={24} style={{color:'var(--ksf-color-danger)'}}/></div>;}
