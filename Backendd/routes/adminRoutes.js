const express = require('express');
const router  = express.Router();
const {
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
} = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authMiddleware, roleMiddleware('admin'));

// ─── Users ────────────────────────────────────────────────────────────────────
router.get('/users',                  getAllUsers);
router.put('/users/:user_id/status',  updateUserStatus);

// ─── Driver / Vehicle Verification ───────────────────────────────────────────
router.get('/drivers/pending',               getPendingDrivers);
router.put('/drivers/:driver_id/verify',     verifyDriver);
router.put('/vehicles/:vehicle_id/verify',   verifyVehicle);
router.get('/drivers/flagged',               getFlaggedDrivers);

// ─── Promo Codes ──────────────────────────────────────────────────────────────
router.get('/promos',             getAllPromos);
router.post('/promos',            createPromo);
router.delete('/promos/:promo_id',deletePromo);

// ─── Rides ────────────────────────────────────────────────────────────────────
router.get('/rides', getAllRides);

// ─── Analytics / Financial Reports ───────────────────────────────────────────
router.get('/analytics/summary',           getSummary);
router.get('/analytics/revenue',           getRevenueReport);
router.get('/analytics/revenue-procedure', getRevenueByProcedure);
router.get('/analytics/rides',             getRidesReport);
router.get('/analytics/driver-earnings',   getDriverEarningsReport);
router.get('/analytics/payment-methods',   getPaymentMethodBreakdown);
router.get('/analytics/refunds',           getRefundReport);

// ─── NEW: Component 3 — Join Reports ─────────────────────────────────────────
router.get('/reports/trip-report',    getFullTripReport);     // INNER JOIN: Riders × Rides × Drivers × Vehicles
router.get('/reports/all-riders',     getAllRidersReport);    // LEFT JOIN: all riders incl. zero-ride riders
router.get('/reports/promo-usage',    getPromoUsageReport);  // JOIN: Payments + PromoCode discount per ride

// ─── NEW: Component 2 — Aggregate Reports ────────────────────────────────────
router.get('/reports/low-rated-drivers', getLowRatedDrivers); // AVG + HAVING AVG(score) < 3.5
router.get('/reports/revenue-by-city',   getRevenueByCity);   // SUM per city

// ─── NEW: Component 4 — Fare Rules ───────────────────────────────────────────
router.get('/fare-rules',                    getFareRules);
router.put('/fare-rules/:vehicle_type',      updateFareRule);

// ─── NEW: Admin Notifications ─────────────────────────────────────────────────
router.get('/notifications',              getNotifications);
router.put('/notifications/:id/read',     markNotificationRead);

module.exports = router;