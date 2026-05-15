const db = require('../config/db');

// ─── USER MANAGEMENT ────────────────────────────────────────────────────────

const getAllUsers = async (req, res, next) => {
  try {
    const { role, status } = req.query;
    let query = 'SELECT user_id, fname, lname, email, phone_number, role, account_status, city, wallet_balance, registration_date FROM Users WHERE 1=1';
    const params = [];
    if (role)   { query += ' AND role=?';           params.push(role); }
    if (status) { query += ' AND account_status=?'; params.push(status); }
    query += ' ORDER BY registration_date DESC';
    const [rows] = await db.query(query, params);
    res.json({ success: true, users: rows });
  } catch (err) { next(err); }
};

const updateUserStatus = async (req, res, next) => {
  try {
    const { user_id } = req.params;
    const { account_status } = req.body;
    if (!['active', 'inactive', 'suspended'].includes(account_status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    await db.query('UPDATE Users SET account_status=? WHERE user_id=?', [account_status, user_id]);
    res.json({ success: true, message: `User status updated to ${account_status}.` });
  } catch (err) { next(err); }
};

// ─── DRIVER VERIFICATION ─────────────────────────────────────────────────────

const getPendingDrivers = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT d.driver_id, u.fname, u.lname, u.email, u.city, d.CNIC, d.license_number,
              d.verification_status, d.profile_photo
       FROM Driver d JOIN Users u ON d.user_id = u.user_id
       WHERE d.verification_status = 'pending'`
    );
    res.json({ success: true, drivers: rows });
  } catch (err) { next(err); }
};

const verifyDriver = async (req, res, next) => {
  try {
    const { driver_id } = req.params;
    const { verification_status } = req.body;
    if (!['verified', 'rejected'].includes(verification_status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    await db.query('UPDATE Driver SET verification_status=? WHERE driver_id=?', [verification_status, driver_id]);
    res.json({ success: true, message: `Driver ${verification_status}.` });
  } catch (err) { next(err); }
};

const verifyVehicle = async (req, res, next) => {
  try {
    const { vehicle_id } = req.params;
    const { verification_status } = req.body;
    if (!['verified', 'rejected'].includes(verification_status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    await db.query('UPDATE Vehicles SET verification_status=? WHERE vehicle_id=?', [verification_status, vehicle_id]);
    res.json({ success: true, message: `Vehicle ${verification_status}.` });
  } catch (err) { next(err); }
};

const getFlaggedDrivers = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT d.driver_id, u.user_id, u.fname, u.lname, u.email, u.city,
              d.average_rating, d.total_trips, u.account_status
       FROM Driver d JOIN Users u ON d.user_id = u.user_id
       WHERE d.average_rating < 3.5 AND d.average_rating > 0
       ORDER BY d.average_rating ASC`
    );
    res.json({ success: true, flagged_drivers: rows });
  } catch (err) { next(err); }
};

// ─── PROMO CODES ─────────────────────────────────────────────────────────────

const createPromo = async (req, res, next) => {
  try {
    const { code, discount_amount, expiry_date, max_uses } = req.body;
    await db.query(
      'INSERT INTO PromoCode (code, discount_amount, expiry_date, max_uses) VALUES (?,?,?,?)',
      [code, discount_amount, expiry_date, max_uses || null]
    );
    res.status(201).json({ success: true, message: 'Promo code created.' });
  } catch (err) { next(err); }
};

const getAllPromos = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM PromoCode ORDER BY expiry_date DESC'
    );
    res.json({ success: true, promos: rows });
  } catch (err) { next(err); }
};

const deletePromo = async (req, res, next) => {
  try {
    await db.query('DELETE FROM PromoCode WHERE promo_id=?', [req.params.promo_id]);
    res.json({ success: true, message: 'Promo deleted.' });
  } catch (err) { next(err); }
};

// ─── ANALYTICS / REPORTS ─────────────────────────────────────────────────────

