import { readData } from '../lib/storage';
import { resolveIconPaths } from '../lib/icon-paths';
import { nearestIconColor } from '../lib/icon-color';
import { countryOfGeo } from '../lib/locations';
import { isGeoActive } from '../lib/state';
import { activeProfileOf } from './proxy';

/**
 * Sync the toolbar icon and badge to the current stored state:
 * - colour: grey when not protecting, profile-tinted (or green) when ON
 * - badge: the location's country code when ON, empty otherwise
 */
export async function refreshIcon(): Promise<void> {
  const data = await readData();
  const on = isGeoActive(data) || !!activeProfileOf(data);
  const proxyColor = on ? nearestIconColor(activeProfileOf(data)?.color) : null;

  const badge = on && isGeoActive(data) ? countryOfGeo(data.geo) ?? '' : '';
  await Promise.allSettled([
    chrome.action.setIcon({ path: resolveIconPaths(on, proxyColor) }),
    chrome.action.setBadgeText({ text: badge }),
    chrome.action.setBadgeBackgroundColor({ color: '#1a7f37' }),
    chrome.action.setBadgeTextColor({ color: '#ffffff' }),
  ]);
}
