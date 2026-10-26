import assert from 'node:assert';
import { getValidSelectedAppId } from './SendTestNotificationModal.tsx';

const apps = [
  { id: 'app_1', name: 'Apex Commerce', environment: 'production' },
  { id: 'app_2', name: 'Support Console', environment: 'staging' },
] as any;

function runSelectionTests() {
  const noApps = getValidSelectedAppId([], 'app_1');
  assert.strictEqual(noApps, '', 'empty app list should clear the selection');

  const keepsValidSelection = getValidSelectedAppId(apps, 'app_2');
  assert.strictEqual(keepsValidSelection, 'app_2', 'a valid current selection should remain selected');

  const fallsBackToFirstApp = getValidSelectedAppId(apps, 'missing_app');
  assert.strictEqual(fallsBackToFirstApp, 'app_1', 'stale or missing ids should fall back to the first available app');

  const picksFirstWhenCurrentBlank = getValidSelectedAppId(apps, '');
  assert.strictEqual(picksFirstWhenCurrentBlank, 'app_1', 'blank selections should resolve to the first app');
}

runSelectionTests();
console.log('✅ SendTestNotificationModal selection regression tests passed');
