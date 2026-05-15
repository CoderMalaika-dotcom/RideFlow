const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const {
  getAvailableDrivers,
  requestRide,
  updateRideStatus,
  acceptRide,
  rejectRide,
  getRideById,
  getRideHistory,
  getPendingRides,
  cancelRide,
  getActiveRide,
  getDriverActiveRide,
} = require('../controllers/rideController');

router.use(authMiddleware);

// Rider: fetch available drivers for a pickup location + vehicle type (read-only)
router.get(
  '/drivers',
  roleMiddleware('rider'),
  getAvailableDrivers
);

// Rider: request a ride (creates ride row after driver is selected)
router.post(
  '/request',
  roleMiddleware('rider'),
  requestRide
);

// Rider: get active ride (includes rejected_by_driver so frontend can react)
router.get(
  '/active',
  roleMiddleware('rider'),
  getActiveRide
);

// Rider: cancel ride
router.put(
  '/:ride_id/cancel',
  roleMiddleware('rider'),
  cancelRide
);

// Driver/Admin: pending rides
router.get(
  '/pending',
  roleMiddleware('driver', 'admin'),
  getPendingRides
);

// Driver: get currently active ride (accepted / driver_en_route / in_progress)
// MUST be declared BEFORE /:ride_id so Express does not treat "driver" as a ride_id
router.get(
  '/driver/active',
  roleMiddleware('driver'),
  getDriverActiveRide
);

// Driver: accept ride
router.put(
  '/:ride_id/accept',
  roleMiddleware('driver'),
  acceptRide
);

// Driver: reject ride (does NOT cancel — rider can re-pick another driver)
router.put(
  '/:ride_id/reject',
  roleMiddleware('driver'),
  rejectRide
);

// Driver/Admin: update ride status
router.put(
  '/:ride_id/status',
  roleMiddleware('driver', 'admin'),
  updateRideStatus
);

// Ride details
router.get('/:ride_id', getRideById);

// Ride history
router.get('/:ride_id/history', getRideHistory);

module.exports = router;