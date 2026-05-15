const express = require('express');
const router  = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const {
  getProfile,
  updateProfile,
  getRideHistory,
  getStats,
  getMyRatings,
} = require('../controllers/riderController');

router.use(authMiddleware);
router.use(roleMiddleware('rider'));

// GET  /api/rider/profile
router.get('/profile', getProfile);

// PUT  /api/rider/profile
router.put('/profile', updateProfile);

// GET  /api/rider/rides   — full ride history
router.get('/rides', getRideHistory);

// GET  /api/rider/stats   — total rides, completed, cancelled, spent
router.get('/stats', getStats);

// GET  /api/rider/ratings — ratings the rider has given
router.get('/ratings', getMyRatings);

module.exports = router;