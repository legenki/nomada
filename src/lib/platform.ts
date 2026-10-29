// What differs between the Chrome and Firefox builds (see vite.target.ts).

export const TARGET = __TARGET__;

/** Firefox can log in to SOCKS5 proxies; Chrome can't answer their auth. */
export const SOCKS_LOGIN = __TARGET__ === 'firefox';

/** Firefox routes each request itself (proxy.onRequest) and can't run a PAC script there. */
export const SUPPORTS_PAC = __TARGET__ === 'chrome';