const getSummary = async (req, res, next) => {
  try {
    const [[userStats]] = await db.query(
      `SELECT COUNT(*) AS total_users,
              SUM(role='rider') AS total_riders,
              SUM(role='driver') AS total_drivers
       FROM Users`
    );
    const [[rideStats]] = await db.query(
      `SELECT COUNT(*) AS total_rides,
              SUM(ride_status='completed') AS completed_rides,
              SUM(ride_status='cancelled') AS cancelled_rides,
              SUM(ride_status IN ('requested','accepted','driver_en_route','in_progress')) AS active_rides
       FROM Rides`
    );
    const [[revenueStats]] = await db.query(
      `SELECT SUM(amount) AS total_revenue,
              SUM(amount * 0.20) AS platform_commission,
              SUM(amount * 0.80) AS driver_payouts
       FROM Payments WHERE payment_status='paid'`
    );
    const [[driverStats]] = await db.query(
      `SELECT COUNT(*) AS total_drivers,
              SUM(verification_status='verified') AS verified_drivers,
              SUM(verification_status='pending') AS pending_verification,
              SUM(availability_status='available') AS online_drivers
       FROM Driver`
    );
    res.json({
      success: true,
      summary: { ...userStats, ...rideStats, ...revenueStats, ...driverStats },
    });
  } catch (err) { next(err); }
};

const getRevenueReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    let query = `
      SELECT DATE(p.transaction_date) AS date,
             p.payment_method,
             COUNT(*) AS transactions,
             SUM(p.amount) AS total_amount,
             SUM(p.amount * 0.20) AS commission
      FROM Payments p
      WHERE p.payment_status = 'paid'`;
    const params = [];
    if (start_date) { query += ' AND p.transaction_date >= ?'; params.push(start_date); }
    if (end_date)   { query += ' AND p.transaction_date <= ?'; params.push(end_date); }
    query += ' GROUP BY DATE(p.transaction_date), p.payment_method ORDER BY date DESC';
    const [rows] = await db.query(query, params);
    res.json({ success: true, report: rows });
  } catch (err) { next(err); }
};

const getRidesReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    let query = `
      SELECT DATE(request_time) AS date, ride_status,
             COUNT(*) AS count, AVG(fare) AS avg_fare, SUM(fare) AS total_fare
      FROM Rides WHERE 1=1`;
    const params = [];
    if (start_date) { query += ' AND request_time >= ?'; params.push(start_date); }
    if (end_date)   { query += ' AND request_time <= ?'; params.push(end_date); }
    query += ' GROUP BY DATE(request_time), ride_status ORDER BY date DESC';
    const [rows] = await db.query(query, params);
    res.json({ success: true, report: rows });
  } catch (err) { next(err); }
};

const getDriverEarningsReport = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT d.driver_id, u.fname, u.lname, u.city,
              COUNT(r.ride_id) AS total_rides,
              COALESCE(SUM(p.amount), 0) AS total_earned,
              COALESCE(SUM(p.amount * 0.80), 0) AS driver_net,
              COALESCE(SUM(p.amount * 0.20), 0) AS commission_paid,
              d.average_rating
       FROM Driver d
       JOIN Users u ON d.user_id = u.user_id
       LEFT JOIN Rides r ON d.driver_id = r.driver_id AND r.ride_status = 'completed'
       LEFT JOIN Payments p ON r.ride_id = p.ride_id AND p.payment_status = 'paid'
       GROUP BY d.driver_id, u.fname, u.lname, u.city, d.average_rating
       ORDER BY total_earned DESC`
    );
    res.json({ success: true, report: rows });
  } catch (err) { next(err); }
};

const getPaymentMethodBreakdown = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT payment_method,
              COUNT(*) AS transactions,
              SUM(amount) AS total_amount,
              ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
       FROM Payments WHERE payment_status = 'paid'
       GROUP BY payment_method`
    );
    res.json({ success: true, breakdown: rows });
  } catch (err) { next(err); }
};

const getAllRides = async (req, res, next) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT r.ride_id, r.ride_status, r.fare, r.request_time,
             lp.address AS pickup_address, lp.city AS pickup_city,
             ld.address AS dropoff_address,
             u.fname AS rider_fname, u.lname AS rider_lname,
             du.fname AS driver_fname, du.lname AS driver_lname
      FROM Rides r
      LEFT JOIN Location lp ON r.pickup_location_id = lp.location_id
      LEFT JOIN Location ld ON r.dropoff_location_id = ld.location_id
      JOIN Users u ON r.user_id = u.user_id
      LEFT JOIN Driver d ON r.driver_id = d.driver_id
      LEFT JOIN Users du ON d.user_id = du.user_id
      WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND r.ride_status=?'; params.push(status); }
    query += ' ORDER BY r.request_time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const [rows] = await db.query(query, params);
    res.json({ success: true, rides: rows });
  } catch (err) { next(err); }
};

