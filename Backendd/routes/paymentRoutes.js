const express = require('express');
const router  = express.Router();

const {
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
} = require('../controllers/paymentController');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// ─── RIDER ROUTES ─────────────────────────────────────────────────────────────
// All rider-specific routes (payment methods, history, fare calc, promo)
router.use('/calculate-fare', authMiddleware, roleMiddleware('rider'));
router.post('/calculate-fare', calculateFare);

router.use('/validate-promo', authMiddleware, roleMiddleware('rider'));
router.post('/validate-promo', validatePromo);

router.use('/history', authMiddleware, roleMiddleware('rider'));
router.get('/history', getPaymentHistory);

router.use('/ride/:ride_id', authMiddleware, roleMiddleware('rider'));
router.get('/ride/:ride_id', getPaymentByRide);

router.post('/', authMiddleware, roleMiddleware('rider'), processPayment);

// ─── DRIVER ROUTES ────────────────────────────────────────────────────────────
router.get('/driver/earnings',       authMiddleware, roleMiddleware('driver'), getDriverEarnings);
router.post('/driver/payout-request',authMiddleware, roleMiddleware('driver'), requestPayout);
router.get('/driver/payout-history', authMiddleware, roleMiddleware('driver'), getPayoutHistory);

// ─── ADMIN / FINANCIAL REPORT ROUTES ─────────────────────────────────────────
router.get('/reports/revenue',          authMiddleware, roleMiddleware('admin'), getRevenueReport);
router.get('/reports/driver-earnings',  authMiddleware, roleMiddleware('admin'), getDriverEarningsReport);
router.get('/reports/payment-methods',  authMiddleware, roleMiddleware('admin'), getPaymentMethodBreakdown);
router.get('/reports/refunds',          authMiddleware, roleMiddleware('admin'), getRefundReport);
router.post('/:payment_id/refund',      authMiddleware, roleMiddleware('admin'), processRefund);

module.exports = router;