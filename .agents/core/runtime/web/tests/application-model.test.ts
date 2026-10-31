import test from 'node:test';
import assert from 'node:assert/strict';
import { appFromSearch, appSearch, resourceKey } from '../src/apps/app-services.ts';
import { releaseKey, permissionName } from '../src/apps/application-model.ts';
test('installed application links survive URL navigation and keep version identities separate', () => {
  const search = appSearch('com.example.editor', 'path=ignored&resource=document-1');
  assert.equal(appFromSearch(search), 'com.example.editor'); assert.equal(resourceKey('com.example.editor', search), 'document-1');
  assert.equal(appFromSearch('app=https://example.com/evil.js'), 'com.ksf.conversations');
  assert.notEqual(releaseKey('com.example.editor', 'first'), releaseKey('com.example.editor', 'second'));
  assert.match(permissionName('shell'), /本机 Shell/); assert.equal(permissionName('custom.data.read'), 'custom.data.read');
});
