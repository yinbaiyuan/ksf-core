import type {DesktopPreferences} from './desktop-model.js';
import type {MaterialSettings} from './material-settings.js';
export function validateDesktop(value:unknown):DesktopPreferences;
export function validateAppearance(value:unknown):MaterialSettings;
export {defaultDesktop} from './desktop-model.js';
export {defaultMaterialSettings} from './material-settings.js';
