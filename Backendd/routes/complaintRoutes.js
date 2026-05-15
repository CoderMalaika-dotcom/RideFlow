const express = require('express');
const router = express.Router();
const { submitComplaint, getMyComplaints, getAllComplaints, updateComplaintStatus } = require('../controllers/complaintController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authMiddleware);

router.post('/', roleMiddleware('rider', 'driver'), submitComplaint);
router.get('/my', roleMiddleware('rider', 'driver'), getMyComplaints);
router.get('/', roleMiddleware('admin'), getAllComplaints);
router.put('/:complaint_id', roleMiddleware('admin'), updateComplaintStatus);

module.exports = router;
