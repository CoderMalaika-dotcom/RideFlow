const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// --- Multer setup for profile photo uploads ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_PATH || 'backend/uploads/driver-photos';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `driver_${req.user.user_id}_${Date.now()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png/;
    cb(null, allowed.test(file.mimetype));
  },
});

/**
 * GET /api/driver/profile
 */
const getProfile = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT u.fname, u.lname, u.email, u.phone_number, u.account_status,
              d.driver_id, d.CNIC, d.license_number, d.profile_photo,
              d.verification_status, d.availability_status, d.average_rating, d.total_trips
       FROM Users u
       JOIN Driver d ON u.user_id = d.user_id
       WHERE u.user_id = ?`,
      [req.user.user_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Driver not found.' });
    res.json({ success: true, driver: rows[0] });
  } catch (err) { next(err); }
};

/**
 * PUT /api/driver/availability
 * Body: { availability_status: 'available' | 'busy' | 'offline' }
 */
const setAvailability = async (req, res, next) => {
  try {
    const { availability_status } = req.body;
    const allowed = ['available', 'busy', 'offline'];
    if (!allowed.includes(availability_status)) {
      return res.status(400).json({ success: false, message: 'Invalid availability status.' });
    }
    await db.query(
      `UPDATE Driver SET availability_status=? WHERE user_id=?`,
      [availability_status, req.user.user_id]
    );
    res.json({ success: true, message: `Status set to ${availability_status}.` });
  } catch (err) { next(err); }
};

/**
 * POST /api/driver/location
 * Body: { latitude, longitude }
 * Always inserts a new row so the full location history is preserved.
 * The most recent row (by timestamp) is treated as the driver's current position.
 */
const updateLocation = async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({ success: false, message: 'latitude and longitude are required.' });
    }

    const [driverRows] = await db.query('SELECT driver_id FROM Driver WHERE user_id=?', [req.user.user_id]);
    if (!driverRows.length) return res.status(404).json({ success: false, message: 'Driver not found.' });

    const driver_id = driverRows[0].driver_id;
    await db.query(
      'INSERT INTO Driver_Location (driver_id, latitude, longitude, timestamp) VALUES (?,?,?,NOW())',
      [driver_id, latitude, longitude]
    );
    res.json({ success: true, message: 'Location updated.' });
  } catch (err) { next(err); }
};

/**
 * GET /api/driver/rides
 * Rides assigned to this driver
 */
const getMyRides = async (req, res, next) => {
  try {
    const [driverRows] = await db.query('SELECT driver_id FROM Driver WHERE user_id=?', [req.user.user_id]);
    if (!driverRows.length) return res.status(404).json({ success: false, message: 'Driver not found.' });
    const driver_id = driverRows[0].driver_id;

    const [rows] = await db.query(
      `SELECT r.ride_id, r.ride_status, r.fare, r.request_time, r.start_time, r.end_time,
              lp.address AS pickup_address, ld.address AS dropoff_address,
              u.fname AS rider_fname, u.lname AS rider_lname
       FROM Rides r
       LEFT JOIN Location lp ON r.pickup_location_id = lp.location_id
       LEFT JOIN Location ld ON r.dropoff_location_id = ld.location_id
       JOIN Users u ON r.user_id = u.user_id
       WHERE r.driver_id = ?
       ORDER BY r.request_time DESC`,
      [driver_id]
    );
    res.json({ success: true, rides: rows });
  } catch (err) { next(err); }
};

/**
 * POST /api/driver/photo  (multipart/form-data, field: photo)
 */
const uploadPhoto = [
  upload.single('photo'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
      const photoPath = req.file.path;
      await db.query('UPDATE Driver SET profile_photo=? WHERE user_id=?', [photoPath, req.user.user_id]);
      res.json({ success: true, message: 'Photo uploaded.', path: photoPath });
    } catch (err) { next(err); }
  },
];

/**
 * GET /api/driver/vehicles
 */
const getVehicles = async (req, res, next) => {
  try {
    const [driverRows] = await db.query('SELECT driver_id FROM Driver WHERE user_id=?', [req.user.user_id]);
    if (!driverRows.length) return res.status(404).json({ success: false, message: 'Driver not found.' });
    const [vehicles] = await db.query(
      'SELECT * FROM Vehicles WHERE driver_id=?',
      [driverRows[0].driver_id]
    );
    res.json({ success: true, vehicles });
  } catch (err) { next(err); }
};

/**
 * POST /api/driver/vehicles
 */
const addVehicle = async (req, res, next) => {
  try {
    const { license_plate, make, model, year, color, vehicle_type } = req.body;
    const [driverRows] = await db.query('SELECT driver_id FROM Driver WHERE user_id=?', [req.user.user_id]);
    if (!driverRows.length) return res.status(404).json({ success: false, message: 'Driver not found.' });

    await db.query(
      `INSERT INTO Vehicles (driver_id, license_plate, make, model, year, color, vehicle_type)
       VALUES (?,?,?,?,?,?,?)`,
      [driverRows[0].driver_id, license_plate, make, model, year, color, vehicle_type]
    );
    res.status(201).json({ success: true, message: 'Vehicle added. Pending verification.' });
  } catch (err) { next(err); }
};

/**
 * GET /api/driver/earnings
 */
const getEarnings = async (req, res, next) => {
  try {
    const [driverRows] = await db.query('SELECT driver_id FROM Driver WHERE user_id=?', [req.user.user_id]);
    if (!driverRows.length) return res.status(404).json({ success: false, message: 'Driver not found.' });

    const [rows] = await db.query(
      `SELECT COUNT(r.ride_id) AS total_rides,
              SUM(r.fare) AS total_fare,
              SUM(r.fare * 0.80) AS driver_earnings,
              SUM(r.fare * 0.20) AS platform_commission
       FROM Rides r
       WHERE r.driver_id = ? AND r.ride_status = 'completed'`,
      [driverRows[0].driver_id]
    );
    res.json({ success: true, earnings: rows[0] });
  } catch (err) { next(err); }
};



/**
 * POST /api/driver/complete-profile
 * Body: { license_plate, make, model, year, color, vehicle_type,
 *         latitude?, longitude? }   ← lat/lng come from browser geolocation
 * Note: CNIC and license_number are already stored at registration — no need to re-submit.
 */
const completeProfile = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const {
      license_plate, make, model, year, color, vehicle_type,
      latitude, longitude          // optional initial GPS position
    } = req.body;

    if (!license_plate || !make || !model || !year || !color || !vehicle_type) {
      return res.status(400).json({ success: false, message: 'All vehicle fields are required.' });
    }

    await conn.beginTransaction();

    // Driver row already exists from registration — just look it up
    const [existing] = await conn.query('SELECT driver_id FROM Driver WHERE user_id=?', [req.user.user_id]);

    let driver_id;
    if (existing.length > 0) {
      driver_id = existing[0].driver_id;
      // Mark driver as verified so they appear in ride searches
      await conn.query(
        `UPDATE Driver SET verification_status='verified', availability_status='available' WHERE driver_id=?`,
        [driver_id]
      );
    } else {
      // Fallback: create driver row if somehow missing
      const [result] = await conn.query(
        `INSERT INTO Driver (user_id, verification_status, availability_status) VALUES (?, 'verified', 'available')`,
        [req.user.user_id]
      );
      driver_id = result.insertId;
    }

    // Add vehicle — auto-verified so driver appears in ride searches immediately
    await conn.query(
      `INSERT INTO Vehicles (driver_id, license_plate, make, model, year, color, vehicle_type, verification_status)
       VALUES (?,?,?,?,?,?,?,'verified')`,
      [driver_id, license_plate, make, model, year, color, vehicle_type]
    );

    // ── NEW: record initial GPS position if the driver granted location access ──
    if (latitude != null && longitude != null) {
      await conn.query(
        `INSERT INTO Driver_Location (driver_id, latitude, longitude, timestamp)
         VALUES (?, ?, ?, NOW())`,
        [driver_id, latitude, longitude]
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Profile completed successfully.' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

/**
 * GET /api/driver/location/latest
 * Returns the driver's most recent location row
 */
const getLatestLocation = async (req, res, next) => {
  try {
    const [driverRows] = await db.query('SELECT driver_id FROM Driver WHERE user_id=?', [req.user.user_id]);
    if (!driverRows.length) return res.status(404).json({ success: false, message: 'Driver not found.' });

    const [rows] = await db.query(
      `SELECT latitude, longitude, timestamp
       FROM Driver_Location
       WHERE driver_id = ?
       ORDER BY timestamp DESC
       LIMIT 1`,
      [driverRows[0].driver_id]
    );

    if (!rows.length) {
      return res.json({ success: true, location: null });
    }
    res.json({ success: true, location: rows[0] });
  } catch (err) { next(err); }
};

module.exports = { getProfile, setAvailability, updateLocation, getLatestLocation, getMyRides, uploadPhoto, getVehicles, addVehicle, getEarnings, completeProfile };