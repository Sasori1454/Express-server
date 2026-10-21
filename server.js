require('dotenv').config();

const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const { Filter } = require('bad-words');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('./db');

const app = express();
const filter = new Filter();

const REQUIRED_ENV = ['SESSION_SECRET', 'NASA_API_KEY', 'ADMIN_USERNAME', 'ADMIN_PASSWORD'];
for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOG_FILE = path.join(__dirname, 'server.log');

let visitorCount = 0;
const apodCache = new Map();
const TODAY_MAX_AGE = 60 * 60 * 1000;
const MAX_CACHE_SIZE = 100;

if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 128 * 1024) {
    const recentLines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-200);
    fs.writeFileSync(LOG_FILE, recentLines.join('\n'));
}

function validateEntry(name, msg) {
    if (typeof name !== 'string' || typeof msg !== 'string') {
        return 'Name and message must be text.';
    }
    if (name.trim().length < 1 || name.trim().length > 40) {
        return 'Name must be 1 to 40 characters.';
    }
    if (msg.trim().length < 1 || msg.trim().length > 280) {
        return 'Message must be 1 to 280 characters.';
    }
    return null;
}

function validateCredentials(username, password) {
    if (typeof username !== 'string' || typeof password !== 'string') {
        return 'Username and password must be text.';
    }
    if (!/^[a-z0-9_]{3,20}$/.test(username.trim().toLowerCase())) {
        return 'Username must be 3 to 20 letters, numbers or underscores.';
    }
    if (password.length < 8 || password.length > 72) {
        return 'Password must be 8 to 72 characters.';
    }
    return null;
}

function validateApodDate(date) {
    if (date === undefined) return null;

    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return 'Date must look like YYYY-MM-DD.';
    }

    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        return 'That is not a real date.';
    }

    if (date < '1995-06-16') {
        return 'The first picture is from 1995-06-16.';
    }

    const today = new Date().toISOString().slice(0, 10);
    if (date > today) {
        return 'That date is in the future.';
    }

    return null;
}

function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized. Please log in first.' });
    }
    next();
}

function requireLoginPage(req, res, next) {
    if (!req.session.userId) return next();
    return res.redirect('/guestbook');
}

function requireAdminPage(req, res, next) {
    if (req.session.role !== 'admin') {
        return res.redirect('/');
    }
    next();
}

function startSession(req, user, rememberMe) {
    return new Promise((resolve, reject) => {
        req.session.regenerate((err) => {
            if (err) return reject(err);
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = user.role;
            req.session.csrfToken = crypto.randomUUID();
            if (rememberMe) {
                req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000;
            }
            resolve();
        });
    });
}

function requireSameOrigin(req, res, next) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return next();
    }

    function ensureCsrfToken(req, res, next) {
        if (!req.session.csrfToken) {
            req.session.csrfToken = crypto.randomUUID();
        }
        next();
    }

    function requireCsrfToken(req, res, next) {
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            return next();
        }

        const token = req.get('x-csrf-token');
        if (!token || !req.session.csrfToken) {
            return res.status(403).json({ error: 'Invalid CSRF token.' });
        }

        const tokenBuffer = Buffer.from(token);
        const expectedBuffer = Buffer.from(req.session.csrfToken);

        if (tokenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
            return res.status(403).json({ error: 'Invalid CSRF token.' });
        }

        return next();
    }

    const origin = req.get('origin');
    if (!origin) return next();

    let originHost;
    try {
        originHost = new URL(origin).host;
    } catch (err) {
        return res.status(403).json({ error: 'Forbidden request origin.' });
    }

    if (originHost !== req.get('host')) {
        return res.status(403).json({ error: 'Forbidden request origin.' });
    }

    return next();
}

const limiter = rateLimit({
    windowMs: 10 * 1000,
    limit: 100,
    message: '<h1>429 Too Many Requests</h1><p>Please wait 10 seconds.</p>'
});
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    message: { error: 'Too many auth attempts. Please wait a minute.' }
});
const spaceLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    message: { error: 'Too many space lookups. Please wait a minute.' }
});

