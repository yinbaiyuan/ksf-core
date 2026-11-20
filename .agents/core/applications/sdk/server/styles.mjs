import postcss from 'postcss';
import {applicationScope} from '../src/surface-scope.js';
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Scope application selectors; SDK context gives portals the same namespace. */
export function scopeApplicationCSS(source, manifest) {
  const className = applicationScope(manifest.id, manifest.version);
  // Bundled controls must win over the host's legacy UI descendant rules.
  // A constant namespace weight preserves the application's own cascade while
  // covering both content and portal roots, without depending on host markup.
  const scope = `.${className}.${className}.${className}`, root = postcss.parse(source), keyframes = new Map();
  root.walkAtRules(/keyframes$/, rule => {
    const previous = rule.params;
    rule.params = className + '-' + previous;
    keyframes.set(previous, rule.params);
  });
  root.walkRules(rule => {
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return;
    }
    rule.selectors = rule.selectors.flatMap(selector => {
      // WindowToolbar's legacy surface styles deliberately defer to the host's
      // toolbar appearance; strengthening them would override dark host chrome.
      const prefix = selector.startsWith(':where(.ksf-sdk-surface)') ? `:where(.${className})` : scope;
      return [prefix + ' ' + selector, ...(/^[.[:]/.test(selector) ? [prefix + selector] : [])];
    });
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
