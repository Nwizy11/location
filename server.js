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

// ─── Log ALL incoming requests ────────────────────────────────
app.use((req, res, next) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  console.log(`[REQ] ${req.method} ${req.path} | IP: ${ip}`);
  next();
});

// ─── MongoDB Connection ───────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB:', err.message); process.exit(1); });

// ─── IP Geolocation ───────────────────────────────────────────
async function getGeoData(ip) {
  // Try ip-api first
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,zip,lat,lon,isp,org,timezone,query`,
      { signal: AbortSignal.timeout(5000) }
    );
    const geo = await res.json();
    if (geo.status === 'success') {
      console.log(`[GEO] ip-api success: ${geo.city}, ${geo.country}`);
      return geo;
    }
    console.log(`[GEO] ip-api failed: ${geo.message}`);
  } catch (e) {
    console.log(`[GEO] ip-api error: ${e.message}`);
  }

  // Fallback: freeipapi
  try {
    const res = await fetch(`https://freeipapi.com/api/json/${ip}`, { signal: AbortSignal.timeout(5000) });
    const geo = await res.json();
    if (geo.ipAddress) {
      console.log(`[GEO] freeipapi success: ${geo.cityName}, ${geo.countryName}`);
      return {
        query:       geo.ipAddress,
        country:     geo.countryName,
        countryCode: geo.countryCode,
        regionName:  geo.regionName,
        city:        geo.cityName,
        zip:         geo.zipCode     || '',
        lat:         geo.latitude,
        lon:         geo.longitude,
        isp:         geo.asnOrganization || '',
        org:         geo.asnOrganization || '',
        timezone:    geo.timeZones?.[0]  || ''
      };
    }
  } catch (e) {
    console.log(`[GEO] freeipapi error: ${e.message}`);
  }

  console.log(`[GEO] All providers failed for IP: ${ip}`);
  return null;
}

// ─── Debug Route ──────────────────────────────────────────────
app.get('/debug', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0].trim().replace('::ffff:', '');
  const geo   = await getGeoData(ip);
  const count = await Visitor.countDocuments();
  const last  = await Visitor.findOne().sort({ timestamp: -1 }).lean();
  res.json({ ip, geo, mongoConnected: true, visitorCount: count, lastVisitor: last });
});

// ─── Tracking Route ───────────────────────────────────────────
app.get('/', async (req, res) => {
  console.log('[TRACK] / route hit');

  // Serve page immediately
  res.sendFile(path.resolve(PUBLIC_DIR, 'index.html'));

  // Save visitor in background
  try {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .split(',')[0].trim().replace('::ffff:', '');

    console.log(`[TRACK] IP detected: ${ip}`);

    const geo = await getGeoData(ip);

    const visitorData = {
      sessionId:   crypto.randomUUID(),
      ip:          geo?.query       || ip,
      country:     geo?.country     || 'Unknown',
      countryCode: geo?.countryCode || '',
      region:      geo?.regionName  || 'Unknown',
      city:        geo?.city        || 'Unknown',
      zip:         geo?.zip         || '',
      lat:         geo?.lat         ?? null,
      lon:         geo?.lon         ?? null,
      isp:         geo?.isp         || '',
      org:         geo?.org         || '',
      timezone:    geo?.timezone    || '',
      userAgent:   req.headers['user-agent'] || '',
      referer:     req.headers['referer']    || 'direct',
      timestamp:   new Date()
    };

    console.log(`[TRACK] Saving to MongoDB...`);
    const visitor = await Visitor.create(visitorData);
    console.log(`[TRACK] ✅ Saved! ID: ${visitor._id} | ${visitorData.city}, ${visitorData.country}`);

    io.to('admins').emit('new_visitor', { ...visitorData, _id: visitor._id });

  } catch (err) {
    console.error(`[TRACK] ❌ Error: ${err.message}`);
    console.error(err.stack);
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

// ─── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Admin: /admin?password=${process.env.ADMIN_PASSWORD}`);
});
