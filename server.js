require('dotenv').config();

const { Filter } = require('bad-words');
const filter = new Filter()
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const fs = require('fs');
const path = require('path');

const app = express();

// Trust the X-Forwarded-For header set by hosts like Render, so the rate
// limiter sees each visitor's real IP instead of the proxy's
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOG_FILE = path.join(__dirname, 'server.log');

let visitorCount = 0;

// Trim the log file if it's gotten too big
if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 128 * 128) {
    const recentLines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-10);
    fs.writeFileSync(LOG_FILE, recentLines.join('\n'));
}
const GUESTBOOK_FILE = path.join(__dirname, 'guestbook.json');

function getGuestbookMessages() {
    if (!fs.existsSync(GUESTBOOK_FILE)) return [];
    return JSON.parse(fs.readFileSync(GUESTBOOK_FILE, 'utf8'));
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
};

// ==========================================
// MIDDLEWARE SETUP
// Each function below runs on every request, then calls next() to pass
// it along - like a checkpoint before your routes.
// ==========================================

// Parse incoming POST form data (from <form> submissions) and JSON bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use((req, res, next) => {
    const logLine = `[${new Date().toISOString()}] ${req.method} ${req.path}\n`;
    console.log(logLine.trim());
    fs.appendFile(LOG_FILE, logLine, (err) => {
        if (err) console.error('Log write failed:', err);
    });
    next();
});
// requests within the time window
const limiter = rateLimit({
    windowMs: 10 * 1000, // 10 second window
    limit: 100,          // max requests per window, per IP
    message: '<h1>429 Too Many Requests</h1><p>Please wait10 seconds.</p>'
});
app.use(limiter);

// Logs every request to the console and to server.log


// Rate limiter - blocks an IP with a 429 response if it sends too many
// requests within the time window


// Tracks logged-in users via a signed cookie - the browser sends it back
// automatically, no frontend code needed. Requires SESSION_SECRET in .env.
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 15 * 60 * 1000 } // session expires after 15 minutes
}));

// Route guard - use this on any route that should require login.
// Example: app.get('/dashboard', requireAuth, (req, res) => { ... });
function requireAuth(req, res, next) {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Unauthorized. Please log in first.' });
    }
    next();
}

// ==========================================
// ROUTES
// Fill these in! Example routes are shown below.
// ==========================================

app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello, world!' });
});

// Exposes the visitor count as JSON, e.g. for a frontend script to display
app.get('/api/stats', (req, res) => {
    res.json({ visitorCount });
});

// Checks the password against .env; marks the session authenticated if correct
app.post('/login', (req, res) => {
    const { password, rememberMe } = req.body;
    if (password === process.env.APP_PASSWORD) {
        req.session.isAuthenticated = true;
        if (rememberMe) {
            // Set a cookie to remember the user
            req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        }
        return res.status(200).json({ success: true });
    }
    return res.status(401).json({ success: false, error: 'Unauthorized. Incorrect password.' });
});

// Logout - destroys the session so req.session.isAuthenticated is gone
app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});
app.post('/api/guestbook', requireAuth, (req, res) => {
    const { name, msg } = req.body;
    if (!msg) {
        const error = validateEntry(name, msg);
        if (error) {
            return res.status(400).json({ error: error });
        }
        return res.status(400).json({ error: 'Message is required' });
    }
    const messages = getGuestbookMessages();
    const cleanedInput = msg.replace(/\s+/g, ' ').trim();
    const compactedInput = cleanedInput.replace(/\s+/g, ' ').trim();
    if (filter.isProfane(compactedInput)) {
        return res.status(400).json({ error: 'Profanity is not allowed' });
    }

    const entry = {
        id: crypto.randomUUID(),
        name: name,
        msg: cleanedInput,
        createdAt: new Date().toISOString()
    }
    messages.push(entry);

    fs.writeFileSync(GUESTBOOK_FILE, JSON.stringify(messages.slice(-50), null, 2));
    res.json({ success: true });
});

// Example protected route - try visiting this without logging in first
app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

// Example: run code (logging, a counter, etc.) before serving a page from /public
app.get('/projects', (req, res) => {
    visitorCount++;
    console.log(`Visit #${visitorCount}: someone viewed the projects page`);
    res.sendFile(path.join(PUBLIC_DIR, 'projects.html'));
});
app.get('/about', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'about.html'));
});

app.get('/guestbook', requireAuth, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'guestbook.html'));
});

app.get('/api/whoami', (req, res) => {
    res.json({ loggedIn: req.session.isAuthenticated });
});
app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});
app.get('/api/guestbook', requireAuth, (req, res) => {
    res.json(getGuestbookMessages());
});
app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});
app.get('/api/space', async (req, res) => {
    const { date } = req.query;

    // Validation goes here in Part 4

    if (!process.env.NASA_API_KEY) {
        throw new Error('NASA_API_KEY is missing from .env');
    }

    // NASA has one address for the latest pictures, and another for one day.
    // The one-day address uses the date as YYMMDD: 2025-07-04 becomes 250704
    let address = 'https://science.nasa.gov/wp-json/wp/v2/apod-basic/';
    if (date) {
        const shortDate = date.slice(2).replaceAll('-', '');
        address = address + shortDate;
    }

    // Add the secret key on the server
    const nasaUrl = new URL(address);
    nasaUrl.searchParams.set('api_key', process.env.NASA_API_KEY);

    let nasaResponse;
    try {
        // Give up if NASA takes longer than 8 seconds
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

    // With a date, NASA sends one picture. Without one, it sends a list,
    // and the first item is the newest.
    const picture = Array.isArray(data) ? data[0] : data;

    // Send back only what our page needs, with names we chose
    res.json({
        title: picture.title,
        date: picture.date,
        imageUrl: picture.hdurl,
        description: picture.alt,
        nasaPage: picture.permalink
    });
});
// app.post('/your-route-here', (req, res) => {
//
// });

// ==========================================
// STATIC FILES
// Serves everything in /public (put this AFTER your routes)
// `extensions: ['html']` lets /projects find projects.html without the extension
// ==========================================
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});
app.use((err, req, res, next) => {
    // Full details go to YOU, in the console and the log file
    const time = new Date().toISOString();
    console.error(`[${time}] ERROR ${req.method} ${req.path}`, err);
    fs.appendFile(LOG_FILE, `[${time}] ERROR ${req.method} ${req.path}: ${err.message}\n`, () => { });

    // If a response already started sending, let Express finish up
    if (res.headersSent) return next(err);

    // Errors with a status under 500 are the user's fault and safe to explain.
    // Anything else is our fault, so hide the details.
    const status = err.status || 500;
    const message = status < 500 ? err.message : 'Something went wrong on our end.';

    if (req.path.startsWith('/api/')) {
        return res.status(status).json({ error: message });
    }
    res.status(status).send('<h1>Something went wrong</h1><p>Please try again later.</p><a href="/">Back to home</a>');
});
app.listen(PORT, () => console.log(`Server live on http://localhost:${PORT}`));