const getRevenueByProcedure = async (req, res, next) => {
  try {
    const { start_date = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0], end_date = new Date().toISOString().split('T')[0] } = req.query;
    const [rows] = await db.query('CALL sp_revenue_report(?, ?)', [start_date, end_date]);
    res.json({ success: true, report: rows[0] });
  } catch (err) { next(err); }
};

const getRefundReport = async (req, res, next) => {
  try {
    const [[totals]] = await db.query(
      `SELECT
        SUM(CASE WHEN payment_status='refunded' THEN amount ELSE 0 END) AS total_refunded,
        SUM(CASE WHEN payment_status='failed'   THEN amount ELSE 0 END) AS total_failed_amount,
        SUM(CASE WHEN payment_status='refunded' THEN 1 ELSE 0 END) AS refund_count,
        SUM(CASE WHEN payment_status='failed'   THEN 1 ELSE 0 END) AS failed_count
       FROM Payments WHERE payment_status IN ('refunded','failed')`
    );
    res.json({ success: true, refunds: totals });
  } catch (err) { next(err); }
};

// ─── NEW: COMPONENT 3 — Full Trip Report (INNER JOIN) ─────────────────────────
/**
 * GET /api/admin/reports/trip-report
 * INNER JOIN across Riders, Rides, Drivers, Vehicles
 */
const getFullTripReport = async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT r.ride_id, r.ride_status, r.fare, r.request_time, r.start_time, r.end_time,
             TIMESTAMPDIFF(MINUTE, r.start_time, r.end_time) AS duration_minutes,
             u.user_id  AS rider_id,
             u.fname    AS rider_fname, u.lname AS rider_lname,
             u.phone_number AS rider_phone, u.city AS rider_city,
             du.fname   AS driver_fname, du.lname AS driver_lname,
             du.phone_number AS driver_phone,
             v.make     AS vehicle_make, v.model AS vehicle_model,
             v.license_plate, v.vehicle_type,
             lp.address AS pickup_address, lp.city AS pickup_city,
             ld.address AS dropoff_address
      FROM   Rides    r
      INNER JOIN Users    u   ON r.user_id    = u.user_id
      INNER JOIN Driver   d   ON r.driver_id  = d.driver_id
      INNER JOIN Users    du  ON d.user_id    = du.user_id
      INNER JOIN Vehicles v   ON r.vehicle_id = v.vehicle_id
      LEFT  JOIN Location lp  ON r.pickup_location_id  = lp.location_id
      LEFT  JOIN Location ld  ON r.dropoff_location_id = ld.location_id
      WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND r.ride_status=?'; params.push(status); }
    query += ' ORDER BY r.request_time DESC';
    const [rows] = await db.query(query, params);
    res.json({ success: true, trips: rows });
  } catch (err) { next(err); }
};

// ─── NEW: COMPONENT 3 — All Riders LEFT JOIN (incl. zero-ride riders) ─────────
/**
 * GET /api/admin/reports/all-riders
 */
const getAllRidersReport = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT u.user_id, u.fname, u.lname, u.email, u.phone_number, u.city,
              u.wallet_balance, u.registration_date,
              COUNT(r.ride_id)                                              AS total_rides,
              SUM(CASE WHEN r.ride_status='completed' THEN 1 ELSE 0 END)   AS completed_rides,
              COALESCE(SUM(CASE WHEN r.ride_status='completed' THEN r.fare ELSE 0 END), 0) AS total_spent
       FROM   Users u
       LEFT JOIN Rides r ON u.user_id = r.user_id
       WHERE  u.role = 'rider'
       GROUP BY u.user_id, u.fname, u.lname, u.email, u.phone_number, u.city,
                u.wallet_balance, u.registration_date
       ORDER BY completed_rides DESC`
    );
    res.json({ success: true, riders: rows });
  } catch (err) { next(err); }
};

// ─── NEW: COMPONENT 2 — Low Rated Drivers (HAVING AVG(score) < 3.5) ──────────
/**
 * GET /api/admin/reports/low-rated-drivers
 */
const getLowRatedDrivers = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT d.driver_id, u.fname, u.lname, u.email, u.city,
              AVG(rt.score)      AS avg_rating,
              COUNT(rt.rating_id) AS total_ratings,
              d.total_trips,
              u.account_status
       FROM   Driver  d
       JOIN   Users   u  ON d.user_id       = u.user_id
       JOIN   Ratings rt ON rt.rated_user_id = u.user_id
       GROUP BY d.driver_id, u.fname, u.lname, u.email, u.city, d.total_trips, u.account_status
       HAVING AVG(rt.score) < 3.5
       ORDER BY avg_rating ASC`
    );
    res.json({ success: true, drivers: rows });
  } catch (err) { next(err); }
};

