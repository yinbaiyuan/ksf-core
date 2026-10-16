export class MetadataError extends Error {
  constructor(code, message, { exitCode = 1, ...details } = {}) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function invalid(message) {
  throw new MetadataError('INVALID_ARGUMENTS', message, { exitCode: 2 });
}

export function decodeUtf8(bytes, target) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new MetadataError('ENCODING_INVALID', 'Expected UTF-8 text.', { target });
  }
}
