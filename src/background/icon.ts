import { readData } from '../lib/storage';
import { resolveIconPaths } from '../lib/icon-paths';
import { isProtected, proxyPlaceOf } from '../lib/state';

/**
 * Sync the toolbar icon and badge to the current stored state:
 * - colour: grey when off, green when protected (profiles no longer have a
 *   colour of their own — their cards show the exit country's flag)
 * - badge: the proxy location's country code when protected
 */
export async function refreshIcon(): Promise<void> {
  const data = await readData();
  const on = isProtected(data);
  const badge = on ? proxyPlaceOf(data)?.countryCode ?? '' : '';
  await Promise.allSettled([
    chrome.action.setIcon({ path: resolveIconPaths(on, null) }),
    chrome.action.setBadgeText({ text: badge }),
    chrome.action.setBadgeBackgroundColor({ color: '#1a7f37' }),
    chrome.action.setBadgeTextColor({ color: '#ffffff' }),
  ]);
}
