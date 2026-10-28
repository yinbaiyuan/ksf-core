const invalid = () => Object.assign(new Error('请使用有效的 IANA 时区。'), { code: 'INVALID_ARGUMENTS' });
const short = (value, limit = 160) => typeof value === 'string' ? [...value.replace(/\s+/g, ' ').trim()].slice(0, limit).join('') : '';
const shiftDay = (day, amount) => { const date = new Date(day + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
export function workPeriods(at, timeZone) {
  let format;
  try {
    if (typeof timeZone !== 'string' || timeZone.length > 100 || !timeZone) throw invalid();
    format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch { throw invalid(); }
  const dayAt = instant => { const parts = Object.fromEntries(format.formatToParts(instant).map(p => [p.type, p.value])); return `${parts.year}-${parts.month}-${parts.day}`; };
  // Find the first instant of a local calendar day. This also handles 23/25-hour
  // days, non-hour offsets and zones whose midnight itself is skipped.
  const midnight = day => {
    const base = Date.parse(day + 'T00:00:00Z'); let low = base - 48 * 3600000, high = base + 48 * 3600000;
    while (low < high) { const mid = Math.floor((low + high) / 2); if (dayAt(mid) < day) low = mid + 1; else high = mid; }
    return new Date(low).toISOString();
  };
  const today = dayAt(at), monday = shiftDay(today, -((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7));
  return { timeZone: format.resolvedOptions().timeZone,
    today: { startAt: midnight(today), endAt: midnight(shiftDay(today, 1)), startDate: today, endDate: today },
    week: { startAt: midnight(monday), endAt: midnight(shiftDay(monday, 7)), startDate: monday, endDate: shiftDay(monday, 6) } };
}
export function countWork(rows) {
  const tasks = new Set(), projects = new Set(), knowledge = new Set(), abilities = new Set();
  const sets = { project: projects, knowledge, ability: abilities };
  for (const row of rows) { tasks.add(row.taskId); for (const target of row.primaryTargets) sets[target.kind]?.add(target.key); }
  return { tasks: tasks.size, turns: rows.length, projects: projects.size, knowledge: knowledge.size, abilities: abilities.size };
}
export function createWorkStats(root,{now=Date.now,source}={}){
  const snapshots=new Map();let index,pending;
  async function build(){return {...await source(),at:now()};}
  async function read({ timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, refresh = false } = {}) {
    const periods = workPeriods(now(), timeZone); timeZone = periods.timeZone;
    if (pending) await pending;
    else if (refresh || !index || now() < index.at || now() - index.at >= 15000 || workPeriods(index.at, timeZone).today.startAt !== periods.today.startAt) {
      pending = build().then(result => { index = result; snapshots.clear(); }).finally(() => { pending = null; });
      await pending;
    }
    const bounds = workPeriods(now(), timeZone), key = `${timeZone}:${bounds.today.startAt}`;
    if (!snapshots.has(key)) {
      const activity = index.activity.filter(row => row.startedAt >= bounds.week.startAt && row.startedAt < bounds.week.endAt && Date.parse(row.startedAt) <= index.at);
      const today = activity.filter(row => row.startedAt >= bounds.today.startAt && row.startedAt < bounds.today.endAt);
      snapshots.set(key, { generatedAt: new Date(index.at).toISOString(), timeZone, today: { ...bounds.today, counts: countWork(today) }, week: { ...bounds.week, counts: countWork(activity) }, activity, capture: index.capture, errors: index.errors });
      if (snapshots.size > 8) snapshots.delete(snapshots.keys().next().value);
    }
    return snapshots.get(key);
  }
  return { read };
}
