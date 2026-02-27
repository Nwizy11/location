require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const mongoose   = require('mongoose');
const path       = require('path');
const crypto     = require('crypto');
const cookieParser = require('cookie-parser');

const Visitor       = require('./models/Visitor');
const adminAuth     = require('./middleware/adminAuth');
const visitorRoutes = require('./routes/visitors');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files with absolute path resolution
const PUBLIC_DIR = path.resolve(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// ─── MongoDB Connection ───────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ─── IP Geolocation helper (tries multiple providers) ─────────
async function getGeoData(ip) {
  // Skip private/local IPs
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168') || ip.startsWith('10.')) {
    return null;
  }

  // Provider 1: ip-api.com (free, no key, but blocks some datacenter IPs)
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,zip,lat,lon,isp,org,timezone,query`,
      { signal: AbortSignal.timeout(4000) }
    );
    const geo = await res.json();
    if (geo.status === 'success') return geo;
  } catch (e) {
    console.log('ip-api failed, trying fallback...');
  }

  // Provider 2: ipwho.is (free, no key needed, works on server IPs)
  try {
    const res = await fetch(`https://ipwho.is/${ip}`, { signal: AbortSignal.timeout(4000) });
    const geo = await res.json();
    if (geo.success) {
      return {
        query:       geo.ip,
        country:     geo.country,
        countryCode: geo.country_code,
        regionName:  geo.region,
        city:        geo.city,
        zip:         geo.postal,
        lat:         geo.latitude,
        lon:         geo.longitude,
        isp:         geo.connection?.isp || '',
        org:         geo.connection?.org || '',
        timezone:    geo.timezone?.id || ''
      };
    }
  } catch (e) {
    console.log('ipwho.is failed too');
  }

  // Provider 3: freeipapi.com (last resort)
  try {
    const res = await fetch(`https://freeipapi.com/api/json/${ip}`, { signal: AbortSignal.timeout(4000) });
    const geo = await res.json();
    if (geo.ipAddress) {
      return {
        query:       geo.ipAddress,
        country:     geo.countryName,
        countryCode: geo.countryCode,
        regionName:  geo.regionName,
        city:        geo.cityName,
        zip:         geo.zipCode,
        lat:         geo.latitude,
        lon:         geo.longitude,
        isp:         '',
        org:         '',
        timezone:    geo.timeZone || ''
      };
    }
  } catch (e) {
    console.log('freeipapi failed too');
  }

  return null;
}

// ─── Debug endpoint (remove after testing) ────────────────────
app.get('/debug', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0].trim().replace('::ffff:', '');

  let results = { detectedIP: ip, providers: {} };

  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,city,lat,lon,isp,query`, { signal: AbortSignal.timeout(4000) });
    results.providers['ip-api.com'] = await r.json();
  } catch(e) { results.providers['ip-api.com'] = { error: e.message }; }

  try {
    const r = await fetch(`https://ipwho.is/${ip}`, { signal: AbortSignal.timeout(4000) });
    results.providers['ipwho.is'] = await r.json();
  } catch(e) { results.providers['ipwho.is'] = { error: e.message }; }

  try {
    const r = await fetch(`https://freeipapi.com/api/json/${ip}`, { signal: AbortSignal.timeout(4000) });
    results.providers['freeipapi.com'] = await r.json();
  } catch(e) { results.providers['freeipapi.com'] = { error: e.message }; }

  try {
    const Visitor = require('./models/Visitor');
    const count = await Visitor.countDocuments();
    results.mongoConnected = true;
    results.visitorCount = count;
  } catch(e) { results.mongoConnected = false; results.mongoError = e.message; }

  res.json(results);
});

// ─── Tracking Route (user-facing) ─────────────────────────────
app.get('/', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0].trim().replace('::ffff:', '');

  const sessionId = crypto.randomUUID();

  try {
    const geo = await getGeoData(ip);

    const geoData = geo ? {
      sessionId,
      ip:          geo.query || ip,
      country:     geo.country     || 'Unknown',
      countryCode: geo.countryCode || '',
      region:      geo.regionName  || 'Unknown',
      city:        geo.city        || 'Unknown',
      zip:         geo.zip         || '',
      lat:         geo.lat         ?? null,
      lon:         geo.lon         ?? null,
      isp:         geo.isp         || '',
      org:         geo.org         || '',
      timezone:    geo.timezone    || '',
      userAgent:   req.headers['user-agent'] || '',
      referer:     req.headers['referer'] || 'direct',
      timestamp:   new Date()
    } : {
      sessionId,
      ip,
      userAgent: req.headers['user-agent'] || '',
      referer:   req.headers['referer'] || 'direct',
      timestamp: new Date()
    };

    const visitor = new Visitor(geoData);
    await visitor.save();

    console.log(`📍 New visitor: ${geoData.city}, ${geoData.country} | IP: ${geoData.ip}`);
    io.to('admins').emit('new_visitor', { ...geoData, _id: visitor._id });

  } catch (err) {
    console.error('Tracking error:', err.message);
  }

  res.sendFile(path.resolve(PUBLIC_DIR, 'index.html'));
});

// ─── Admin Panel ──────────────────────────────────────────────
app.get('/admin', adminAuth, (req, res) => {
  res.sendFile(path.resolve(PUBLIC_DIR, 'admin.html'));
});

// ─── API Routes (protected) ───────────────────────────────────
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
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📊 Admin: /admin?password=${process.env.ADMIN_PASSWORD}`);
});
