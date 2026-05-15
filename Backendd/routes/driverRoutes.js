const express = require('express');
const router = express.Router();
const {
  getProfile, setAvailability, updateLocation, getLatestLocation,
  getMyRides, uploadPhoto, getVehicles, addVehicle, getEarnings,
  completeProfile
} = require('../controllers/driverController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authMiddleware, roleMiddleware('driver'));

router.get('/profile', getProfile);
router.put('/availability', setAvailability);
router.post('/location', updateLocation);
router.get('/location/latest', getLatestLocation);
router.get('/rides', getMyRides);
router.post('/photo', uploadPhoto);
router.get('/vehicles', getVehicles);
router.post('/vehicles', addVehicle);
router.get('/earnings', getEarnings);

router.post('/complete-profile', completeProfile);

module.exports = router;