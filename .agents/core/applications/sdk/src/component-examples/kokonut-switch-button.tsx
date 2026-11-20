import {useState} from 'react';
import {ThemeToggle} from '@ksf/sdk/theme-toggle';
import {View} from '@ksf/sdk/view';
export default function Example(){const [theme,setTheme]=useState<'light'|'dark'>('light');return <View theme={theme}><div style={{padding:24,display:'flex',gap:16,alignItems:'center',background:'var(--ksf-color-surface)',borderRadius:16}}><ThemeToggle theme={theme} onThemeChange={setTheme}/><ThemeToggle theme={theme} onThemeChange={setTheme} size="small" showLabel={false}/><ThemeToggle theme={theme} onThemeChange={setTheme} size="large" disabled/></div></View>}
