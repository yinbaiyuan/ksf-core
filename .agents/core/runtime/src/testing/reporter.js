// A private child-process channel, not the public CLI JSON response.
export default async function* reporter(events) {
  for await (const event of events) yield JSON.stringify(event, (_key, value) => value instanceof Error ? { name: value.name, message: value.message, stack: value.stack, code: value.code, cause: value.cause } : value) + '\n';
}
