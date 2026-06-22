const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const Logger = {
  _el: null,
  init: function() {
    try { this._el = document.getElementById('log'); } catch (e) { /* silent */ }
  },
  _write: function(html) {
    if (!this._el) return;
    var d = document.createElement('div');
    d.innerHTML = html;
    this._el.insertBefore(d.firstElementChild || d.firstChild, this._el.firstChild);
    if (this._el.children.length > 50) {
      while (this._el.children.length > 50) this._el.removeChild(this._el.lastChild);
    }
  },
  info: function(msg) { this._write('<p class="log-info">' + msg + '</p>'); },
  warn: function(msg) { this._write('<p class="log-warn">⚠ ' + msg + '</p>'); },
  error: function(msg) { this._write('<p class="log-error">✖ ' + msg + '</p>'); },
  debug: function(msg) {
    if (this._debug) this._write('<p class="log-debug">🐛 ' + msg + '</p>');
  },
  _debug: false
};

function enableDebug() { Logger._debug = true; }

var state = {
  meta: { level: 1, totalSessions: 0, totalWords: 0, firstDate: null, lastDate: null, daysActive: 1 },
  sessions: []
};

function getDaysActive() {
  if (!state.meta.firstDate) return 1;
  var first = new Date(state.meta.firstDate);
  var now = new Date();
  var diff = Math.floor((now - first) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

function calcLevel() {
  var s = state.meta.totalSessions;
  var d = getDaysActive();
  var w = state.meta.totalWords;
  if (s >= 30 || d >= 21 || w >= 500) return 5;
  if (s >= 15 || d >= 10 || w >= 200) return 4;
  if (s >= 7 || d >= 5 || w >= 80) return 3;
  if (s >= 3 || d >= 2 || w >= 20) return 2;
  return 1;
}

function getResponse(text) {
  var days = getDaysActive();
  var level = state.meta.level;
  var words = text.trim().split(/\s+/).filter(Boolean);
  var wordCount = words.length;
  var firstWords = words.slice(0, 5).join(' ');

  if (days <= 2) {
    var shallow = [
      'سمعتك تقول: &quot;' + firstWords + '…&quot; خلّنا نبدأ!',
      '&quot;' + firstWords + '&quot; — كلام جميل، استمر.',
      'أولى كلماتك: &quot;' + firstWords + '&quot;. بداية موفقة!'
    ];
    return shallow[Math.floor(Math.random() * shallow.length)];
  }

  if (days <= 6) {
    var medium = [
      'لاحظت إن صوتك اليوم يقول: &quot;' + firstWords + '…&quot; كل شيء تمام؟',
      '&quot;' + firstWords + '&quot; — أتذكر كلامك من قبل. أنت تتغير.',
      'آخر كلامك: &quot;' + firstWords + '&quot;. فيه طاقة مختلفة اليوم.'
    ];
    return medium[Math.floor(Math.random() * medium.length)];
  }

  var points = wordCount * level;
  var deep = [
    'جمعت لك ' + points + ' نقطة من كلامك السابق… شوفها.<br>آخر كلامك: &quot;' + firstWords + '&quot;',
    'أنت الآن في المستوى ' + level + '، جمعت ' + state.meta.totalWords + ' كلمة عبر ' + days + ' يوم. استمر.',
    '&quot;' + firstWords + '&quot; — تحليل: ' + wordCount + ' كلمة جديدة، ' + level + ' نقاط إضافية.'
  ];
  return deep[Math.floor(Math.random() * deep.length)];
}

function updateUI() {
  var level = calcLevel();
  state.meta.level = level;

  document.getElementById('level').textContent = 'المستوى: ' + level;
  document.getElementById('sessions').textContent = 'الجلسات: ' + state.meta.totalSessions;

  var app = document.getElementById('app');
  app.className = 'app';
  for (var i = 2; i <= level; i++) app.classList.add('level-' + i);

  var sig = document.getElementById('signature');
  sig.className = 'signature';
  for (var i = 1; i <= level; i++) sig.classList.add('level-' + i);

  if (state.meta.totalSessions >= 10) {
    var memoryDiv = document.getElementById('memory');
    memoryDiv.style.display = 'block';
    var last = state.sessions[state.sessions.length - 1];
    document.getElementById('lastWord').textContent = last ? last.lastWord : '—';
    if (last && last.lastSentence) {
      document.getElementById('lastSentence').textContent = last.lastSentence;
    }
  }
}

function addSession(text) {
  var now = new Date().toISOString().split('T')[0];
  var words = text.trim().split(/\s+/).filter(Boolean);
  var lastWord = words.length > 0 ? words[words.length - 1] : '';

  var sentenceMatch = text.trim().match(/[^.!?؟،]+[.!?؟،]/g);
  var lastSentence = sentenceMatch
    ? sentenceMatch[sentenceMatch.length - 1].trim()
    : text.trim().slice(0, 60);

  var session = {
    date: now,
    text: text,
    wordCount: words.length,
    lastWord: lastWord,
    lastSentence: lastSentence
  };

  state.sessions.push(session);
  state.meta.totalSessions++;
  state.meta.totalWords += words.length;
  if (!state.meta.firstDate) state.meta.firstDate = now;
  state.meta.lastDate = now;

  var days = new Set(state.sessions.map(function(s) { return s.date; }));
  state.meta.daysActive = days.size;

  DB.addSession(session).then(function() {
    Logger.debug('تم الحفظ في قاعدة البيانات');
  }).catch(function(err) {
    Logger.error('فشل حفظ الجلسة: ' + err.message);
  });

  updateUI();
  var response = getResponse(text);
  Logger.info('🗣 ' + text);
  Logger.info('🤖 ' + response);
  Logger.debug('جلسة جديدة | الكلمات: ' + words.length + ' | المستوى: ' + state.meta.level);
}

function showAuthUser(user) {
  document.getElementById('authGuest').style.display = 'none';
  document.getElementById('authUser').style.display = 'flex';
  document.getElementById('authUsername').textContent = '👤 ' + user.username;
}

function showAuthGuest() {
  document.getElementById('authGuest').style.display = 'flex';
  document.getElementById('authUser').style.display = 'none';
}

function initApp() {
  Logger.init();

  var recordBtn = document.getElementById('recordBtn');
  var recognition = null;
  var isRecording = false;
  var recordingLock = false;

  PiAuth.onAuthChange(function(user) {
    if (user) { showAuthUser(user); } else { showAuthGuest(); }
  });

  if (PiAuth.isAuthenticated()) {
    showAuthUser(PiAuth.getUser());
  }

  document.getElementById('signInBtn').addEventListener('click', function() {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'جاري الاتصال…';
    PiAuth.signIn().then(function(success) {
      btn.disabled = false;
      btn.textContent = 'تسجيل الدخول بPi';
      if (success) {
        Logger.info('تم تسجيل الدخول بنجاح كـ ' + PiAuth.getUser().username);
      } else {
        Logger.warn('تعذر تسجيل الدخول — Pi Browser مطلوب');
      }
    });
  });

  document.getElementById('signOutBtn').addEventListener('click', function() {
    PiAuth.signOut();
    Logger.info('تم تسجيل الخروج');
  });

  if (!SpeechRecognition) {
    Logger.error('المتصفح لا يدعم التعرف على الصوت. استخدم Chrome أو Edge.');
    recordBtn.disabled = true;
    recordBtn.textContent = 'غير مدعوم';
  } else {
    recognition = new SpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = function(event) {
      var text = event.results[0][0].transcript;
      if (text.trim()) {
        addSession(text);
      }
    };

    recognition.onend = function() {
      isRecording = false;
      recordingLock = false;
      recordBtn.textContent = 'ابدأ التسجيل';
      recordBtn.disabled = false;
      recordBtn.classList.remove('recording');
    };

    recognition.onerror = function(event) {
      isRecording = false;
      recordingLock = false;
      recordBtn.textContent = 'ابدأ التسجيل';
      recordBtn.disabled = false;
      recordBtn.classList.remove('recording');
      if (event.error === 'not-allowed') {
        Logger.error('السماح بالمايكروفون مرفوض. سمح بالوصول وحاول مجدداً.');
      } else if (event.error === 'no-speech') {
        Logger.warn('لم يتم اكتشاف كلام. حاول مرة أخرى.');
      } else {
        Logger.error('خطأ في التعرف على الصوت: ' + event.error);
      }
    };
  }

  recordBtn.addEventListener('click', function() {
    if (!recognition || recordingLock) return;
    if (isRecording) { recognition.stop(); return; }
    recordingLock = true;
    isRecording = true;
    recordBtn.textContent = '⏺ جارٍ التسجيل…';
    recordBtn.disabled = true;
    recordBtn.classList.add('recording');
    try { recognition.start(); } catch (e) {
      isRecording = false; recordingLock = false;
      recordBtn.textContent = 'ابدأ التسجيل'; recordBtn.disabled = false;
      recordBtn.classList.remove('recording');
      Logger.error('فشل بدء التسجيل — حاول مرة أخرى');
    }
  });

  if (state.sessions.length > 0) {
    state.meta.daysActive = new Set(state.sessions.map(function(s) { return s.date; })).size;
    updateUI();
    var last = state.sessions[state.sessions.length - 1];
    Logger.info('🗣 ' + last.text);
    Logger.info('🤖 ' + getResponse(last.text));
  } else {
    updateUI();
  }
}

DB.open().then(function() {
  return DB.migrateFromLocalStorage();
}).then(function(migrated) {
  if (migrated) { Logger.info('تم ترحيل البيانات من التخزين القديم'); }
  return DB.getMeta();
}).then(function(meta) {
  state.meta = meta;
  return DB.getAllSessions();
}).then(function(sessions) {
  state.sessions = sessions;
  return PiAuth.attemptAutoAuth();
}).then(function() {
  initApp();
}).catch(function(err) {
  console.warn('تعذر فتح IndexedDB، استخدام localStorage:', err.message);
  try {
    var raw = localStorage.getItem('voiceai_data');
    if (raw) {
      var data = JSON.parse(raw);
      state.meta = data.meta || state.meta;
      state.sessions = data.sessions || [];
    }
  } catch (e) { /* silent */ }
  initApp();
});
