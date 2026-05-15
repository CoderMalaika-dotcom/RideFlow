const db = require('../config/db');

// ─── CONSTANTS ─────────────────────────────────────────────────────────────────
const PLATFORM_COMMISSION = 0.20; // 20% platform cut

// ─── FARE CALCULATION RATES ────────────────────────────────────────────────────
const VEHICLE_RATES = {
  economy: { base: 50.00,  per_km: 20.00, per_min: 2.00 },
  premium: { base: 100.00, per_km: 40.00, per_min: 4.00 },
  bike:    { base: 30.00,  per_km: 12.00, per_min: 1.00 },
};

/**
 * Haversine distance in kilometres between two lat/lng points.
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Geocode a Pakistani address to { lat, lng } using Nominatim.
 * Returns null on failure.
 */
async function geocodePK(address) {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=pk`;
    const res  = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'RideFlow-Server/1.0' },
    });
    const data = await res.json();
    if (data && data.length) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (_) {}
  return null;
}

/**
 * Surge multiplier for the current moment.
 * Peak hours: 7–9 AM (inclusive of 8 AM) and 5–8 PM.
 * High demand: >10 rides with status 'requested'.
 */
async function getSurgeMultiplier() {
  const hour = new Date().getHours(); // server local time (Pakistan PKT = UTC+5)
  let surge = 1.0;

  // Time-based surge — 8 AM falls in 7–9 AM window
  if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20)) {
    surge = 1.5;
  }

  // Demand-based surge
  try {
    const [[{ cnt }]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM Rides WHERE ride_status = 'requested'`
    );
    if (parseInt(cnt) > 10) surge = Math.max(surge, 1.8);
  } catch (_) {}

  return surge;
}

/**
 * Calculate fare given distance, duration, vehicle type, and surge.
 * Formula: (BaseRate + PerKM × dist + PerMin × dur) × surgeMult
 */
function computeFare(distKm, durMin, vtype, surgeMult) {
  const r = VEHICLE_RATES[vtype] || VEHICLE_RATES.economy;
  const raw = r.base + r.per_km * distKm + r.per_min * durMin;
  return Math.round(raw * surgeMult * 100) / 100;
}

// ─── FARE CALCULATION ──────────────────────────────────────────────────────────

/**
 * POST /api/payments/calculate-fare
 * Accepts:
 *   - { pickup_address, dropoff_address, vehicle_type }  ← preferred (geocodes internally)
 *   - { distance_km, duration_min, vehicle_type }        ← fallback / manual override
 *
 * If coordinate fetching fails, defaults fare to Rs.300.
 */
