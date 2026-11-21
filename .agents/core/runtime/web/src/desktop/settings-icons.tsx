import {useId,type ComponentType} from 'react';
import {
 Settings24Color,Settings24Regular,Person24Color,Person24Regular,
 PaintBrush24Color,PaintBrush24Regular,Laptop24Color,Laptop24Regular,
 Agents24Color,Agents24Regular,Globe24Color,Globe24Regular,
 PuzzlePiece24Color,PuzzlePiece24Regular,Apps24Color,Apps24Regular,
 Shield24Color,Shield24Regular,Info24Regular,BookOpen24Color,BookOpen24Regular,
 ChevronRight20Regular,ArrowLeft20Regular,ArrowSync24Regular,DocumentText24Regular,
 Link24Regular,Database24Regular,WeatherSunny24Regular,WeatherMoon24Regular,
 type FluentIconsProps,
} from '@fluentui/react-icons';

const categoryIcons={
 instance:[Settings24Color,Settings24Regular],personal:[Person24Color,Person24Regular],
 appearance:[PaintBrush24Color,PaintBrush24Regular],desktop:[Laptop24Color,Laptop24Regular],
 ai:[Agents24Color,Agents24Regular],communication:[Globe24Color,Globe24Regular],
 applications:[PuzzlePiece24Color,PuzzlePiece24Regular],runtime:[Apps24Color,Apps24Regular],
 diagnostics:[Shield24Color,Shield24Regular],about:[Info24Regular,Info24Regular],
 quickstart:[BookOpen24Color,BookOpen24Regular],
} satisfies Record<string,readonly ComponentType<FluentIconsProps>[]>;
export type SettingsCategory=keyof typeof categoryIcons;
/** Official Fluent artwork; high-contrast preferences use the monochrome equivalent. */
export function SettingsCategoryIcon({category,size=24}:{category:SettingsCategory;size?:number}){
 const id=useId(),[Color,Regular]=categoryIcons[category];
 return <span className="settings-category-art" style={{width:size,height:size}} aria-hidden="true"><Color className="settings-icon-color" idPrefix={'settings-'+id} width={size} height={size}/><Regular className="settings-icon-contrast" width={size} height={size}/></span>;
}
const itemIcons={general:Settings24Regular,person:Person24Regular,document:DocumentText24Regular,
 connection:Link24Regular,history:ArrowSync24Regular,privacy:Shield24Regular,
 data:Database24Regular,desktop:Laptop24Regular,sun:WeatherSunny24Regular,moon:WeatherMoon24Regular};
export function SettingsItemIcon({kind='general',size=24}:{kind?:keyof typeof itemIcons;size?:number}){
 const Icon=itemIcons[kind];return <Icon width={size} height={size} aria-hidden="true"/>;
}
export function settingsLinkIcon(title:string){
 if(/协作|身份|用户/.test(title))return 'person';
 if(/任务|日志|记录|检查/.test(title))return 'history';
 if(/连接|配对|接收|分发/.test(title))return 'connection';
 if(/Desktop|桌面|外观/.test(title))return 'desktop';
 if(/原文|配置 JSON|手册/.test(title))return 'document';
 if(/隐私|授权/.test(title))return 'privacy';
 if(/存储|额度|配置/.test(title))return 'data';
 return 'general';
}
export {ChevronRight20Regular as SettingsChevron,ArrowLeft20Regular as SettingsBackIcon};
