const DB = (function() {
  const DB_NAME = 'voiceai';
  const DB_VERSION = 1;
  const STORE_META = 'meta';
  const STORE_SESSIONS = 'sessions';

  let db = null;

  function open() {
    return new Promise(function(resolve, reject) {
      if (db) { resolve(db); return; }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function(event) {
        const d = event.target.result;

        if (!d.objectStoreNames.contains(STORE_META)) {
          const metaStore = d.createObjectStore(STORE_META, { keyPath: 'key' });
          metaStore.put({ key: 'app', level: 1, totalSessions: 0, totalWords: 0, firstDate: null, lastDate: null, daysActive: 1 });
        }

        if (!d.objectStoreNames.contains(STORE_SESSIONS)) {
          const sessionStore = d.createObjectStore(STORE_SESSIONS, { keyPath: 'id', autoIncrement: true });
          sessionStore.createIndex('date', 'date', { unique: false });
          sessionStore.createIndex('timestamp', 'timestamp', { unique: false });
          sessionStore.createIndex('wordCount', 'wordCount', { unique: false });
        }
      };

      req.onsuccess = function(event) {
        db = event.target.result;

        db.onerror = function(e) {
          console.error('IndexedDB error:', e.target.error);
        };

        resolve(db);
      };

      req.onerror = function(event) {
        reject(new Error('فشل فتح قاعدة البيانات: ' + event.target.error));
      };

      req.onblocked = function() {
        reject(new Error('قاعدة البيانات محجوبة — أغلق نوافذ التطبيق الأخرى'));
      };
    });
  }

  function getMeta() {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB not open')); return; }
      const tx = db.transaction(STORE_META, 'readonly');
      const store = tx.objectStore(STORE_META);
      const req = store.get('app');

      req.onsuccess = function() {
        resolve(req.result || { key: 'app', level: 1, totalSessions: 0, totalWords: 0, firstDate: null, lastDate: null, daysActive: 1 });
      };

      req.onerror = function() {
        reject(new Error('فشل قراءة البيانات'));
      };
    });
  }

  function updateMeta(updates) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB not open')); return; }
      const tx = db.transaction(STORE_META, 'readwrite');
      const store = tx.objectStore(STORE_META);

      getMeta().then(function(current) {
        const merged = Object.assign({}, current, updates, { key: 'app' });
        const req = store.put(merged);

        req.onsuccess = function() { resolve(merged); };
        req.onerror = function() { reject(new Error('فشل تحديث البيانات')); };
      }).catch(reject);
    });
  }

  function getAllSessions() {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB not open')); return; }
      const tx = db.transaction(STORE_SESSIONS, 'readonly');
      const store = tx.objectStore(STORE_SESSIONS);
      const req = store.getAll();

      req.onsuccess = function() {
        resolve(req.result || []);
      };

      req.onerror = function() {
        reject(new Error('فشل قراءة الجلسات'));
      };
    });
  }

  function getSessionsByDate(date) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB not open')); return; }
      const tx = db.transaction(STORE_SESSIONS, 'readonly');
      const store = tx.objectStore(STORE_SESSIONS);
      const index = store.index('date');
      const req = index.getAll(date);

      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(new Error('فشل البحث بالتاريخ')); };
    });
  }

  function getSessionCount() {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB not open')); return; }
      const tx = db.transaction(STORE_SESSIONS, 'readonly');
      const store = tx.objectStore(STORE_SESSIONS);
      const req = store.count();

      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(new Error('فشل العد')); };
    });
  }

  function addSession(session) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB not open')); return; }
      const tx = db.transaction([STORE_SESSIONS, STORE_META], 'readwrite');
      const sessionStore = tx.objectStore(STORE_SESSIONS);
      const metaStore = tx.objectStore(STORE_META);

      const sessionData = Object.assign({}, session, { timestamp: Date.now() });
      delete sessionData.id;

      sessionStore.add(sessionData);

      var getReq = metaStore.get('app');
      getReq.onsuccess = function() {
        var current = getReq.result || { key: 'app', level: 1, totalSessions: 0, totalWords: 0, firstDate: null, lastDate: null, daysActive: 1 };
        var now = new Date().toISOString().split('T')[0];
        current.totalSessions = (current.totalSessions || 0) + 1;
        current.totalWords = (current.totalWords || 0) + (session.wordCount || 0);
        if (!current.firstDate) current.firstDate = now;
        current.lastDate = now;
        metaStore.put(current);
      };

      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(new Error('فشل إضافة الجلسة')); };
    });
  }

  function deleteSession(id) {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB not open')); return; }
      const tx = db.transaction(STORE_SESSIONS, 'readwrite');
      const store = tx.objectStore(STORE_SESSIONS);
      const req = store.delete(id);

      req.onsuccess = function() { resolve(); };
      req.onerror = function() { reject(new Error('فشل حذف الجلسة')); };
    });
  }

  function clearAll() {
    return new Promise(function(resolve, reject) {
      if (!db) { reject(new Error('DB not open')); return; }
      const tx = db.transaction([STORE_SESSIONS, STORE_META], 'readwrite');
      tx.objectStore(STORE_SESSIONS).clear();
      tx.objectStore(STORE_META).clear();
      tx.objectStore(STORE_META).put({ key: 'app', level: 1, totalSessions: 0, totalWords: 0, firstDate: null, lastDate: null, daysActive: 1 });
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(new Error('فشل المسح')); };
    });
  }

  function migrateFromLocalStorage() {
    return new Promise(function(resolve, reject) {
      try {
        var raw = localStorage.getItem('voiceai_data');
        if (!raw) { resolve(false); return; }

        var data = JSON.parse(raw);
        if (!data || !data.sessions || data.sessions.length === 0) { resolve(false); return; }

        getAllSessions().then(function(existing) {
          if (existing.length > 0) { resolve(false); return; }

          var meta = data.meta || {};
          updateMeta({
            level: meta.level || 1,
            totalSessions: meta.totalSessions || 0,
            totalWords: meta.totalWords || 0,
            firstDate: meta.firstDate || null,
            lastDate: meta.lastDate || null,
            daysActive: meta.daysActive || 1
          });

          var tx = db.transaction(STORE_SESSIONS, 'readwrite');
          var store = tx.objectStore(STORE_SESSIONS);

          data.sessions.forEach(function(s) {
            store.add({
              date: s.date,
              text: s.text,
              wordCount: s.wordCount || 0,
              lastWord: s.lastWord || '',
              lastSentence: s.lastSentence || '',
              timestamp: new Date(s.date).getTime()
            });
          });

          tx.oncomplete = function() {
            localStorage.removeItem('voiceai_data');
            resolve(true);
          };

          tx.onerror = function() { reject(new Error('فشل الترحيل')); };
        });
      } catch (e) {
        reject(new Error('فشل الترحيل من التخزين القديم: ' + e.message));
      }
    });
  }

  return {
    open: open,
    getMeta: getMeta,
    updateMeta: updateMeta,
    getAllSessions: getAllSessions,
    getSessionsByDate: getSessionsByDate,
    getSessionCount: getSessionCount,
    addSession: addSession,
    deleteSession: deleteSession,
    clearAll: clearAll,
    migrateFromLocalStorage: migrateFromLocalStorage
  };
})();
