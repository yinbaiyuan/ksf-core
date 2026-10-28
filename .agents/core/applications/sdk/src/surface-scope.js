/** Stable CSS namespace; dots map to a character forbidden in application IDs. */
export const applicationScope = (appId,version) => `ksf-app-${appId.replaceAll('.', '_')}--${version.replaceAll('.', '_')}`;
