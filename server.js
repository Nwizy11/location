require('dotenv').config();
const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const mongoose     = require('mongoose');
const path         = require('path');
const crypto       = require('crypto');
const cookieParser = require('cookie-parser');

const Visitor       = require('./models/Visitor');
const adminAuth     = require('./middleware/adminAuth');
const visitorRoutes = require('./routes/visitors');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

const PUBLIC_DIR = path.resolve(__dirname, 'public');

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Log all requests ─────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.path}`);
  next();
});

// ─── MongoDB ──────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB:', err.message); process.exit(1); });

// ─── Debug ────────────────────────────────────────────────────
app.get('/debug', async (req, res) => {
  const count = await Visitor.countDocuments();
  const last  = await Visitor.findOne().sort({ timestamp: -1 }).lean();
  res.json({ mongoConnected: true, visitorCount: count, lastVisitor: last });
});

// ─── Step 1: User visits page ─────────────────────────────────
// Save a "pending" record immediately with NO location data.
// The browser will fill in the real location via /api/update-location.
app.get('/', async (req, res) => {
  // Serve page immediately
  res.sendFile(path.resolve(PUBLIC_DIR, 'index.html'));

  // Save minimal record in background — NO IP lookup, NO geo guessing
  setImmediate(async () => {
    try {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
        .split(',')[0].trim().replace('::ffff:', '');

      const visitorData = {
        sessionId: crypto.randomUUID(),
        ip,
        city:      'Pending...',
        region:    'Pending...',
        country:   'Pending...',
        userAgent: req.headers['user-agent'] || '',
        referer:   req.headers['referer']    || 'direct',
        timestamp: new Date()
      };

      const visitor = await Visitor.create(visitorData);
      console.log(`[VISIT] New visitor saved | ID: ${visitor._id} | IP: ${ip}`);

      // Notify admin of new pending visitor
      io.to('admins').emit('new_visitor', { ...visitorData, _id: visitor._id });

    } catch (err) {
      console.error('[VISIT] Save error:', err.message);
    }
  });
});

// ─── Step 2: Browser sends real location ──────────────────────
// BigDataCloud JS client resolves city/country in the browser
// (via GPS if allowed, or its own IP lookup as fallback)
// then POSTs the result here. We update the visitor record.
app.post('/api/update-location', async (req, res) => {
  try {
    const {
      lat, lon, city, region, country,
      countryCode, zip, lookupSource
    } = req.body;

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .split(',')[0].trim().replace('::ffff:', '');

    console.log(`[LOC] Received from browser: ${city}, ${region}, ${country} | source: ${lookupSource} | IP: ${ip}`);

    if (!city && !country) {
      return res.json({ success: false, reason: 'no location data received' });
    }

    const update = {
      city:        city        || 'Unknown',
      region:      region      || 'Unknown',
      country:     country     || 'Unknown',
      countryCode: countryCode || '',
      zip:         zip         || '',
      lookupSource: lookupSource || 'unknown'
    };
    if (lat) update.lat = parseFloat(lat);
    if (lon) update.lon = parseFloat(lon);

    const visitor = await Visitor.findOneAndUpdate(
      { ip },
      { $set: update },
      { sort: { timestamp: -1 }, new: true }
    );

    if (visitor) {
      const source = lookupSource === 'reverseGeocoding' ? '📡 GPS' : '🌐 BigDataCloud IP';
      console.log(`[LOC] ✅ Updated → ${city}, ${region}, ${country} [${source}]`);

      io.to('admins').emit('location_updated', {
        _id:         visitor._id,
        lat:         visitor.lat,
        lon:         visitor.lon,
        city:        visitor.city,
        region:      visitor.region,
        country:     visitor.country,
        countryCode: visitor.countryCode,
        zip:         visitor.zip,
        lookupSource
      });

      return res.json({ success: true });
    }

    console.log(`[LOC] No visitor found for IP: ${ip}`);
    res.json({ success: false, reason: 'visitor not found' });

  } catch (err) {
    console.error('[LOC] Error:', err.message);
    res.status(500).json({ success: false });
  }
});

// ─── Static files ─────────────────────────────────────────────
app.use(express.static(PUBLIC_DIR));

// ─── Admin Panel ──────────────────────────────────────────────
app.get('/admin', adminAuth, (req, res) => {
  res.sendFile(path.resolve(PUBLIC_DIR, 'admin.html'));
});

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/visitors', adminAuth, visitorRoutes);

// ─── Socket.IO ────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('join_admin', async () => {
    socket.join('admins');
    try {
      const recent = await Visitor.find().sort({ timestamp: -1 }).limit(50).lean();
      socket.emit('init_visitors', recent);
    } catch (err) {
      console.error('Socket init error:', err.message);
    }
  });
});

// ─── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server on port ${PORT}`);
  console.log(`📊 Admin: /admin?password=${process.env.ADMIN_PASSWORD}\n`);
});
