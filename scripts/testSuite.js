const assert = require('assert');

// 1. Test Base62 Logic
const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = BigInt(BASE62_CHARS.length);

function encodeBase62(num) {
  let value = BigInt(num);
  if (value === 0n) return BASE62_CHARS[0];
  let result = '';
  while (value > 0n) {
    const rem = Number(value % BASE);
    result = BASE62_CHARS[rem] + result;
    value = value / BASE;
  }
  return result;
}

function decodeBase62(str) {
  let result = 0n;
  for (let i = 0; i < str.length; i++) {
    const idx = BASE62_CHARS.indexOf(str[i]);
    if (idx === -1) throw new Error('Invalid Base62');
    result = result * BASE + BigInt(idx);
  }
  return result;
}

console.log('Testing Base62 encoder/decoder...');
assert.strictEqual(encodeBase62(100000), 'q0U');
assert.strictEqual(decodeBase62('q0U'), 100000n);
assert.strictEqual(decodeBase62(encodeBase62(987654321n)), 987654321n);
console.log('✅ Base62 encoder/decoder passed.');

// 2. Test Expiry-Bounded TTL calculation
function computeCacheTtlSeconds(expiresAt, nowMs = Date.now()) {
  const MAX_CACHE_TTL_SECONDS = 86400;
  if (!expiresAt) return MAX_CACHE_TTL_SECONDS;
  const expiryMs = new Date(expiresAt).getTime();
  const remainingSeconds = Math.floor((expiryMs - nowMs) / 1000);
  if (remainingSeconds <= 0) return 0;
  return Math.min(MAX_CACHE_TTL_SECONDS, remainingSeconds);
}

console.log('Testing Expiry-Bounded TTL...');
const now = Date.now();
// Expired 10s ago
assert.strictEqual(computeCacheTtlSeconds(new Date(now - 10000), now), 0);
// Expires in 300s (5 min) -> should be 300, NOT 86400
assert.strictEqual(computeCacheTtlSeconds(new Date(now + 300000), now), 300);
// Expires in 3 days -> capped at 86400 (24h)
assert.strictEqual(computeCacheTtlSeconds(new Date(now + 3 * 86400 * 1000), now), 86400);
// Permanent (null) -> 86400
assert.strictEqual(computeCacheTtlSeconds(null, now), 86400);
console.log('✅ Expiry-bounded TTL calculation passed.');

// 3. Test URL Protocol & Self-Redirect Rejection
function validateUrl(urlString, currentHost = 'hesishort.onrender.com') {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Invalid protocol' };
    }
    const targetHost = parsed.hostname.toLowerCase();
    const selfHosts = ['localhost', '127.0.0.1', 'hesishort.onrender.com', currentHost.toLowerCase().split(':')[0]];
    if (selfHosts.includes(targetHost)) {
      return { valid: false, reason: 'Self-redirect loop' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid format' };
  }
}

console.log('Testing URL validator...');
assert.strictEqual(validateUrl('javascript:alert(1)').valid, false);
assert.strictEqual(validateUrl('data:text/html,<h1>hack</h1>').valid, false);
assert.strictEqual(validateUrl('file:///etc/passwd').valid, false);
assert.strictEqual(validateUrl('https://hesishort.onrender.com/loop').valid, false);
assert.strictEqual(validateUrl('http://localhost:4000/loop').valid, false);
assert.strictEqual(validateUrl('https://github.com/Sparshtub').valid, true);
console.log('✅ URL validator passed.');

// 4. Test Reserved Alias check
const RESERVED = new Set(['api', 'health', 'favicon.ico', 'robots.txt', 'dashboard', 'admin']);
assert.strictEqual(RESERVED.has('api'), true);
assert.strictEqual(RESERVED.has('health'), true);
assert.strictEqual(RESERVED.has('my-link'), false);
console.log('✅ Reserved aliases filter passed.');

console.log('\n🎉 ALL UNIT & VALIDATION TESTS PASSED CLEANLY!');
