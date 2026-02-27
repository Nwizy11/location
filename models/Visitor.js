const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  ip:          { type: String, default: 'Unknown' },
  country:     { type: String, default: 'Unknown' },
  countryCode: { type: String, default: '' },
  region:      { type: String, default: 'Unknown' },
  city:        { type: String, default: 'Unknown' },
  zip:         { type: String, default: '' },
  lat:         { type: Number, default: null },
  lon:         { type: Number, default: null },
  isp:         { type: String, default: 'Unknown' },
  org:         { type: String, default: '' },
  timezone:    { type: String, default: '' },
  userAgent:   { type: String, default: '' },
  referer:     { type: String, default: 'direct' },
  timestamp:   { type: Date, default: Date.now }
});

// Index for fast queries
visitorSchema.index({ timestamp: -1 });
visitorSchema.index({ city: 1 });
visitorSchema.index({ country: 1 });

module.exports = mongoose.model('Visitor', visitorSchema);
