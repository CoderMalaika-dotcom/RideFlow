const db = require('../config/db');

/**
 * POST /api/ratings
 * Submit a rating after a completed ride.
 * Body: { ride_id, rated_user_id, score, comment? }
 */
const submitRating = async (req, res, next) => {
  try {
    const { ride_id, rated_user_id, score, comment } = req.body;

    // Ensure all IDs are integers — guards against stale ENUM-typed columns
    const rideIdInt      = parseInt(ride_id);
    const ratedUserIdInt = parseInt(rated_user_id);
    const scoreInt       = parseInt(score);
    const raterUserId    = parseInt(req.user.user_id);

    if (scoreInt < 1 || scoreInt > 5) {
      return res.status(400).json({ success: false, message: 'Score must be between 1 and 5.' });
    }

    // Verify ride is completed
    const [rides] = await db.query('SELECT * FROM Rides WHERE ride_id=?', [rideIdInt]);
    if (!rides.length) return res.status(404).json({ success: false, message: 'Ride not found.' });
    if (rides[0].ride_status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Can only rate completed rides.' });
    }

    // Prevent duplicate rating for same ride by same user
    const [existing] = await db.query(
      'SELECT rating_id FROM Ratings WHERE ride_id=? AND rated_by=?',
      [rideIdInt, raterUserId]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'You have already rated this ride.' });
    }

    await db.query(
      `INSERT INTO Ratings (ride_id, rated_by, rated_user_id, score, comment) VALUES (?,?,?,?,?)`,
      [rideIdInt, raterUserId, ratedUserIdInt, scoreInt, comment || null]
    );

    // Update driver's average rating if driver was rated
    const [driverCheck] = await db.query('SELECT driver_id FROM Driver WHERE user_id=?', [ratedUserIdInt]);
    if (driverCheck.length) {
      // Compute AVG separately — MySQL forbids referencing the target
      // table (Driver) inside a subquery of the same UPDATE statement
      const [avgRows] = await db.query(
        'SELECT AVG(score) AS avg_score FROM Ratings WHERE rated_user_id = ?',
        [ratedUserIdInt]
      );
      const avgScore = avgRows[0].avg_score || 0;
      await db.query(
        'UPDATE Driver SET average_rating = ? WHERE driver_id = ?',
        [avgScore, driverCheck[0].driver_id]
      );
    }

    res.status(201).json({ success: true, message: 'Rating submitted.' });
  } catch (err) { next(err); }
};

/**
 * GET /api/ratings/driver/:driver_id
 * Get all ratings for a driver
 */
const getDriverRatings = async (req, res, next) => {
  try {
    const { driver_id } = req.params;
    const [rows] = await db.query(
      `SELECT r.rating_id, r.score, r.comment, r.timestamp,
              u.fname AS rated_by_fname, u.lname AS rated_by_lname
       FROM Ratings r
       JOIN Driver d ON r.rated_user_id = d.user_id
       JOIN Users u ON r.rated_by = u.user_id
       WHERE d.driver_id = ?
       ORDER BY r.timestamp DESC`,
      [driver_id]
    );
    res.json({ success: true, ratings: rows });
  } catch (err) { next(err); }
};

/**
 * GET /api/ratings/leaderboard
 * Top drivers by rating
 */
const getLeaderboard = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT d.driver_id, u.fname, u.lname, d.average_rating, d.total_trips
       FROM Driver d
       JOIN Users u ON d.user_id = u.user_id
       WHERE d.verification_status = 'verified'
       ORDER BY d.average_rating DESC, d.total_trips DESC
       LIMIT 20`
    );
    res.json({ success: true, leaderboard: rows });
  } catch (err) { next(err); }
};

module.exports = { submitRating, getDriverRatings, getLeaderboard };