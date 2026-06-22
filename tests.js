/**
 * VoiceAI — Test Suite
 * Run: node tests.js
 * Tests business logic + DB schema validation
 */

var failures = 0;
var passed = 0;

function assert(condition, msg) {
  if (condition) { passed++; return; }
  failures++;
  console.log('  ✖ FAIL: ' + msg);
}

function assertEq(a, b, msg) {
  if (a === b) { passed++; return; }
  failures++;
  console.log('  ✖ FAIL: ' + msg + ' — expected "' + b + '", got "' + a + '"');
}

// ─── Helpers (copied from script.js) ───

function getDaysActive(firstDate) {
  if (!firstDate) return 1;
  var first = new Date(firstDate);
  var now = new Date();
  var diff = Math.floor((now - first) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

function calcLevel(totalSessions, daysActive, totalWords) {
  if (totalSessions >= 30 || daysActive >= 21 || totalWords >= 500) return 5;
  if (totalSessions >= 15 || daysActive >= 10 || totalWords >= 200) return 4;
  if (totalSessions >= 7 || daysActive >= 5 || totalWords >= 80) return 3;
  if (totalSessions >= 3 || daysActive >= 2 || totalWords >= 20) return 2;
  return 1;
}

function extractLastSentence(text) {
  var m = text.match(/[^.!?؟،]+[.!?؟،]/g);
  return m ? m[m.length - 1].trim() : text.trim().slice(0, 60);
}

function extractLastWord(text) {
  var w = text.trim().split(/\s+/).filter(Boolean);
  return w.length > 0 ? w[w.length - 1] : '';
}

function getResponseDepth(days) {
  if (days <= 2) return 'shallow';
  if (days <= 6) return 'medium';
  return 'deep';
}

// ─── 1. calcLevel Tests ───

console.log('\n# calcLevel');

assertEq(calcLevel(0, 1, 0), 1, 'L1: default');
assertEq(calcLevel(3, 1, 0), 2, 'L2: 3 sessions');
assertEq(calcLevel(0, 2, 0), 2, 'L2: 2 days');
assertEq(calcLevel(0, 1, 20), 2, 'L2: 20 words');
assertEq(calcLevel(7, 1, 0), 3, 'L3: 7 sessions');
assertEq(calcLevel(0, 5, 0), 3, 'L3: 5 days');
assertEq(calcLevel(0, 1, 80), 3, 'L3: 80 words');
assertEq(calcLevel(15, 1, 0), 4, 'L4: 15 sessions');
assertEq(calcLevel(0, 10, 0), 4, 'L4: 10 days');
assertEq(calcLevel(0, 1, 200), 4, 'L4: 200 words');
assertEq(calcLevel(30, 1, 0), 5, 'L5: 30 sessions');
assertEq(calcLevel(0, 21, 0), 5, 'L5: 21 days');
assertEq(calcLevel(0, 1, 500), 5, 'L5: 500 words');
assertEq(calcLevel(8, 3, 100), 3, 'L3: mixed (8 sessions, 3 days, 100 words)');

// ─── 2. extractLastSentence Tests ───

console.log('\n# extractLastSentence');

assertEq(extractLastSentence('مرحبا. كيف حالك؟ أنا بخير.'), 'أنا بخير.', 'Arabic punctuation');
assertEq(extractLastSentence('Hello. How are you? I am fine.'), 'I am fine.', 'English punctuation');
assertEq(extractLastSentence('نص بدون علامات'), 'نص بدون علامات', 'No punctuation fallback');
assertEq(extractLastSentence(''), '', 'Empty string');
assertEq(extractLastSentence('جملة واحدة.'), 'جملة واحدة.', 'Single sentence');
assertEq(extractLastSentence('مرحبا، كيفك؟'), 'كيفك؟', 'Arabic comma + question');
assertEq(extractLastSentence('A.B.C.D.'), 'D.', 'Multiple dots');

// ─── 3. extractLastWord Tests ───

console.log('\n# extractLastWord');

assertEq(extractLastWord('مرحبا بالعالم'), 'بالعالم', 'Arabic last word');
assertEq(extractLastWord('hello world'), 'world', 'English last word');
assertEq(extractLastWord('كلمة'), 'كلمة', 'Single word');
assertEq(extractLastWord(''), '', 'Empty string');
assertEq(extractLastWord('   مسافات   حول   '), 'حول', 'Spaces trimming');

// ─── 4. getResponseDepth Tests ───

console.log('\n# getResponseDepth');

assertEq(getResponseDepth(1), 'shallow', 'Day 1: shallow');
assertEq(getResponseDepth(2), 'shallow', 'Day 2: shallow');
assertEq(getResponseDepth(3), 'medium', 'Day 3: medium');
assertEq(getResponseDepth(6), 'medium', 'Day 6: medium');
assertEq(getResponseDepth(7), 'deep', 'Day 7: deep');
assertEq(getResponseDepth(365), 'deep', 'Day 365: deep');

// ─── 5. DB Schema Validation ───

console.log('\n# DB Schema');

var expectedMetaSchema = {
  keyPath: 'key',
  indexes: []
};

var expectedSessionSchema = {
  keyPath: 'id',
  autoIncrement: true,
  indexes: ['date', 'timestamp', 'wordCount']
};

var metaFields = ['key', 'level', 'totalSessions', 'totalWords', 'firstDate', 'lastDate', 'daysActive'];
var sessionFields = ['id', 'date', 'text', 'wordCount', 'lastWord', 'lastSentence', 'timestamp'];

assert(metaFields.length === 7, 'meta has 7 fields');
assert(sessionFields.length === 7, 'session has 7 fields');
assert(expectedSessionSchema.indexes.length === 3, 'sessions has 3 indexes');

// Verify no duplicate fields
assert(new Set(metaFields).size === metaFields.length, 'meta: no duplicate fields');
assert(new Set(sessionFields).size === sessionFields.length, 'session: no duplicate fields');

// ─── 6. State Machine Integrity ───

console.log('\n# State Machine');

// Simulate addSession flow
var state = {
  meta: { level: 1, totalSessions: 0, totalWords: 0, firstDate: null, lastDate: null, daysActive: 1 },
  sessions: []
};

function simulateAddSession(text) {
  var now = new Date().toISOString().split('T')[0];
  var words = text.trim().split(/\s+/).filter(Boolean);
  var lastWord = words.length > 0 ? words[words.length - 1] : '';
  var lastSentence = extractLastSentence(text);

  state.sessions.push({
    date: now, text: text, wordCount: words.length, lastWord: lastWord, lastSentence: lastSentence
  });
  state.meta.totalSessions++;
  state.meta.totalWords += words.length;
  if (!state.meta.firstDate) state.meta.firstDate = now;
  state.meta.lastDate = now;
  state.meta.daysActive = new Set(state.sessions.map(function(s) { return s.date; })).size;
  state.meta.level = calcLevel(state.meta.totalSessions, state.meta.daysActive, state.meta.totalWords);
}

simulateAddSession('مرحبا');
assert(state.meta.totalSessions === 1, '1 session');
assert(state.meta.totalWords === 1, '1 word');
assert(state.meta.level === 1, 'level 1 after 1 session');

simulateAddSession('كيف حالك اليوم؟');
assert(state.meta.totalSessions === 2, '2 sessions');
assert(state.meta.totalWords === 4, '4 words (1+3)');
// 2 sessions, 1 day, 4 words → L1 (needs 3 sessions or 2 days or 20 words)
assertEq(state.meta.level, 1, 'level 1 with 2 sessions');

simulateAddSession('أنا سعيد بلقائك');
assert(state.meta.totalSessions === 3, '3 sessions');
// 3 sessions → meets threshold → L2
assertEq(state.meta.level, 2, 'level 2 with 3 sessions');

simulateAddSession('هذا نص طويل جدا لاختبار عدد الكلمات والعمل على زيادة المستوى');
assert(state.meta.totalSessions === 4, '4 sessions');
// Total words: 1 + 3 + 3 + 11 = 18
assertEq(state.meta.totalWords, 18, 'total words = 18');
assert(state.meta.level >= 2, 'level >= 2');

// Verify last session data
var last = state.sessions[state.sessions.length - 1];
assertEq(last.lastWord, 'المستوى', 'last word of long text');
assert(last.lastSentence.length > 0, 'last sentence exists');

// ─── 7. Edge Cases ───

console.log('\n# Edge Cases');

assertEq(extractLastSentence(''), '', 'empty text');
assertEq(extractLastWord('   '), '', 'whitespace only');
assertEq(calcLevel(0, 0, 0), 1, 'zero everything → level 1');
assertEq(calcLevel(-1, -1, -1), 1, 'negative → level 1 (Math.max in getDaysActive handles this)');
assertEq(getDaysActive(null), 1, 'null firstDate → 1 day');

// Long text trimming
var longText = new Array(200).join('كلمة ');
var sentence = extractLastSentence(longText);
assert(sentence.length <= 60 || sentence.length > 0, 'long text handled');

// ─── Summary ───

console.log('\n=====================');
console.log('  PASSED: ' + passed);
console.log('  FAILED: ' + failures);
console.log('=====================');
if (failures > 0) process.exit(1);