// ─── NEW: COMPONENT 2 — Revenue per City (SUM per city) ──────────────────────
/**
 * GET /api/admin/reports/revenue-by-city
 */
const getRevenueByCity = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT lp.city                       AS city,
              COUNT(p.payment_id)           AS total_rides,
              SUM(p.amount)                 AS total_revenue,
              SUM(p.amount * 0.20)          AS platform_commission,
              SUM(p.amount * 0.80)          AS driver_payouts
       FROM   Payments  p
       JOIN   Rides     r  ON p.ride_id            = r.ride_id
       JOIN   Location  lp ON r.pickup_location_id = lp.location_id
       WHERE  p.payment_status = 'paid'
         AND  lp.city IS NOT NULL
       GROUP BY lp.city
       ORDER BY total_revenue DESC`
    );
    res.json({ success: true, cities: rows });
  } catch (err) { next(err); }
};

// ─── NEW: COMPONENT 3 — Promo Usage per Ride (JOIN Payments + PromoCode) ──────
/**
 * GET /api/admin/reports/promo-usage
 */
const getPromoUsageReport = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT p.payment_id, p.ride_id,
              u.fname        AS rider_fname, u.lname AS rider_lname,
              pc.code        AS promo_code,
              pc.discount_amount,
              pc.usage_count,
              pc.max_uses,
              p.amount       AS amount_paid,
              p.payment_method,
              p.transaction_date
       FROM   Payments  p
       JOIN   Users     u  ON p.user_id  = u.user_id
       JOIN   PromoCode pc ON p.promo_id = pc.promo_id
       WHERE  p.payment_status = 'paid'
       ORDER BY p.transaction_date DESC`
    );
    res.json({ success: true, usage: rows });
  } catch (err) { next(err); }
};

// ─── NEW: COMPONENT 4 — Fare Rules CRUD ──────────────────────────────────────

/**
 * GET /api/admin/fare-rules
 */
const getFareRules = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM FareRules ORDER BY vehicle_type');
    res.json({ success: true, rules: rows });
  } catch (err) { next(err); }
};

/**
 * PUT /api/admin/fare-rules/:vehicle_type
 * Body: { base_fare, per_km_rate, per_min_rate, surge_peak_mult, surge_demand_mult }
 */
const updateFareRule = async (req, res, next) => {
  try {
    const { vehicle_type } = req.params;
    const { base_fare, per_km_rate, per_min_rate, surge_peak_mult, surge_demand_mult } = req.body;
    await db.query(
      `UPDATE FareRules
       SET base_fare=?, per_km_rate=?, per_min_rate=?, surge_peak_mult=?, surge_demand_mult=?
       WHERE vehicle_type=?`,
      [base_fare, per_km_rate, per_min_rate, surge_peak_mult, surge_demand_mult, vehicle_type]
    );
    res.json({ success: true, message: `Fare rules for ${vehicle_type} updated.` });
  } catch (err) { next(err); }
};

// ─── NEW: Admin Notifications ─────────────────────────────────────────────────
/**
 * GET /api/admin/notifications
 */
const getNotifications = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT n.*, u.fname, u.lname
       FROM AdminNotifications n
       LEFT JOIN Users u ON n.ref_user_id = u.user_id
       ORDER BY n.created_at DESC LIMIT 50`
    );
    res.json({ success: true, notifications: rows });
  } catch (err) { next(err); }
};

/**
 * PUT /api/admin/notifications/:id/read
 */
const markNotificationRead = async (req, res, next) => {
  try {
    await db.query('UPDATE AdminNotifications SET is_read=1 WHERE notification_id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
};

module.exports = {
  getAllUsers, updateUserStatus,
  getPendingDrivers, verifyDriver, verifyVehicle, getFlaggedDrivers,
  createPromo, getAllPromos, deletePromo,
  getSummary, getRevenueReport, getRidesReport,
  getDriverEarningsReport, getPaymentMethodBreakdown,
  getAllRides, getRevenueByProcedure, getRefundReport,
  // NEW
  getFullTripReport, getAllRidersReport, getLowRatedDrivers,
  getRevenueByCity, getPromoUsageReport,
  getFareRules, updateFareRule,
  getNotifications, markNotificationRead,
};