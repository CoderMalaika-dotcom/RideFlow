const db = require('../config/db');

/**
 * POST /api/complaints
 * Body: { ride_id, description }
 */
const submitComplaint = async (req, res, next) => {
  try {
    const { ride_id, description } = req.body;
    if (!ride_id || !description) {
      return res.status(400).json({ success: false, message: 'ride_id and description are required.' });
    }

    await db.query(
      'INSERT INTO Complaints (ride_id, user_id, description) VALUES (?,?,?)',
      [ride_id, req.user.user_id, description]
    );
    res.status(201).json({ success: true, message: 'Complaint submitted successfully.' });
  } catch (err) { next(err); }
};

/**
 * GET /api/complaints/my
 * Rider's own complaints
 */
const getMyComplaints = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, lp.address AS pickup_address
       FROM Complaints c
       JOIN Rides r ON c.ride_id = r.ride_id
       LEFT JOIN Location lp ON r.pickup_location_id = lp.location_id
       WHERE c.user_id=?
       ORDER BY c.timestamp DESC`,
      [req.user.user_id]
    );
    res.json({ success: true, complaints: rows });
  } catch (err) { next(err); }
};

/**
 * GET /api/complaints  [admin only]
 */
const getAllComplaints = async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = `SELECT c.*, u.fname, u.lname, u.email FROM Complaints c JOIN Users u ON c.user_id = u.user_id`;
    const params = [];
    if (status) { query += ' WHERE c.status=?'; params.push(status); }
    query += ' ORDER BY c.timestamp DESC';

    const [rows] = await db.query(query, params);
    res.json({ success: true, complaints: rows });
  } catch (err) { next(err); }
};

/**
 * PUT /api/complaints/:complaint_id  [admin only]
 * Body: { status: 'resolved' | 'closed' }
 */
const updateComplaintStatus = async (req, res, next) => {
  try {
    const { complaint_id } = req.params;
    const { status } = req.body;
    if (!['resolved', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    await db.query('UPDATE Complaints SET status=? WHERE complaint_id=?', [status, complaint_id]);
    res.json({ success: true, message: `Complaint marked as ${status}.` });
  } catch (err) { next(err); }
};

module.exports = { submitComplaint, getMyComplaints, getAllComplaints, updateComplaintStatus };
