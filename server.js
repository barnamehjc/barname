// High-Performance Zero-Dependency Multi-User Realtime Cloud Sync Server with Admin Panel for Railway
// Consumes virtually 0% CPU & ~15MB RAM so your Railway $5 credit lasts indefinitely!

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const DB_FILE = path.join(PUBLIC_DIR, 'database.json');

const DEFAULT_AUTH_USERS = {
  'sajad': 'sajad2009',
  'test': 'test',
  'test2': 'test2'
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function readDatabase() {
  return new Promise((resolve) => {
    fs.readFile(DB_FILE, 'utf8', (err, data) => {
      if (err || !data) {
        resolve({ auth_users: Object.assign({}, DEFAULT_AUTH_USERS), users: {} });
        return;
      }
      try {
        const parsed = JSON.parse(data);
        if (!parsed.auth_users) parsed.auth_users = Object.assign({}, DEFAULT_AUTH_USERS);
        if (!parsed.users) parsed.users = {};
        resolve(parsed);
      } catch (e) {
        resolve({ auth_users: Object.assign({}, DEFAULT_AUTH_USERS), users: {} });
      }
    });
  });
}

let writeQueue = Promise.resolve();

function writeDatabase(db) {
  writeQueue = writeQueue.then(() => new Promise((resolve, reject) => {
    fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf8', (err) => {
      if (err) reject(err);
      else resolve(true);
    });
  })).catch((err) => {
    console.error('Database write error:', err);
  });
  return writeQueue;
}

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse URL pathname
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let reqPath = parsedUrl.pathname;

  // --- 👑 ADMIN USER MANAGEMENT API ---
  if (reqPath === '/api/admin/users') {
    const db = await readDatabase();

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify({
        success: true,
        users: Object.keys(db.auth_users).map(u => ({
          username: u,
          isAdmin: (u === 'sajad'),
          hasData: !!(db.users && db.users[u] && db.users[u].logs && db.users[u].logs.length > 0),
          logsCount: (db.users && db.users[u] && db.users[u].logs) ? db.users[u].logs.length : 0
        })),
        auth_users: db.auth_users
      }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const username = (payload.username || '').trim().toLowerCase();
          const password = (payload.password || '').trim();

          if (!username || !password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'نام کاربری و رمز عبور الزامی است' }));
            return;
          }

          db.auth_users[username] = password;
          if (!db.users[username]) {
            db.users[username] = { subjects: [], logs: [], plans: [], settings: {}, lastModified: Date.now() };
          }
          await writeDatabase(db);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, message: `کاربر ${username} با موفقیت ثبت شد`, auth_users: db.auth_users }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    if (req.method === 'DELETE') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const username = (payload.username || '').trim().toLowerCase();

          if (username === 'sajad') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'حساب ادمین اصلی (sajad) قابل حذف نیست!' }));
            return;
          }

          if (db.auth_users[username]) delete db.auth_users[username];
          if (db.users[username]) delete db.users[username];
          await writeDatabase(db);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, message: `کاربر ${username} با موفقیت حذف شد`, auth_users: db.auth_users }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }
  }

  // --- ⏰ SERVER TIME API (source of truth for stopwatch across all devices) ---
  if (reqPath === '/api/time') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache, no-store' });
    res.end(JSON.stringify({ serverTime: Date.now() }));
    return;
  }

  // --- 🔄 MULTI-USER CLOUD SYNC API ---

  if (reqPath === '/api/sync') {
    const username = (parsedUrl.searchParams.get('user') || 'sajad').trim().toLowerCase();
    const db = await readDatabase();

    if (req.method === 'GET') {
      let userData = db.users[username] || null;
      if (userData) {
        userData.auth_users = db.auth_users;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify(userData));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify({ exists: false, user: username, auth_users: db.auth_users }));
      }
      return;
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          const postUser = (parsed.auth_user || username).trim().toLowerCase();
          delete parsed.auth_user;
          delete parsed.auth_users;
          // Preserve client's lastModified and lastDevice exactly — DO NOT overwrite with server time
          // Server time is only stored as metadata, not used for conflict resolution
          parsed.lastServerSync = Date.now();

          db.users[postUser] = parsed;
          await writeDatabase(db);

          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
          res.end(JSON.stringify({ success: true, user: postUser, timestamp: parsed.lastModified || parsed.lastServerSync }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
        }
      });
      return;
    }
  }

  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.resolve(PUBLIC_DIR, '.' + path.sep + safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA Fallback: serve index.html
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexPath, (err2, content) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const cacheControl = (ext === '.html' || reqPath === '/sw.js')
      ? 'no-cache'
      : 'public, max-age=604800, immutable';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    });

    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Multi-User Study Tracker with Admin Panel running on http://0.0.0.0:${PORT}`);
});
