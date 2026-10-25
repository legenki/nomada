import type { SpoofConfig } from '../types';
import { acceptLanguageFor } from '../lib/country-locales';

// Shared with src/content/spoof-bridge.ts.
const CONFIG_KEY = 'nomadaSpoof';
const ACCEPT_LANGUAGE_RULE = 1;
const SCRIPTS: chrome.scripting.RegisteredContentScript[] = [
  // Order matters: the page-world script must be listening before the bridge speaks.
  { id: 'nomada-main', js: ['spoof-main.js'], world: 'MAIN' },
  { id: 'nomada-bridge', js: ['spoof-bridge.js'], world: 'ISOLATED' },
].map(s => ({
  ...s,
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchOriginAsFallback: true, // about:blank / srcdoc frames too
  persistAcrossSessions: false, // re-registered by the startup reconcile
} as chrome.scripting.RegisteredContentScript));

const ALL_RESOURCE_TYPES = Object.values(chrome.declarativeNetRequest.ResourceType);

/**
 * Make pages see `config` (or nothing, when null): page scripts are registered
 * only while spoofing so OFF injects nothing, and Accept-Language is rewritten
 * at the network layer where pages can't race it.
 */
export async function applySpoof(config: SpoofConfig | null): Promise<void> {
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: SCRIPTS.map(s => s.id) });

  if (!config) {
    if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: registered.map(s => s.id) });
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ACCEPT_LANGUAGE_RULE] });
    // Open tabs drop their overrides through the bridge's storage listener.
    await chrome.storage.session.remove(CONFIG_KEY);
    return;
  }

  await chrome.storage.session.set({ [CONFIG_KEY]: config });
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ACCEPT_LANGUAGE_RULE],
    addRules: [{
      id: ACCEPT_LANGUAGE_RULE,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [{
          header: 'accept-language',
          operation: chrome.declarativeNetRequest.HeaderOperation.SET,
          value: acceptLanguageFor(config.locale),
        }],
      },
      condition: { resourceTypes: ALL_RESOURCE_TYPES },
    }],
  });
  if (registered.length !== SCRIPTS.length) {
    if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: registered.map(s => s.id) });
    await chrome.scripting.registerContentScripts(SCRIPTS);
  }
}
