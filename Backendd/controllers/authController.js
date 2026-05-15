const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * POST /api/auth/register
 * Registers a new user (rider or driver).
 */
const register = async (req, res, next) => {
  try {
    const { fname, lname, email, phone_number, password, role } = req.body;

    if (!fname || !lname || !email || !phone_number || !password || !role) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const allowedRoles = ['rider', 'driver'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be rider or driver.' });
    }

    // Check duplicate
    const [existing] = await db.query(
      'SELECT user_id FROM Users WHERE email = ? OR phone_number = ?',
      [email, phone_number]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email or phone already registered.' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const [result] = await db.query(
      `INSERT INTO Users (fname, lname, email, phone_number, password_hash, role)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fname, lname, email, phone_number, password_hash, role]
    );

    const user_id = result.insertId;

    // If driver, create driver profile stub
    if (role === 'driver') {
      const { CNIC, license_number } = req.body;
      if (!CNIC || !license_number) {
        return res.status(400).json({ success: false, message: 'Drivers must provide CNIC and license number.' });
      }
      await db.query(
        'INSERT INTO Driver (user_id, CNIC, license_number) VALUES (?, ?, ?)',
        [user_id, CNIC, license_number]
      );
    }

    // Issue a token immediately so drivers can proceed to profile completion
    // without having to log in again
    const token = jwt.sign(
      { user_id, role, email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      token,
      user: { user_id, fname, lname, email, role, profile_complete: role !== 'driver' }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required.' });
    }

    const [rows] = await db.query(
      'SELECT user_id, fname, lname, email, password_hash, role, account_status FROM Users WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const user = rows[0];

    if (user.account_status !== 'active') {
      return res.status(403).json({ success: false, message: `Account is ${user.account_status}.` });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

// Profile is complete only when the driver has at least one registered vehicle
let profile_complete = true;
if (user.role === 'driver') {
  const [driverRows] = await db.query(
    `SELECT d.driver_id FROM Driver d WHERE d.user_id = ?`,
    [user.user_id]
  );
  if (!driverRows.length) {
    profile_complete = false;
  } else {
    const [vehicleRows] = await db.query(
      `SELECT vehicle_id FROM Vehicles WHERE driver_id = ? LIMIT 1`,
      [driverRows[0].driver_id]
    );
    if (!vehicleRows.length) profile_complete = false;
  }
}

res.json({
  success: true,
  message: 'Login successful.',
  token,
  user: {
    user_id: user.user_id,
    fname: user.fname,
    lname: user.lname,
    email: user.email,
    role: user.role,
    profile_complete,
  },
});
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT user_id, fname, lname, email, phone_number, role, account_status, registration_date FROM Users WHERE user_id = ?',
      [req.user.user_id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getMe };