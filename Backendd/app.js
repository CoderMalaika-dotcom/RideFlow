const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes      = require('./routes/authRoutes');
const riderRoutes     = require('./routes/riderRoutes');
const driverRoutes    = require('./routes/driverRoutes');
const adminRoutes     = require('./routes/adminRoutes');
const rideRoutes      = require('./routes/rideRoutes');
const paymentRoutes   = require('./routes/paymentRoutes');
const ratingRoutes    = require('./routes/ratingRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const errorMiddleware = require('./middleware/errorMiddleware');

const app = express();

// ─── Middlewares ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded driver photos statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/rider',      riderRoutes);
app.use('/api/driver',     driverRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/rides',      rideRoutes);
app.use('/api/payments',   paymentRoutes);
app.use('/api/ratings',    ratingRoutes);
app.use('/api/complaints', complaintRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'RideFlow API is running 🚗', timestamp: new Date() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found.` });
});

// Error handler
app.use(errorMiddleware);

module.exports = app;