app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            'img-src': ["'self'", 'data:', 'https://assets.science.nasa.gov']
        }
    }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(limiter);
app.use(requireSameOrigin);
app.use((req, res, next) => {
    const logLine = `[${new Date().toISOString()}] ${req.method} ${req.path}\n`;
    console.log(logLine.trim());
    fs.appendFile(LOG_FILE, logLine, () => {});
    next();
});

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 15 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
    }
}));
app.use(ensureCsrfToken);
app.use(requireCsrfToken);

app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello, world!' });
});

app.get('/api/csrf-token', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ csrfToken: req.session.csrfToken });
});

app.get('/api/headers-demo', (req, res) => {
    res.set('X-Student-Name', 'Sasori1454');
    res.json({
        browser: req.get('User-Agent'),
        languages: req.get('Accept-Language'),
        allRequestHeaders: req.headers
    });
});

app.get('/api/stats', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const entries = await db.getAllEntries();
    res.json({ visitorCount, guestbookCount: entries.length });
});

app.post('/register', authLimiter, async (req, res) => {
    const { username, password } = req.body;
    const error = validateCredentials(username, password);
    if (error) {
        return res.status(400).json({ error });
    }

    const cleanName = username.trim().toLowerCase();
    if (await db.getUserByUsername(cleanName)) {
        return res.status(409).json({ error: 'That username is already taken.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.addUser({ username: cleanName, passwordHash });

    await startSession(req, user);
    res.status(201).json({ username: user.username });
});

app.post('/login', authLimiter, async (req, res) => {
    const { username, password, rememberMe } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await db.getUserByUsername(username.trim());
    const passwordOk = user && await bcrypt.compare(password, user.passwordHash);

    if (!passwordOk) {
        return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    await startSession(req, user, rememberMe);
    res.json({ success: true, username: user.username });
});

app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

app.get('/api/whoami', (req, res) => {
    if (!req.session.userId) {
        return res.json({ loggedIn: false });
    }
    res.json({
        loggedIn: true,
        userId: req.session.userId,
        username: req.session.username,
        role: req.session.role
    });
});

app.get('/api/guestbook', requireAuth, async (req, res) => {
    const entries = await db.getAllEntries();
    res.json(entries);
});

app.post('/api/guestbook', requireAuth, async (req, res) => {
    const { name, msg } = req.body;
    const error = validateEntry(name, msg);
    if (error) {
        return res.status(400).json({ error });
    }

    const compactedInput = msg.trim().replace(/\s+/g, ' ');
    if (filter.isProfane(compactedInput)) {
        return res.status(400).json({ error: 'Please keep your message friendly.' });
    }

    const entry = await db.addEntry({
        name: name.trim(),
        msg: compactedInput
    });
    res.status(201).json(entry);
});

app.get('/api/guestbook/:id', requireAuth, async (req, res) => {
    const entry = await db.getEntryById(req.params.id);
    if (!entry) {
        return res.status(404).json({ error: 'Entry not found.' });
    }
    res.json(entry);
});

app.put('/api/guestbook/:id', requireAuth, async (req, res) => {
    const { name, msg } = req.body;
    const error = validateEntry(name, msg);
    if (error) {
        return res.status(400).json({ error });
    }

    const compactedInput = msg.trim().replace(/\s+/g, ' ');
    if (filter.isProfane(compactedInput)) {
        return res.status(400).json({ error: 'Please keep your message friendly.' });
    }

    const updated = await db.updateEntry(req.params.id, {
        name: name.trim(),
        msg: compactedInput
    });
    if (!updated) {
        return res.status(404).json({ error: 'Entry not found.' });
    }
    res.json(updated);
});

app.delete('/api/guestbook/:id', requireAuth, async (req, res) => {
    const deleted = await db.deleteEntry(req.params.id);
    if (!deleted) {
        return res.status(404).json({ error: 'Entry not found.' });
    }
    res.status(204).end();
});

app.get('/api/space', spaceLimiter, async (req, res) => {
    const { date } = req.query;

    const dateError = validateApodDate(date);
    if (dateError) {
        return res.status(400).json({ error: dateError });
    }

    const dateValue = typeof date === 'string' ? date : undefined;
    const cacheKey = dateValue || 'today';
    const cached = apodCache.get(cacheKey);
    const isFresh = cacheKey !== 'today' || Date.now() - (cached?.savedAt ?? 0) < TODAY_MAX_AGE;

    if (cached && isFresh) {
        return res.json(cached.data);
    }

    let shortDatePath = '';
    if (dateValue) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
        if (!match) {
            return res.status(400).json({ error: 'Date must look like YYYY-MM-DD.' });
        }
        shortDatePath = `${match[1].slice(2)}${match[2]}${match[3]}`;
    }

    const nasaUrl = shortDatePath
        ? new URL(`https://science.nasa.gov/wp-json/wp/v2/apod-basic/${shortDatePath}`)
        : new URL('https://science.nasa.gov/wp-json/wp/v2/apod-basic/');
    nasaUrl.searchParams.set('api_key', process.env.NASA_API_KEY);

    let nasaResponse;
    try {
        nasaResponse = await fetch(nasaUrl, { signal: AbortSignal.timeout(8000) });
    } catch (err) {
        return res.status(502).json({ error: 'Could not reach NASA. Try again later.' });
    }

    if (nasaResponse.status === 404) {
        return res.status(404).json({ error: 'NASA has no picture for that date.' });
    }
    if (!nasaResponse.ok) {
        console.error('NASA error:', nasaResponse.status);
        return res.status(502).json({ error: 'NASA could not send a picture right now.' });
    }

    const data = await nasaResponse.json();
    const picture = Array.isArray(data) ? data[0] : data;

    const result = {
        title: picture.title,
        date: picture.date,
        imageUrl: picture.hdurl,
        description: picture.alt,
        nasaPage: picture.permalink
    };

    apodCache.set(cacheKey, { data: result, savedAt: Date.now() });
    if (apodCache.size > MAX_CACHE_SIZE) {
        const oldestKey = apodCache.keys().next().value;
        apodCache.delete(oldestKey);
    }

    res.json(result);
});

app.get('/guestbook', requireAuth, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'guestbook.html'));
});

