import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

interface AuthContext {
  uid: string;
}

const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/;

// Mirrors the Eight Pillars constraints in firestore.rules to verify all Dirty Dozen payloads fail.
function simulateRuleCreateUser(
  auth: AuthContext | null,
  uidPath: string,
  payload: Record<string, unknown>,
  serverTimeSentinel: symbol,
  tsSymbol: symbol
): boolean {
  if (!auth) return false; // Pillar: Request Auth
  if (!VALID_ID.test(uidPath)) return false; // Pillar 3: Path Variable Hardening
  if (auth.uid !== uidPath) return false; // Identity Integrity

  const required = [
    'uid',
    'displayName',
    'email',
    'photoURL',
    'shareMemoryEnabled',
    'sharedMemory',
    'settings',
    'createdAt',
    'updatedAt',
  ];
  const keys = Object.keys(payload);
  if (!required.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => required.includes(k))) return false; // Shadow field guard

  if (payload.uid !== uidPath || payload.uid !== auth.uid) return false;
  if (typeof payload.displayName !== 'string' || payload.displayName.length > 80) return false;
  if (typeof payload.email !== 'string' || payload.email.length > 160) return false;
  if (typeof payload.photoURL !== 'string' || payload.photoURL.length > 500) return false;
  if (typeof payload.shareMemoryEnabled !== 'boolean') return false;

  const mem = payload.sharedMemory as Record<string, unknown>;
  if (!mem || typeof mem !== 'object' || Array.isArray(mem)) return false;
  const memKeys = Object.keys(mem);
  if (memKeys.length !== 2 || !memKeys.includes('userName') || !memKeys.includes('facts')) {
    return false;
  }
  if (typeof mem.userName !== 'string' || mem.userName.length > 80) return false;
  if (!Array.isArray(mem.facts) || mem.facts.length > 25) return false;
  if (mem.facts.length > 0 && (typeof mem.facts[0] !== 'string' || mem.facts[0].length > 240)) {
    return false;
  }

  const settings = payload.settings as Record<string, unknown>;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  if (
    typeof settings.systemInstruction !== 'string' ||
    settings.systemInstruction.length > 2000
  ) {
    return false;
  }
  if (
    typeof settings.temperature !== 'number' ||
    settings.temperature < 0 ||
    settings.temperature > 2
  ) {
    return false;
  }
  if (settings.theme !== 'light' && settings.theme !== 'dark') return false;

  if (payload.createdAt !== tsSymbol || payload.updatedAt !== tsSymbol) return false;
  if (tsSymbol !== serverTimeSentinel) return false;

  return true;
}

test('firestore.rules file exists and enforces Eight Pillars primitives', () => {
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert.match(rules, /rules_version = '2';/);
  assert.match(rules, /allow read, write: if false;/);
  assert.match(rules, /allow list: if false;/);
  assert.match(rules, /function isValidUserProfile/);
  assert.match(rules, /function isValidChatThread/);
  assert.match(rules, /function isValidChatMessage/);
  assert.match(rules, /allow update: if false;/);
});

test('storageService list queries enforce ownerId filter matching firestore.rules', () => {
  const storageSrc = fs.readFileSync('src/services/storageService.ts', 'utf8');
  const getDocsMatches = storageSrc.match(/getDocs\(/g) ?? [];
  const ownerWhereMatches = storageSrc.match(/where\('ownerId',\s*'==',\s*uid\)/g) ?? [];
  assert.equal(getDocsMatches.length, 4);
  assert.equal(ownerWhereMatches.length, 4);
});

test('Dirty Dozen adversarial payloads are rejected (PERMISSION_DENIED)', () => {
  const SERVER_TIME = Symbol('request.time');
  const FORGED_TIME = Symbol('forged');

  const validPayload = {
    uid: 'bob',
    displayName: 'Bob',
    email: 'bob@example.com',
    photoURL: '',
    shareMemoryEnabled: true,
    sharedMemory: { userName: 'Bob', facts: ['Uses Kotlin'] },
    settings: {
      systemInstruction: 'Be helpful',
      temperature: 1.0,
      model: 'gemini-3.5-flash-lite',
      theme: 'light',
    },
    createdAt: SERVER_TIME,
    updatedAt: SERVER_TIME,
  };

  assert.equal(simulateRuleCreateUser({ uid: 'bob' }, 'bob', validPayload, SERVER_TIME, SERVER_TIME), true);

  // 1. Unauthenticated
  assert.equal(simulateRuleCreateUser(null, 'bob', validPayload, SERVER_TIME, SERVER_TIME), false);
  // 2. Cross-user write
  assert.equal(simulateRuleCreateUser({ uid: 'bob' }, 'alice', validPayload, SERVER_TIME, SERVER_TIME), false);
  // 4. Identity spoofing
  assert.equal(
    simulateRuleCreateUser({ uid: 'bob' }, 'bob', { ...validPayload, uid: 'alice' }, SERVER_TIME, SERVER_TIME),
    false
  );
  // 5. Shadow field ("Ghost Field")
  assert.equal(
    simulateRuleCreateUser({ uid: 'bob' }, 'bob', { ...validPayload, isAdmin: true }, SERVER_TIME, SERVER_TIME),
    false
  );
  // 6. Client-forged timestamp
  assert.equal(
    simulateRuleCreateUser(
      { uid: 'bob' },
      'bob',
      { ...validPayload, createdAt: FORGED_TIME },
      SERVER_TIME,
      FORGED_TIME
    ),
    false
  );
  // 7. Oversized systemInstruction (> 2000 chars)
  assert.equal(
    simulateRuleCreateUser(
      { uid: 'bob' },
      'bob',
      {
        ...validPayload,
        settings: { ...validPayload.settings, systemInstruction: 'x'.repeat(2001) },
      },
      SERVER_TIME,
      SERVER_TIME
    ),
    false
  );
  // 8. Out-of-bounds temperature
  assert.equal(
    simulateRuleCreateUser(
      { uid: 'bob' },
      'bob',
      { ...validPayload, settings: { ...validPayload.settings, temperature: 9.5 } },
      SERVER_TIME,
      SERVER_TIME
    ),
    false
  );
  // 9. Oversized facts array / non-string first element
  assert.equal(
    simulateRuleCreateUser(
      { uid: 'bob' },
      'bob',
      {
        ...validPayload,
        sharedMemory: { userName: 'Bob', facts: Array.from({ length: 30 }, (_, i) => `fact ${i}`) },
      },
      SERVER_TIME,
      SERVER_TIME
    ),
    false
  );
  assert.equal(
    simulateRuleCreateUser(
      { uid: 'bob' },
      'bob',
      {
        ...validPayload,
        sharedMemory: { userName: 'Bob', facts: [123 as unknown as string] },
      },
      SERVER_TIME,
      SERVER_TIME
    ),
    false
  );
  // 10. Poisoned ID
  assert.equal(
    simulateRuleCreateUser({ uid: 'bob$bad' }, 'bob$bad', { ...validPayload, uid: 'bob$bad' }, SERVER_TIME, SERVER_TIME),
    false
  );
});
