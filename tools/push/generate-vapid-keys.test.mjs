import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('./generate-vapid-keys.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('키 쌍은 P-256이며 재실행해도 바뀌지 않고 출력에 노출되지 않음', () => {
  const folder = mkdtempSync(join(tmpdir(), 'jette-vapid-'));
  try {
    const output = join(folder, 'push.properties');
    const result = run('--subject', 'https://example.com/project', '--output', output);
    assert.equal(result.status, 0, result.stderr);
    const original = readFileSync(output, 'utf8');
    const props = Object.fromEntries(original.split('\n').filter(line => line.startsWith('push.')).map(line => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }));
    const key = createECDH('prime256v1');
    key.setPrivateKey(Buffer.from(props['push.vapid.private-key'], 'base64url'));
    assert.equal(key.getPublicKey(undefined, 'uncompressed').toString('base64url'), props['push.vapid.public-key']);
    assert.equal(Buffer.from(props['push.vapid.public-key'], 'base64url').length, 65);
    assert.ok(!result.stdout.includes(props['push.vapid.private-key']));
    assert.equal(run('--subject', 'mailto:new@example.com', '--output', output).status, 0);
    assert.equal(readFileSync(output, 'utf8'), original);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('연락 주소 없는 생성과 저장소 안의 개인 키 저장을 차단', () => {
  assert.equal(run().status, 1);
  assert.equal(run('--subject', 'https://localhost').status, 1);
  assert.equal(run('--subject', 'mailto:admin@example.com', '--output', join(dirnameOfScript(), 'push.properties')).status, 1);
});

function dirnameOfScript() { return fileURLToPath(new URL('.', import.meta.url)); }