app.get('/register', requireLoginPage, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'register.html'));
});

app.get('/dashboard', requireAdminPage, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

app.get('/projects', (req, res) => {
    visitorCount += 1;
    res.sendFile(path.join(PUBLIC_DIR, 'projects.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'about.html'));
});

app.get('/space', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'space.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    return res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

app.use((err, req, res, next) => {
    const time = new Date().toISOString();
    const errorMeta = {
        time,
        method: req.method,
        path: req.path,
        message: err.message
    };
    console.error('ERROR', errorMeta, err);
    fs.appendFile(LOG_FILE, `${JSON.stringify(errorMeta)}\n`, () => {});

    if (res.headersSent) return next(err);

    const status = err.status || 500;
    const message = status < 500 ? err.message : 'Something went wrong on our end.';

    if (req.path.startsWith('/api/')) {
        return res.status(status).json({ error: message });
    }
    return res.status(status).send('<h1>Something went wrong</h1><p>Please try again later.</p><a href="/">Back to home</a>');
});

async function ensureAdmin() {
    const existing = await db.getUserByUsername(process.env.ADMIN_USERNAME);
    if (existing) return;

    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await db.addUser({ username: process.env.ADMIN_USERNAME, passwordHash, role: 'admin' });
    console.log('Created admin account');
}

ensureAdmin().then(() => {
    app.listen(PORT, () => console.log(`Server live on http://localhost:${PORT}`));
});
