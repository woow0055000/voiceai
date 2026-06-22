const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const PI_API_ME = 'https://api.minepi.com/v2/me';

app.use(express.json());

app.use(function(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

var sessions = new Map();

function generateSessionToken() {
  return crypto.randomUUID();
}

app.post('/api/auth/verify', function(req, res) {
  var accessToken = req.body && req.body.accessToken;

  if (!accessToken || typeof accessToken !== 'string') {
    return res.status(400).json({ error: 'Missing accessToken' });
  }

  var fetchOptions = {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + accessToken },
    timeout: 10000
  };

  var url = PI_API_ME;

  var https = require('https');
  var parsedUrl = new URL(url);

  var options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.pathname,
    method: 'GET',
    headers: fetchOptions.headers,
    timeout: fetchOptions.timeout
  };

  var piReq = https.request(options, function(piRes) {
    var body = '';
    piRes.on('data', function(chunk) { body += chunk; });
    piRes.on('end', function() {
      if (piRes.statusCode !== 200) {
        return res.status(401).json({ error: 'Invalid Pi access token', detail: body });
      }
      try {
        var userData = JSON.parse(body);
        var sessionToken = generateSessionToken();
        sessions.set(sessionToken, { uid: userData.id, username: userData.username, verifiedAt: new Date().toISOString() });
        res.json({ sessionToken: sessionToken, user: { uid: userData.id, username: userData.username } });
      } catch (e) {
        res.status(500).json({ error: 'Failed to parse Pi API response' });
      }
    });
  });

  piReq.on('error', function(err) {
    res.status(502).json({ error: 'Pi API unreachable', detail: err.message });
  });

  piReq.on('timeout', function() {
    piReq.destroy();
    res.status(504).json({ error: 'Pi API timeout' });
  });

  piReq.end();
});

app.get('/api/auth/session', function(req, res) {
  var token = req.query && req.query.token;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  res.json({ user: sessions.get(token) });
});

app.post('/api/auth/signout', function(req, res) {
  var token = req.body && req.body.token;
  if (token) { sessions.delete(token); }
  res.json({ success: true });
});

app.use(express.static('..'));

app.listen(PORT, function() {
  console.log('VoiceAI server running on http://localhost:' + PORT);
  console.log('Auth verify endpoint: POST /api/auth/verify');
});
