require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const mongoose   = require('mongoose');
const path       = require('path');
const crypto     = require('crypto');
const cookieParser = require('cookie-parser');

const Visitor      = require('./models/Visitor');
const adminAuth    = require('./middleware/adminAuth');
const visitorRoutes = require('./routes/visitors');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ─── MongoDB Connection ───────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected:', process.env.MONGO_URI))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ─── Tracking Route (user-facing) ─────────────────────────────
app.get('/', async (req, res) => {
  // Extract real IP (works behind proxies/Nginx)
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0].trim().replace('::ffff:', '');

  const sessionId = crypto.randomUUID();

  try {
    // Use ip-api.com free tier (no key needed, 45 req/min limit)
    // Falls back to ipinfo.io if ip-api fails
    let geoData = null;

    const geoRes = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,isp,org,timezone,query`
    );
    const geo = await geoRes.json();

    if (geo.status === 'success') {
      geoData = {
        sessionId,
        ip:          geo.query,
        country:     geo.country,
        countryCode: geo.countryCode,
        region:      geo.regionName,
        city:        geo.city,
        zip:         geo.zip,
        lat:         geo.lat,
        lon:         geo.lon,
        isp:         geo.isp,
        org:         geo.org,
        timezone:    geo.timezone,
        userAgent:   req.headers['user-agent'] || '',
        referer:     req.headers['referer'] || 'direct',
        timestamp:   new Date()
      };
    } else {
      // Fallback: save with minimal info if IP lookup fails
      geoData = {
        sessionId,
        ip,
        userAgent: req.headers['user-agent'] || '',
        referer:   req.headers['referer'] || 'direct',
        timestamp: new Date()
      };
    }

    // Save to MongoDB
    const visitor = new Visitor(geoData);
    await visitor.save();

    console.log(`📍 New visitor: ${geoData.city}, ${geoData.country} | IP: ${geoData.ip}`);

    // Broadcast to all connected admin panels in real time
    io.to('admins').emit('new_visitor', { ...geoData, _id: visitor._id });

  } catch (err) {
    console.error('Tracking error:', err.message);
    // Still serve the page even if tracking fails
  }

  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Admin Panel ──────────────────────────────────────────────
app.get('/admin', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── API Routes (protected) ───────────────────────────────────
app.use('/api/visitors', adminAuth, visitorRoutes);

// ─── Socket.IO ────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('join_admin', async () => {
    socket.join('admins');
    console.log('👤 Admin joined:', socket.id);

    // Send recent 50 visitors on connect
    try {
      const recent = await Visitor.find().sort({ timestamp: -1 }).limit(50).lean();
      socket.emit('init_visitors', recent);
    } catch (err) {
      console.error('Socket init error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
  });
});

// ─── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📊 Admin panel:  http://localhost:${PORT}/admin?password=${process.env.ADMIN_PASSWORD}`);
  console.log(`🔗 Tracker link: http://localhost:${PORT}\n`);
});
