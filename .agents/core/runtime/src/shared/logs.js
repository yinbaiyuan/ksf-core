export const redactLog=text=>String(text).replace(/Bearer\s+[A-Za-z0-9._~-]+/gi,'Bearer [redacted]').replace(/((?:token|api[_-]?key|password|secret)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,'$1[redacted]');
