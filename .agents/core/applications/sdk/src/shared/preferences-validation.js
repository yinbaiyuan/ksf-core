import {defaultDesktop, groupIcons, SQUARE_GRID} from './desktop-model.js';
import {defaultMaterialSettings, profileNames, profileLimits, backdropLimits} from './material-settings.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireValue = (ok, message) => { if (!ok) throw Object.assign(new Error(message), {code:'PREFERENCES_INVALID'}); };
const exact = (value, keys) => requireValue(object(value) && Object.keys(value).every(key => keys.includes(key)), '设置包含未知字段或不是普通对象。');
export function validateDesktop(value) {
  exact(value, ['version','grid','groups','activeGroupId','bounds','shortcuts']);
  if (value.shortcuts !== undefined) {
    exact(value.shortcuts,['initialized','homeGroupId','installations']);
    requireValue(value.shortcuts.initialized === true && typeof value.shortcuts.homeGroupId === 'string' && value.shortcuts.homeGroupId.length <= 200 && object(value.shortcuts.installations), '应用图标同步记录无效。');
    requireValue(Object.entries(value.shortcuts.installations).length <= 1000 && Object.entries(value.shortcuts.installations).every(([id,token])=>id.length>0&&id.length<=80&&typeof token==='string'&&token.length>0&&token.length<=200),'应用安装身份无效。');
  }
  requireValue(value.version === 3 && value.grid === SQUARE_GRID.version, '桌面设置版本不受支持。');
  requireValue(Array.isArray(value.groups) && value.groups.length > 0 && value.groups.length <= 100, '桌面需要 1–100 个分组。');
  const ids = new Set(), names = new Set(), cards = new Set();
  for (const group of value.groups) {
    const applications = new Set();
    exact(group, ['id','name','icon','layout']);
    requireValue(typeof group.id === 'string' && group.id.length > 0 && group.id.length <= 200 && !ids.has(group.id), '分组标识无效或重复。'); ids.add(group.id);
    requireValue(typeof group.name === 'string' && group.name.trim() === group.name && [...group.name].length > 0 && [...group.name].length <= 20 && !names.has(group.name), '分组名称无效或重复。'); names.add(group.name);
    requireValue(groupIcons.includes(group.icon) && Array.isArray(group.layout) && group.layout.length <= 200, '分组图标或卡片列表无效。');
    for (const card of group.layout) {
      exact(card, ['i','x','y','w','h','minW','minH','appId','cardId','config','name','kind']);
      requireValue(card.kind === undefined || ['app','card'].includes(card.kind),'桌面项目类型无效。');
      if (card.kind === 'app') {
        requireValue(typeof card.appId === 'string' && card.appId.length > 0 && !applications.has(card.appId) && card.w===1 && card.h===1 && card.cardId===undefined && card.config===undefined,'应用图标需要独占一个格子，同一分组不可重复。');
        applications.add(card.appId);
      }
      requireValue(typeof card.i === 'string' && card.i.length > 0 && card.i.length <= 200 && !cards.has(card.i), '卡片标识无效或重复。'); cards.add(card.i);
      requireValue(['x','y','w','h'].every(key => Number.isSafeInteger(card[key])) && card.x >= 0 && card.y >= 0 && card.y <= 10000 && card.w >= 1 && card.w <= 12 && card.h >= 1 && card.h <= 12 && card.x + card.w <= 12, '卡片位置或尺寸无效。');
      for (const key of ['minW','minH']) requireValue(card[key] === undefined || Number.isSafeInteger(card[key]) && card[key] >= 1 && card[key] <= 12, '卡片最小尺寸无效。');
      for (const key of ['appId','cardId','name']) requireValue(card[key] === undefined || typeof card[key] === 'string' && card[key].length <= 200, '卡片名称或应用标识无效。');
      requireValue(card.config === undefined || new TextEncoder().encode(JSON.stringify(card.config)).length <= 64 * 1024, '卡片配置超过 64 KiB。');
    }
  }
  requireValue(ids.has(value.activeGroupId), '当前分组不存在。');
  exact(value.bounds, ['x','y','width','height']);
  requireValue(Object.values(value.bounds).every(Number.isFinite) && value.bounds.width > 0 && value.bounds.height > 0, '默认窗口尺寸无效。');
  return value;
}
export function validateAppearance(value) {
  exact(value, ['version','motion','backdrop','profiles']);
  requireValue(value.version === 1 && typeof value.motion === 'boolean', '外观设置版本或动效开关无效。');
  exact(value.backdrop, Object.keys(backdropLimits));
  for (const [key, [min,max]] of Object.entries(backdropLimits)) requireValue(Number.isFinite(value.backdrop[key]) && value.backdrop[key] >= min && value.backdrop[key] <= max, '背景参数超出范围：' + key);
  exact(value.profiles, Object.keys(profileNames));
  for (const id of Object.keys(profileNames)) {
    const profile = value.profiles[id]; exact(profile, [...Object.keys(profileLimits), 'tint','invert']);
    requireValue(typeof profile.tint === 'string' && /^#[a-f0-9]{6}$/i.test(profile.tint) && typeof profile.invert === 'boolean', '材质颜色或透镜方向无效。');
    for (const [key,[min,max]] of Object.entries(profileLimits)) requireValue(Number.isFinite(profile[key]) && profile[key] >= min && profile[key] <= max, '材质参数超出范围：' + key);
  }
  return value;
}
export {defaultDesktop, defaultMaterialSettings};
