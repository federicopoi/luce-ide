const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// Exercise the production pairing functions with an isolated browser store.
function phone(current, consent = false) {
  const values = new Map();
  if (current) values.set('pairing', JSON.stringify(current));
  const prompts = [];
  const context = {
    URL, atob, storageKey: 'pairing',
    location: {origin: 'https://luce.example', pathname: '/', search: '', hash: ''},
    history: {replaceState() {}},
    localStorage: {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)},
    showToast() {},
    confirmChoice: async (...args) => { prompts.push(args); return consent; },
  };
  const source = fs.readFileSync('src/mobile/mobile.js', 'utf8');
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function readPairing()'), source.indexOf('function safeText(')), context);
  return {context, prompts, saved: () => JSON.parse(values.get('pairing') || 'null')};
}
const original = {hostId: 'host-1', deviceId: 'device-1', key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', relayURL: 'https://luce.example'};
const changedKey = {...original, key: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'};

test('a key-only pairing replacement requires consent and cancel preserves the original key', async () => {
  const browser = phone(original);
  const result = await browser.context.acceptPairing(changedKey);
  assert.deepEqual(browser.saved(), original);
  assert.equal(result.key, original.key);
  assert.equal(browser.prompts.length, 1);
});

test('a key-only pairing replacement saves the new key after consent', async () => {
  const browser = phone(original, true);
  await browser.context.acceptPairing(changedKey);
  assert.equal(browser.prompts.length, 1);
  assert.deepEqual(browser.saved(), changedKey);
});

test('first and identical pairings do not require replacement consent', async () => {
  for (const current of [null, original]) {
    const browser = phone(current);
    await browser.context.acceptPairing(original);
    assert.deepEqual(browser.saved(), original);
    assert.equal(browser.prompts.length, 0);
  }
});

test('pairing links for another relay never replace a stored pairing', () => {
  const browser = phone(original);
  browser.context.location.hash = '#pair=' + Buffer.from(JSON.stringify({...changedKey, relayURL: 'https://foreign.example'})).toString('base64url');
  assert.equal(browser.context.readPairing(), null);
  assert.deepEqual(browser.saved(), original);
});
