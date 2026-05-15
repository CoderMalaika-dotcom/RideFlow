const db = require('../config/db');

const getProfile = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT user_id, fname, lname, email, phone_number, account_status, registration_date
       FROM Users WHERE user_id = ?`,
      [req.user.user_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Rider not found.' });
    res.json({ success: true, rider: rows[0] });
  } catch (err) { next(err); }
};

const updateProfile = async (req, res, next) => {
  try {
    const { fname, lname, phone_number } = req.body;
    await db.query(
      'UPDATE Users SET fname=?, lname=?, phone_number=? WHERE user_id=?',
      [fname, lname, phone_number, req.user.user_id]
    );
    res.json({ success: true, message: 'Profile updated.' });
  } catch (err) { next(err); }
};

const getRideHistory = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT r.ride_id, r.ride_status, r.fare, r.request_time, r.start_time, r.end_time,
              lp.address AS pickup_address, ld.address AS dropoff_address,
              u.fname AS driver_fname, u.lname AS driver_lname, u.user_id AS driver_user_id,
              d.driver_id, d.average_rating AS driver_rating,
              v.vehicle_type, v.make, v.model,
              p.payment_status, p.payment_method, p.payment_id,
              (SELECT COUNT(*) FROM Ratings rt WHERE rt.ride_id = r.ride_id AND rt.rated_by = r.user_id) AS already_rated
       FROM Rides r
       LEFT JOIN Location lp ON r.pickup_location_id = lp.location_id
       LEFT JOIN Location ld ON r.dropoff_location_id = ld.location_id
       LEFT JOIN Driver d ON r.driver_id = d.driver_id
       LEFT JOIN Users u ON d.user_id = u.user_id
       LEFT JOIN Vehicles v ON r.vehicle_id = v.vehicle_id
       LEFT JOIN Payments p ON p.ride_id = r.ride_id AND p.user_id = r.user_id
       WHERE r.user_id = ?
       ORDER BY r.request_time DESC`,
      [req.user.user_id]
    );
    res.json({ success: true, rides: rows });
  } catch (err) { next(err); }
};

const getStats = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT
         COUNT(*) AS total_rides,
         SUM(CASE WHEN ride_status='completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN ride_status='cancelled' THEN 1 ELSE 0 END) AS cancelled,
         COALESCE(SUM(CASE WHEN ride_status='completed' THEN fare ELSE 0 END), 0) AS total_spent
       FROM Rides WHERE user_id=?`,
      [req.user.user_id]
    );
    res.json({ success: true, stats: rows[0] });
  } catch (err) { next(err); }
};

const getMyRatings = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT rt.rating_id, rt.score, rt.comment, rt.timestamp, rt.ride_id,
              u.fname AS driver_fname, u.lname AS driver_lname,
              lp.address AS pickup_address, ld.address AS dropoff_address
       FROM Ratings rt
       LEFT JOIN Users u ON rt.rated_user_id = u.user_id
       LEFT JOIN Rides r ON rt.ride_id = r.ride_id
       LEFT JOIN Location lp ON r.pickup_location_id = lp.location_id
       LEFT JOIN Location ld ON r.dropoff_location_id = ld.location_id
       WHERE rt.rated_by = ?
       ORDER BY rt.timestamp DESC`,
      [req.user.user_id]
    );
    res.json({ success: true, ratings: rows });
  } catch (err) { next(err); }
};

module.exports = { getProfile, updateProfile, getRideHistory, getStats, getMyRatings };