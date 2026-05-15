const express = require('express');
const router = express.Router();
const { submitRating, getDriverRatings, getLeaderboard } = require('../controllers/ratingController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.post('/', submitRating);
router.get('/leaderboard', getLeaderboard);
router.get('/driver/:driver_id', getDriverRatings);

module.exports = router;
