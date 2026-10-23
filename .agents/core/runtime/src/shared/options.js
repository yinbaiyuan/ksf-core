// Shared lexical mechanics only. Commands own operation/target validation,
// help, error classes and output envelopes.
export const optionSpecs = (names, overrides = {}) => Object.fromEntries(names.map(name => [name,
  overrides[name] ?? { kind: ['json', 'help', 'dry-run'].includes(name) ? 'flag' : 'value' }]));
const camel = name => name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
export function hasJsonFlag(args) {
  const end = args.indexOf('--');
  return (end < 0 ? args : args.slice(0, end)).includes('--json');
}
export function parseOptions(args, { result, options, target, invalid, messages = {} }) {
  const seen = new Set();
  let ended = false;
  const reject = (kind, name, fallback) => invalid(typeof messages[kind] === 'function' ? messages[kind](name) : messages[kind] ?? fallback);
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!ended && token === '--') { ended = true; continue; }
    if (ended || !token.startsWith('-')) { target(token); continue; }
    const match = /^(?:--([a-z][a-z-]*)(?:=(.*))?|-([h]))$/s.exec(token);
    if (!match) reject('unknown', undefined, 'Unknown option.');
    const name = match[1] ?? 'help', inline = match[2];
    if (!Object.hasOwn(options, name)) reject('unsupported', name, `Option --${name} is not supported here.`);
    if (seen.has(name)) reject('repeated', name, `Option --${name} cannot be repeated.`);
    seen.add(name);
    const spec = options[name], key = spec.key ?? camel(name);
    spec.before?.();
    if (spec.kind === 'flag') {
      if (inline !== undefined) reject('flagValue', name, `Option --${name} does not accept a value.`);
      result[key] = true;
    } else if (spec.kind === 'many') {
      const values = inline === undefined ? [] : [inline];
      if (inline === undefined || spec.inlineContinues) {
        while (i + 1 < args.length && !args[i + 1].startsWith('-')) values.push(args[++i]);
      }
      if (!values.length) invalid(spec.missing);
      spec.validate?.(values);
      result[key] = spec.unique ? [...new Set(values)] : values;
    } else {
      const value = inline ?? args[++i];
      if (value === undefined || (inline === undefined && value.startsWith('-'))) {
        if (spec.missing) invalid(spec.missing);
        reject('missing', name, `Option --${name} requires a value.`);
      }
      spec.validate?.(value);
      result[key] = value;
    }
  }
  return seen;
}
