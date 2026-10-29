// Runs in the extension's isolated world next to spoof-main.ts. Page scripts
// can't reach chrome.storage, so this reads the spoof config and hands it to
// the page-world script — again whenever it changes, so switching proxies or
// turning Nomada off takes effect in already-open tabs without a reload.
import type { SpoofConfig } from '../types';

const KEY = 'nomadaSpoof';
const EVENT = 'nomada:config';
// Firefox keeps the config in local storage: it can't open session storage to content scripts.
const AREA = __TARGET__ === 'firefox' ? 'local' : 'session';

function send(config: SpoofConfig | null | undefined): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: config ? JSON.stringify(config) : '' }));
}

chrome.storage[AREA].get(KEY).then(r => send(r[KEY] as SpoofConfig | undefined), () => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === AREA && KEY in changes) send(changes[KEY].newValue as SpoofConfig | undefined);
});