const calculateFare = async (req, res, next) => {
  try {
    const { pickup_address, dropoff_address, vehicle_type = 'economy' } = req.body;
    let { distance_km, duration_min } = req.body;

    const DEFAULT_FARE = 300;

    // ── Try to derive distance from addresses if not supplied ──────────────
    if ((!distance_km || !duration_min) && pickup_address && dropoff_address) {
      const [pickupGeo, dropoffGeo] = await Promise.all([
        geocodePK(pickup_address),
        geocodePK(dropoff_address),
      ]);

      if (pickupGeo && dropoffGeo) {
        distance_km  = Math.round(haversineKm(pickupGeo.lat, pickupGeo.lng, dropoffGeo.lat, dropoffGeo.lng) * 10) / 10;
        // Estimate duration: avg 25 km/h city speed
        duration_min = Math.max(5, Math.round((distance_km / 25) * 60));
      } else {
        // Geocoding failed — return default fare
        return res.json({
          success: true,
          fare: DEFAULT_FARE,
          surge_applied: false,
          surge_multiplier: 1.0,
          fallback: true,
          message: 'Could not resolve coordinates; using default fare.',
          vehicle_type,
        });
      }
    }

    if (!distance_km || !duration_min) {
      return res.status(400).json({
        success: false,
        message: 'Provide pickup_address & dropoff_address, or distance_km & duration_min.',
      });
    }

    const surgeMult   = await getSurgeMultiplier();
    const fare        = computeFare(parseFloat(distance_km), parseInt(duration_min), vehicle_type, surgeMult);
    const r           = VEHICLE_RATES[vehicle_type] || VEHICLE_RATES.economy;

    res.json({
      success: true,
      fare,
      surge_applied: surgeMult > 1.0,
      surge_multiplier: surgeMult,
      vehicle_type,
      distance_km: parseFloat(distance_km),
      duration_min: parseInt(duration_min),
      breakdown: {
        base_fare: r.base,
        distance_cost: Math.round(r.per_km * parseFloat(distance_km) * 100) / 100,
        time_cost: Math.round(r.per_min * parseInt(duration_min) * 100) / 100,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/validate-promo
 * Validates a promo code and returns discount info.
 * Body: { promo_code }
 */
const validatePromo = async (req, res, next) => {
  try {
    const { promo_code } = req.body;
    if (!promo_code) return res.status(400).json({ success: false, message: 'Promo code is required.' });

    const [promos] = await db.query(
      `SELECT promo_id, code, discount_amount, expiry_date
       FROM PromoCode WHERE code = ? AND expiry_date >= CURDATE()`,
      [promo_code]
    );

    if (!promos.length) {
      return res.status(400).json({ success: false, message: 'Invalid or expired promo code.' });
    }

    res.json({ success: true, promo: promos[0] });
  } catch (err) {
    next(err);
  }
};

// ─── PAYMENT PROCESSING ────────────────────────────────────────────────────────

/**
 * POST /api/payments
 * Process payment for a completed ride.
 * Body: { ride_id, payment_method ('cash'|'card'|'wallet'), promo_code? }
 */
const processPayment = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const { ride_id, payment_method, promo_code } = req.body;

    if (!['cash', 'card', 'wallet'].includes(payment_method)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method. Choose cash, card, or wallet.' });
    }

    await conn.beginTransaction();

    // Get ride details
    const [rides] = await conn.query(
      `SELECT r.*, v.vehicle_type FROM Rides r
       LEFT JOIN Vehicles v ON r.vehicle_id = v.vehicle_id
       WHERE r.ride_id = ? AND r.user_id = ?`,
      [ride_id, req.user.user_id]
    );

    if (!rides.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Ride not found.' });
    }

    const ride = rides[0];
    if (ride.ride_status !== 'completed') {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Ride must be completed before payment.' });
    }

    // Check if payment already exists
    const [existingPayment] = await conn.query(
      `SELECT payment_id FROM Payments WHERE ride_id = ? AND payment_status = 'paid'`,
      [ride_id]
    );
    if (existingPayment.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Payment already processed for this ride.' });
    }

    let amount = parseFloat(ride.fare || 0);
    let promo_id = null;
    let discount_applied = 0;

    // Apply promo code if provided
    if (promo_code) {
      const [promos] = await conn.query(
        `SELECT * FROM PromoCode WHERE code = ? AND expiry_date >= CURDATE()`,
        [promo_code]
      );
      if (!promos.length) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'Invalid or expired promo code.' });
      }
      const promo = promos[0];
      discount_applied = parseFloat(promo.discount_amount);
      amount = Math.max(0, amount - discount_applied);
      promo_id = promo.promo_id;
    }

    // Insert payment record
    const [result] = await conn.query(
      `INSERT INTO Payments (ride_id, user_id, amount, payment_method, payment_status, promo_id)
       VALUES (?, ?, ?, ?, 'paid', ?)`,
      [ride_id, req.user.user_id, amount, payment_method, promo_id]
    );

    // Credit driver net earnings (80% of fare) — update driver wallet via notation in ride history
    if (ride.driver_id) {
      const driverNet = parseFloat((amount * (1 - PLATFORM_COMMISSION)).toFixed(2));
      // Log the earning event in ride history for auditing
      await conn.query(
        `INSERT INTO Ride_History (ride_id, status, timestamp) VALUES (?, ?, NOW())`,
        [ride_id, `payment_completed:${payment_method}:driver_net_${driverNet}`]
      );
    }

    await conn.commit();

    res.status(201).json({
      success: true,
      message: 'Payment processed successfully.',
      payment: {
        payment_id: result.insertId,
        ride_id,
        amount,
        original_fare: parseFloat(ride.fare || 0),
        discount_applied,
        payment_method,
        promo_applied: !!promo_id,
        platform_commission: parseFloat((amount * PLATFORM_COMMISSION).toFixed(2)),
        driver_net: parseFloat((amount * (1 - PLATFORM_COMMISSION)).toFixed(2)),
      },
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ─── PAYMENT QUERIES ───────────────────────────────────────────────────────────

/**
 * GET /api/payments/ride/:ride_id
 */
const getPaymentByRide = async (req, res, next) => {
  try {
    const { ride_id } = req.params;
    const [rows] = await db.query(
      `SELECT p.*, pc.code AS promo_code, pc.discount_amount
       FROM Payments p
       LEFT JOIN PromoCode pc ON p.promo_id = pc.promo_id
       WHERE p.ride_id = ? AND p.user_id = ?`,
      [ride_id, req.user.user_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Payment not found.' });
    res.json({ success: true, payment: rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/payments/history
 * Rider's full payment history with ride details
 */
const getPaymentHistory = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*,
              pc.code AS promo_code,
              pc.discount_amount AS promo_discount,
              lp.address AS pickup_address,
              ld.address AS dropoff_address,
              ROUND(p.amount * ${PLATFORM_COMMISSION}, 2) AS platform_fee
       FROM Payments p
       JOIN Rides r ON p.ride_id = r.ride_id
       LEFT JOIN PromoCode pc ON p.promo_id = pc.promo_id
       LEFT JOIN Location lp ON r.pickup_location_id = lp.location_id
       LEFT JOIN Location ld ON r.dropoff_location_id = ld.location_id
       WHERE p.user_id = ?
       ORDER BY p.transaction_date DESC`,
      [req.user.user_id]
    );
    res.json({ success: true, payments: rows });
  } catch (err) {
    next(err);
  }
};

// ─── DRIVER EARNINGS & PAYOUTS ─────────────────────────────────────────────────

/**
 * GET /api/payments/driver/earnings
 * Driver's own earnings summary and breakdown
 */
const getDriverEarnings = async (req, res, next) => {
  try {
    // Get the driver_id for this user
    const [driverRows] = await db.query(
      `SELECT driver_id FROM Driver WHERE user_id = ?`,
      [req.user.user_id]
    );
    if (!driverRows.length) return res.status(404).json({ success: false, message: 'Driver not found.' });
    const driver_id = driverRows[0].driver_id;

    // Overall earnings summary
    const [[summary]] = await db.query(
      `SELECT COUNT(p.payment_id) AS total_trips,
              SUM(p.amount) AS gross_earned,
              ROUND(SUM(p.amount * ${1 - PLATFORM_COMMISSION}), 2) AS net_earned,
              ROUND(SUM(p.amount * ${PLATFORM_COMMISSION}), 2) AS commission_paid
       FROM Payments p
       JOIN Rides r ON p.ride_id = r.ride_id
       WHERE r.driver_id = ? AND p.payment_status = 'paid'`,
      [driver_id]
    );

    // Recent payment details
    const [recent] = await db.query(
      `SELECT p.payment_id, p.amount,
              ROUND(p.amount * ${1 - PLATFORM_COMMISSION}, 2) AS driver_net,
              p.payment_method, p.transaction_date,
              lp.address AS pickup_address,
              ld.address AS dropoff_address
       FROM Payments p
       JOIN Rides r ON p.ride_id = r.ride_id
       LEFT JOIN Location lp ON r.pickup_location_id = lp.location_id
       LEFT JOIN Location ld ON r.dropoff_location_id = ld.location_id
       WHERE r.driver_id = ? AND p.payment_status = 'paid'
       ORDER BY p.transaction_date DESC
       LIMIT 20`,
      [driver_id]
    );

    res.json({ success: true, summary, recent });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/driver/payout-request
 * Driver requests a weekly payout of their net earnings
 */
const requestPayout = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const [driverRows] = await conn.query(
      `SELECT driver_id FROM Driver WHERE user_id = ?`,
      [req.user.user_id]
    );
    if (!driverRows.length) {
      conn.release();
      return res.status(404).json({ success: false, message: 'Driver profile not found.' });
    }
    const driver_id = driverRows[0].driver_id;

    // Define the 7-day window
    const periodEnd   = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 7);
    const fmtDate = (d) => d.toISOString().slice(0, 10);

    // Check for a pending/processing payout already in this window
    const [existing] = await conn.query(
      `SELECT payout_id FROM Driver_Payouts
       WHERE driver_id = ? AND status IN ('pending','processing')
         AND period_end >= ?`,
      [driver_id, fmtDate(periodStart)]
    );
    if (existing.length) {
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'You already have a pending payout request for this period.',
      });
    }

    // Calculate eligible net earnings for last 7 days
    const [[earnings]] = await conn.query(
      `SELECT ROUND(SUM(p.amount * ${1 - PLATFORM_COMMISSION}), 2) AS payout_amount
       FROM Payments p
       JOIN Rides r ON p.ride_id = r.ride_id
       WHERE r.driver_id = ?
         AND p.payment_status = 'paid'
         AND p.transaction_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [driver_id]
    );

    const payout_amount = parseFloat(earnings.payout_amount || 0);
    if (payout_amount <= 0) {
      conn.release();
      return res.status(400).json({
        success: false,
        message: 'No eligible earnings for payout in the last 7 days.',
      });
    }

    // Insert into Driver_Payouts table
    const [result] = await conn.query(
      `INSERT INTO Driver_Payouts (driver_id, amount, status, period_start, period_end, notes)
       VALUES (?, ?, 'pending', ?, ?, ?)`,
      [
        driver_id,
        payout_amount,
        fmtDate(periodStart),
        fmtDate(periodEnd),
        `Weekly payout request — net 80% of Rs.${(payout_amount / 0.8).toFixed(2)} gross`,
      ]
    );

    conn.release();
    res.json({
      success: true,
      message: 'Payout request submitted successfully. Processing within 2–3 business days.',
      payout: {
        payout_id: result.insertId,
        driver_id,
        amount: payout_amount,
        status: 'pending',
        period_start: fmtDate(periodStart),
        period_end: fmtDate(periodEnd),
        requested_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    conn.release();
    next(err);
  }
};

// ─── FINANCIAL REPORTS (Admin) ─────────────────────────────────────────────────

/**
 * GET /api/payments/reports/revenue
 * Total platform revenue by date range, grouped by payment method
 * Query: start_date, end_date
 */
const getRevenueReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    let query = `
      SELECT DATE(p.transaction_date) AS date,
             p.payment_method,
             COUNT(p.payment_id) AS total_transactions,
             SUM(p.amount) AS gross_revenue,
             ROUND(SUM(p.amount * ${PLATFORM_COMMISSION}), 2) AS platform_commission,
             ROUND(SUM(p.amount * ${1 - PLATFORM_COMMISSION}), 2) AS driver_payouts
      FROM Payments p
      WHERE p.payment_status = 'paid'`;
    const params = [];
    if (start_date) { query += ' AND DATE(p.transaction_date) >= ?'; params.push(start_date); }
    if (end_date)   { query += ' AND DATE(p.transaction_date) <= ?'; params.push(end_date); }
    query += ' GROUP BY DATE(p.transaction_date), p.payment_method ORDER BY date DESC';

    const [rows] = await db.query(query, params);

    // Compute totals
    const totals = rows.reduce(
      (acc, r) => ({
        total_transactions: acc.total_transactions + parseInt(r.total_transactions),
        gross_revenue: acc.gross_revenue + parseFloat(r.gross_revenue),
        platform_commission: acc.platform_commission + parseFloat(r.platform_commission),
        driver_payouts: acc.driver_payouts + parseFloat(r.driver_payouts),
      }),
      { total_transactions: 0, gross_revenue: 0, platform_commission: 0, driver_payouts: 0 }
    );

    res.json({ success: true, report: rows, totals });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/payments/reports/driver-earnings
 * All drivers' earnings and commission breakdown
 */
const getDriverEarningsReport = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT d.driver_id,
              u.fname, u.lname, u.email,
              COUNT(p.payment_id) AS total_rides,
              COALESCE(SUM(p.amount), 0) AS gross_earned,
              COALESCE(ROUND(SUM(p.amount * ${1 - PLATFORM_COMMISSION}), 2), 0) AS net_earned,
              COALESCE(ROUND(SUM(p.amount * ${PLATFORM_COMMISSION}), 2), 0) AS commission_paid,
              d.average_rating,
              d.total_trips
       FROM Driver d
       JOIN Users u ON d.user_id = u.user_id
       LEFT JOIN Rides r ON d.driver_id = r.driver_id AND r.ride_status = 'completed'
       LEFT JOIN Payments p ON r.ride_id = p.ride_id AND p.payment_status = 'paid'
       GROUP BY d.driver_id, u.fname, u.lname, u.email, d.average_rating, d.total_trips
       ORDER BY gross_earned DESC`
    );
    res.json({ success: true, report: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/payments/reports/payment-methods
 * Revenue breakdown by payment method
 */
const getPaymentMethodBreakdown = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT payment_method,
              COUNT(*) AS transactions,
              SUM(amount) AS total_amount,
              ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
       FROM Payments
       WHERE payment_status = 'paid'
       GROUP BY payment_method
       ORDER BY total_amount DESC`
    );
    res.json({ success: true, breakdown: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/payments/reports/refunds
 * Refund and dispute totals
 */
const getRefundReport = async (req, res, next) => {
  try {
    const { start_date, end_date } = req.query;
    let query = `
      SELECT DATE(p.transaction_date) AS date,
             p.payment_status,
             COUNT(*) AS count,
             SUM(p.amount) AS total_amount
      FROM Payments p
      WHERE p.payment_status IN ('failed', 'refunded')`;
    const params = [];
    if (start_date) { query += ' AND DATE(p.transaction_date) >= ?'; params.push(start_date); }
    if (end_date)   { query += ' AND DATE(p.transaction_date) <= ?'; params.push(end_date); }
    query += ' GROUP BY DATE(p.transaction_date), p.payment_status ORDER BY date DESC';

    const [rows] = await db.query(query, params);
    const [[totals]] = await db.query(
      `SELECT SUM(CASE WHEN payment_status='refunded' THEN amount ELSE 0 END) AS total_refunded,
              SUM(CASE WHEN payment_status='failed' THEN 1 ELSE 0 END) AS total_failed,
              COUNT(*) AS total_disputes
       FROM Payments WHERE payment_status IN ('failed','refunded')`
    );
    res.json({ success: true, report: rows, totals });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/:payment_id/refund
 * Admin: mark a payment as refunded
 */
const processRefund = async (req, res, next) => {
  try {
    const { payment_id } = req.params;
    const [payment] = await db.query(
      `SELECT * FROM Payments WHERE payment_id = ?`, [payment_id]
    );
    if (!payment.length) return res.status(404).json({ success: false, message: 'Payment not found.' });
    if (payment[0].payment_status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Only paid payments can be refunded.' });
    }
    await db.query(
      `UPDATE Payments SET payment_status = 'refunded' WHERE payment_id = ?`, [payment_id]
    );
    res.json({ success: true, message: 'Payment marked as refunded.', payment_id });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/payments/driver/payout-history
 * Returns driver's payout request history
 */
const getPayoutHistory = async (req, res, next) => {
  try {
    const [driverRows] = await db.query(
      `SELECT driver_id FROM Driver WHERE user_id = ?`,
      [req.user.user_id]
    );
    if (!driverRows.length) return res.status(404).json({ success: false, message: 'Driver not found.' });
    const driver_id = driverRows[0].driver_id;

    const [rows] = await db.query(
      `SELECT payout_id, amount, status, requested_at, processed_at, period_start, period_end, notes
       FROM Driver_Payouts
       WHERE driver_id = ?
       ORDER BY requested_at DESC`,
      [driver_id]
    );
    res.json({ success: true, payouts: rows });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  calculateFare,
  validatePromo,
  processPayment,
  getPaymentByRide,
  getPaymentHistory,
  getDriverEarnings,
  requestPayout,
  getPayoutHistory,
  getRevenueReport,
  getDriverEarningsReport,
  getPaymentMethodBreakdown,
  getRefundReport,
  processRefund,
};