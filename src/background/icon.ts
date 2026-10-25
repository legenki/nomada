import { readData } from '../lib/storage';
import { resolveIconPaths } from '../lib/icon-paths';
import { nearestIconColor } from '../lib/icon-color';
import { activeProfileOf, isProtected, proxyPlaceOf } from '../lib/state';

/**
 * Sync the toolbar icon and badge to the current stored state:
 * - colour: grey when off, tinted with the proxy profile's colour when protected
 * - badge: the proxy location's country code when protected
 */
export async function refreshIcon(): Promise<void> {
  const data = await readData();
  const on = isProtected(data);
  const proxyColor = on ? nearestIconColor(activeProfileOf(data)?.color) : null;
  const badge = on ? proxyPlaceOf(data)?.countryCode ?? '' : '';
  await Promise.allSettled([
    chrome.action.setIcon({ path: resolveIconPaths(on, proxyColor) }),
    chrome.action.setBadgeText({ text: badge }),
    chrome.action.setBadgeBackgroundColor({ color: '#1a7f37' }),
    chrome.action.setBadgeTextColor({ color: '#ffffff' }),
  ]);
}
