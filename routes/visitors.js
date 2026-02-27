const express = require('express');
const router = express.Router();
const Visitor = require('../models/Visitor');

// GET all visitors - paginated
router.get('/', async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip  = (page - 1) * limit;

    const [visitors, total] = await Promise.all([
      Visitor.find().sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      Visitor.countDocuments()
    ]);

    res.json({ visitors, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET stats summary
router.get('/stats', async (req, res) => {
  try {
    const total = await Visitor.countDocuments();

    const topCities = await Visitor.aggregate([
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const topCountries = await Visitor.aggregate([
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const topISPs = await Visitor.aggregate([
      { $group: { _id: '$isp', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Last 7 days visit count
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCount  = await Visitor.countDocuments({ timestamp: { $gte: sevenDaysAgo } });

    res.json({ total, recentCount, topCities, topCountries, topISPs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a single visitor
router.delete('/:id', async (req, res) => {
  try {
    await Visitor.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE all visitors
router.delete('/', async (req, res) => {
  try {
    await Visitor.deleteMany({});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
