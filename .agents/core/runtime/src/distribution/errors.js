export class DistributionError extends Error {
  constructor(code, message, data, exitCode = 1) {
    super(message); this.code = code; this.data = data; this.exitCode = exitCode;
  }
}
export function fail(code, message, data) { throw new DistributionError(code, message, data); }
export function invalid(message) { throw new DistributionError('INVALID_ARGUMENTS', message, undefined, 2); }
