const PiAuth = (function() {
  var _user = null;
  var _accessToken = null;
  var _sessionToken = null;
  var _authenticating = false;
  var _listeners = [];

  function _notify() {
    _listeners.forEach(function(fn) { try { fn(_user); } catch (e) { /* silent */ } });
  }

  function onAuthChange(fn) {
    _listeners.push(fn);
    if (_user) fn(_user);
    return function() {
      _listeners = _listeners.filter(function(f) { return f !== fn; });
    };
  }

  function getUser() { return _user; }
  function getAccessToken() { return _accessToken; }
  function getSessionToken() { return _sessionToken; }
  function isAuthenticated() { return _user !== null; }

  function _storeSession(token, user) {
    _sessionToken = token;
    _user = user;
    try { localStorage.setItem('voiceai_session', JSON.stringify({ token: token, user: user })); } catch (e) { /* ignore */ }
  }

  function _loadSession() {
    try {
      var raw = localStorage.getItem('voiceai_session');
      if (raw) {
        var data = JSON.parse(raw);
        _sessionToken = data.token;
        _user = data.user;
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function _clearSession() {
    _sessionToken = null;
    _user = null;
    _accessToken = null;
    try { localStorage.removeItem('voiceai_session'); } catch (e) { /* ignore */ }
  }

  function _handleIncompletePayment(payment) {
    console.warn('Incomplete Pi payment found:', payment.identifier);
  }

  function attemptAutoAuth() {
    if (_authenticating) return Promise.resolve(false);
    if (_user) return Promise.resolve(true);
    if (_loadSession()) {
      _notify();
      return Promise.resolve(true);
    }
    return _authenticate();
  }

  function _authenticate() {
    if (_authenticating) return Promise.resolve(false);
    _authenticating = true;

    if (typeof window.Pi === 'undefined') {
      _authenticating = false;
      return Promise.resolve(false);
    }

    return window.Pi.init({ version: '2.0', sandbox: true }).then(function() {
      return window.Pi.authenticate(['username'], _handleIncompletePayment);
    }).then(function(auth) {
      _accessToken = auth.accessToken;
      var piUser = auth.user;
      return fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: _accessToken })
      }).then(function(res) {
        if (!res.ok) throw new Error('Server rejected token');
        return res.json();
      }).then(function(serverResult) {
        _storeSession(serverResult.sessionToken, { uid: piUser.uid, username: piUser.username });
        _authenticating = false;
        _notify();
        return true;
      });
    }).catch(function(err) {
      console.warn('Pi auth failed:', err.message);
      _authenticating = false;
      return false;
    });
  }

  function signIn() {
    if (_authenticating) return Promise.resolve(false);
    if (_user) return Promise.resolve(true);
    return _authenticate();
  }

  function signOut() {
    if (!_user) return;
    _clearSession();
    _notify();
  }

  return {
    onAuthChange: onAuthChange,
    getUser: getUser,
    getAccessToken: getAccessToken,
    getSessionToken: getSessionToken,
    isAuthenticated: isAuthenticated,
    attemptAutoAuth: attemptAutoAuth,
    signIn: signIn,
    signOut: signOut
  };
})();
