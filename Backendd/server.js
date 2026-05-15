require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const db = require('./config/db');

// Route files
const authRoutes      = require('./routes/authRoutes');
const riderRoutes     = require('./routes/riderRoutes');
const driverRoutes    = require('./routes/driverRoutes');
const rideRoutes      = require('./routes/rideRoutes');
const adminRoutes     = require('./routes/adminRoutes');
const paymentRoutes   = require('./routes/paymentRoutes');
const ratingRoutes    = require('./routes/ratingRoutes');
const complaintRoutes = require('./routes/complaintRoutes');

const app = express();

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── SERVE FRONTEND STATIC FILES ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'Frontend')));

// ─── TEST ROUTE ───────────────────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({ success: true, message: 'RideFlow Backend Running' });
});

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);      // handles /api/auth/register and /api/auth/login
app.use('/api/rider',      riderRoutes);
app.use('/api/driver',     driverRoutes);
app.use('/api/rides',      rideRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/payments',   paymentRoutes);
app.use('/api/ratings',    ratingRoutes);
app.use('/api/complaints', complaintRoutes);

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`RideFlow server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});