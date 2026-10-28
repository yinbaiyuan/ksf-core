import postcss from 'postcss';
import {applicationScope} from '../src/surface-scope.js';
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Scope application selectors; SDK context gives portals the same namespace. */
export function scopeApplicationCSS(source, manifest) {
  const className = applicationScope(manifest.id, manifest.version);
  const scope = `:where(.${className})`, root = postcss.parse(source), keyframes = new Map();
  root.walkAtRules(/keyframes$/, rule => {
    const previous = rule.params;
    rule.params = className + '-' + previous;
    keyframes.set(previous, rule.params);
  });
  root.walkRules(rule => {
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return;
    }
    rule.selectors = rule.selectors.flatMap(selector => [scope + ' ' + selector,
      ...(/^[.[:]/.test(selector) ? [scope + selector] : [])]);
  });
  root.walkDecls(decl => {
    if (/^(?:-webkit-)?animation(?:-name)?$/.test(decl.prop)) {
      for (const [before, after] of keyframes) {
        decl.value = decl.value.replace(new RegExp('(?<![\\w-])' + escape(before) + '(?![\\w-])', 'g'), after);
      }
    }
  });
  return root.toString();
}
