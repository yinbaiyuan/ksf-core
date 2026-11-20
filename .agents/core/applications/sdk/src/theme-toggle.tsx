import {forwardRef,type ButtonHTMLAttributes} from 'react';
import SwitchButton from './fidelity/kokonut/switch-button';
import {FidelityScope} from './fidelity/scope';
export interface ThemeToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>,'onChange'> {theme:'light'|'dark';onThemeChange:(theme:'light'|'dark')=>void;size?:'small'|'medium'|'large';showLabel?:boolean}
export const ThemeToggle=forwardRef<HTMLButtonElement,ThemeToggleProps>(function ThemeToggle({theme,onThemeChange,size='medium',showLabel=true,...props},ref){return <FidelityScope theme={theme} module="switch-button" inline><span ref={node=>{if(typeof ref==='function')ref(node?.querySelector('button')??null);else if(ref)ref.current=node?.querySelector('button')??null;}} data-ksf-theme={theme}><SwitchButton {...props} theme={theme} onThemeChange={onThemeChange} size={size==='small'?'sm':size==='large'?'lg':'default'} showLabel={showLabel} reveal={false}/></span></FidelityScope>});
