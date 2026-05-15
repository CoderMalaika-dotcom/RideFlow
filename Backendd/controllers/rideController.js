const db = require('../config/db');

/**
 * GET /api/rides/drivers
 * Returns available, verified drivers in the same city as the pickup address
 * and matching the requested vehicle type.
 * Query params: pickup_lat, pickup_lng, vehicle_type
 * Pure read — no side-effects.
 */
const getAvailableDrivers = async (req, res, next) => {
  try {
    const { pickup_lat, pickup_lng, vehicle_type } = req.query;

    if (!pickup_lat || !pickup_lng) {
      return res.status(400).json({ success: false, message: 'pickup_lat and pickup_lng are required.' });
    }

    const lat = parseFloat(pickup_lat);
    const lng = parseFloat(pickup_lng);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ success: false, message: 'pickup_lat and pickup_lng must be valid numbers.' });
    }

    // Vehicle type filter
    let vehicleFilter = `AND verification_status = 'verified'`;
    const vtLower = vehicle_type ? vehicle_type.toLowerCase() : null;
    if (vtLower && ['bike', 'economy', 'premium'].includes(vtLower)) {
      vehicleFilter += ` AND LOWER(vehicle_type) = '${vtLower}'`;
    }

    // Find drivers whose latest Driver_Location is within RADIUS_KM of the
    // rider's pickup coordinates using the Haversine formula.
    // Driver_Location is the source of truth for driver position — no Location
    // table lookup needed.
    const RADIUS_KM = 50;

    const [drivers] = await db.query(
      `SELECT
         d.driver_id,
         u.fname,
         u.lname,
         u.phone_number,
         d.average_rating,
         d.total_trips,
         v.vehicle_type,
         v.make,
         v.model,
         v.color,
         v.license_plate,
         dl.latitude  AS current_lat,
         dl.longitude AS current_lng,
         ROUND(
           6371 * ACOS(
             COS(RADIANS(?)) * COS(RADIANS(dl.latitude))
             * COS(RADIANS(dl.longitude) - RADIANS(?))
             + SIN(RADIANS(?)) * SIN(RADIANS(dl.latitude))
           ), 2
         ) AS distance_km
       FROM Driver d
       JOIN Users u ON d.user_id = u.user_id
       INNER JOIN Vehicles v
         ON v.vehicle_id = (
           SELECT vehicle_id FROM Vehicles
           WHERE driver_id = d.driver_id
             ${vehicleFilter}
           ORDER BY vehicle_id
           LIMIT 1
         )
       -- Latest GPS ping for this driver from Driver_Location
       INNER JOIN Driver_Location dl
         ON dl.driver_id = d.driver_id
         AND dl.location_id = (
           SELECT dl2.location_id
           FROM Driver_Location dl2
           WHERE dl2.driver_id = d.driver_id
           ORDER BY dl2.timestamp DESC
           LIMIT 1
         )
       WHERE d.availability_status = 'available'
         AND d.verification_status = 'verified'
         AND u.account_status      = 'active'
       HAVING distance_km <= ?
       ORDER BY distance_km ASC, d.average_rating DESC`,
      [lat, lng, lat, RADIUS_KM]
    );

    res.json({ success: true, drivers });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rides/request
 * Rider requests a ride — saves pickup/dropoff locations and creates the ride row.
 * Body: { pickup_address, dropoff_address, driver_id, vehicle_type, scheduled_time? }
 */
const requestRide = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const {
      pickup_address,
      dropoff_address,
      driver_id,
      vehicle_type,
      scheduled_time
    } = req.body;

    if (!pickup_address || !dropoff_address || !driver_id) {
      return res.status(400).json({ success: false, message: 'pickup_address, dropoff_address and driver_id are required.' });
    }

    await conn.beginTransaction();

    // Persist locations
    const [pickupResult] = await conn.query(
      `INSERT INTO Location(latitude, longitude, address) VALUES (0, 0, ?)`,
      [pickup_address]
    );
    const [dropoffResult] = await conn.query(
      `INSERT INTO Location(latitude, longitude, address) VALUES (0, 0, ?)`,
      [dropoff_address]
    );

    // Resolve driver's verified vehicle
    const [vehicleRows] = await conn.query(
      `SELECT vehicle_id FROM Vehicles
       WHERE driver_id = ? AND verification_status = 'verified'
       ${vehicle_type ? 'AND LOWER(vehicle_type) = ?' : ''}
       LIMIT 1`,
      vehicle_type ? [driver_id, vehicle_type.toLowerCase()] : [driver_id]
    );

    if (!vehicleRows.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'Driver has no verified vehicle of that type.' });
    }

    // Fare estimation by type
    const fareMap = { bike: 80, economy: 200, premium: 350 };
    const estimatedFare = fareMap[(vehicle_type || 'economy').toLowerCase()] || 200;

    const [rideResult] = await conn.query(
      `INSERT INTO Rides
         (user_id, driver_id, vehicle_id,
          pickup_location_id, dropoff_location_id,
          ride_status, scheduled_time, fare)
       VALUES (?, ?, ?, ?, ?, 'requested', ?, ?)`,
      [
        req.user.user_id,
        driver_id,
        vehicleRows[0].vehicle_id,
        pickupResult.insertId,
        dropoffResult.insertId,
        scheduled_time || null,
        estimatedFare
      ]
    );

    await conn.query(
      `INSERT INTO Ride_History(ride_id, status) VALUES (?, 'requested')`,
      [rideResult.insertId]
    );

    await conn.commit();

    res.json({
      success: true,
      ride_id: rideResult.insertId,
      fare: estimatedFare,
      pickup_location_id: pickupResult.insertId,
      dropoff_location_id: dropoffResult.insertId
    });

  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

const createRideWithDriver = async (req, res, next) => {
  try {
    const {
      selected_driver_id,
      pickup_location_id,
      dropoff_location_id,
      scheduled_time        // optional ISO string for advance booking
    } = req.body;

    const [vehicleRows] = await db.query(
      `SELECT vehicle_id
       FROM Vehicles
       WHERE driver_id = ?
       AND verification_status = 'verified'
       LIMIT 1`,
      [selected_driver_id]
    );

    const vehicle_id = vehicleRows.length
      ? vehicleRows[0].vehicle_id
      : null;

    const [rideResult] = await db.query(
      `INSERT INTO Rides(
        user_id,
        driver_id,
        vehicle_id,
        pickup_location_id,
        dropoff_location_id,
        ride_status,
        scheduled_time,
        fare
      ) VALUES (?, ?, ?, ?, ?, 'requested', ?, 300)`,
      [
        req.user.user_id,
        selected_driver_id,
        vehicle_id,
        pickup_location_id,
        dropoff_location_id,
        scheduled_time || null
      ]
    );

    await db.query(
      `INSERT INTO Ride_History(ride_id, status)
       VALUES (?, 'requested')`,
      [rideResult.insertId]
    );

    res.json({
      success: true,
      ride_id: rideResult.insertId
    });

  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/rides/:ride_id/status
 * Driver updates ride status (accept, start, complete, cancel)
 * Body: { status }
 */
const updateRideStatus = async (req, res, next) => {
  try {
    const { ride_id } = req.params;
    const { status } = req.body;
    const validStatuses = [
  'accepted',
  'driver_en_route',
  'in_progress',
  'completed',
  'cancelled'
];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    // Verify ride exists and driver owns it (if driver)
    const [rides] = await db.query('SELECT * FROM Rides WHERE ride_id=?', [ride_id]);
    if (!rides.length) return res.status(404).json({ success: false, message: 'Ride not found.' });

    const ride = rides[0];

    if (req.user.role === 'driver') {
      const [driverRows] = await db.query('SELECT driver_id FROM Driver WHERE user_id=?', [req.user.user_id]);
      if (!driverRows.length || ride.driver_id !== driverRows[0].driver_id) {
        return res.status(403).json({ success: false, message: 'Not your ride.' });
      }
    }

    // Build update fields
    const updates = { ride_status: status };
    if (status === 'in_progress') updates.start_time = new Date();
    if (status === 'completed') {
      // Free the driver back to available
      await db.query(
        `UPDATE Driver SET availability_status = 'available' WHERE driver_id = ?`,
        [ride.driver_id]
      );

      updates.end_time = new Date();
      // Update driver stats
      await db.query(
        `UPDATE Driver SET total_trips = total_trips + 1 WHERE driver_id = ?`,
        [ride.driver_id]
      );
      await db.query(
        `UPDATE Vehicles SET total_trips = total_trips + 1 WHERE vehicle_id = ?`,
        [ride.vehicle_id]
      );
    }

    await db.query('UPDATE Rides SET ? WHERE ride_id=?', [updates, ride_id]);

    // Log status change
    await db.query('INSERT INTO Ride_History (ride_id, status) VALUES (?,?)', [ride_id, status]);

    res.json({ success: true, message: `Ride status updated to '${status}'.` });
  } catch (err) { next(err); }
};

/**
 * PUT /api/rides/:ride_id/accept
 * Driver accepts a ride
 */
const acceptRide = async (req, res, next) => {
  try {
    const { ride_id } = req.params;

    const [driverRows] = await db.query(
      `SELECT driver_id
       FROM Driver
       WHERE user_id = ?`,
      [req.user.user_id]
    );

    const driver_id = driverRows[0].driver_id;

    await db.query(
      `UPDATE Rides
       SET ride_status = 'accepted'
       WHERE ride_id = ?
       AND driver_id = ?`,
      [ride_id, driver_id]
    );

    await db.query(
      `UPDATE Driver
       SET availability_status = 'busy'
       WHERE driver_id = ?`,
      [driver_id]
    );

    await db.query(
      `INSERT INTO Ride_History(ride_id, status)
       VALUES (?, 'accepted')`,
      [ride_id]
    );

    res.json({
      success: true,
      message: 'Ride accepted successfully'
    });

  } catch (err) {
    next(err);
  }
};

const rejectRide = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const { ride_id } = req.params;

    // Identify the rejecting driver
    const [driverRows] = await conn.query(
      `SELECT driver_id FROM Driver WHERE user_id = ?`,
      [req.user.user_id]
    );
    if (!driverRows.length) {
      return res.status(403).json({ success: false, message: 'Driver not found.' });
    }
    const driver_id = driverRows[0].driver_id;

    await conn.beginTransaction();

    // Verify the ride belongs to this driver and is still in 'requested' state
    const [rideRows] = await conn.query(
      `SELECT * FROM Rides WHERE ride_id = ? AND driver_id = ? AND ride_status = 'requested'`,
      [ride_id, driver_id]
    );
    if (!rideRows.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Ride not found or already actioned.' });
    }

    // Mark as rejected_by_driver — ride row stays so rider can see it and choose another driver
    await conn.query(
      `UPDATE Rides SET ride_status = 'rejected_by_driver' WHERE ride_id = ?`,
      [ride_id]
    );

    await conn.query(
      `INSERT INTO Ride_History(ride_id, status) VALUES (?, 'rejected_by_driver')`,
      [ride_id]
    );

    await conn.commit();

    res.json({ success: true, message: 'Ride rejected. Rider can select another driver.' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

/**
 * GET /api/rides/:ride_id
 * Get a specific ride's details
 */
const getRideById = async (req, res, next) => {
  try {
    const { ride_id } = req.params;
    const [rows] = await db.query(
      `SELECT r.*,
              lp.address AS pickup_address, lp.latitude AS pickup_lat, lp.longitude AS pickup_lng,
              ld.address AS dropoff_address, ld.latitude AS dropoff_lat, ld.longitude AS dropoff_lng,
              u.fname AS rider_fname, u.lname AS rider_lname,
              du.fname AS driver_fname, du.lname AS driver_lname,
              d.average_rating AS driver_rating,
              v.make, v.model, v.license_plate, v.vehicle_type
       FROM Rides r
       LEFT JOIN Location lp ON r.pickup_location_id = lp.location_id
       LEFT JOIN Location ld ON r.dropoff_location_id = ld.location_id
       LEFT JOIN Users u ON r.user_id = u.user_id
       LEFT JOIN Driver d ON r.driver_id = d.driver_id
       LEFT JOIN Users du ON d.user_id = du.user_id
       LEFT JOIN Vehicles v ON r.vehicle_id = v.vehicle_id
       WHERE r.ride_id = ?`,
      [ride_id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Ride not found.' });

    // Access check
    const ride = rows[0];
    if (req.user.role === 'rider' && ride.user_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    res.json({ success: true, ride });
  } catch (err) { next(err); }
};

/**
 * GET /api/rides/:ride_id/history
 */
const getRideHistory = async (req, res, next) => {
  try {
    const { ride_id } = req.params;
    const [rows] = await db.query(
      'SELECT * FROM Ride_History WHERE ride_id=? ORDER BY timestamp ASC',
      [ride_id]
    );
    res.json({ success: true, history: rows });
  } catch (err) { next(err); }
};

/**
 * GET /api/rides/pending
 * Admin or driver sees pending ride requests
 */
const getPendingRides = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT r.ride_id, r.fare, r.request_time,
              lp.address AS pickup_address, ld.address AS dropoff_address,
              u.fname, u.lname, u.phone_number
       FROM Rides r
       LEFT JOIN Location lp ON r.pickup_location_id = lp.location_id
       LEFT JOIN Location ld ON r.dropoff_location_id = ld.location_id
       JOIN Users u ON r.user_id = u.user_id
       WHERE r.ride_status = 'requested'
       ORDER BY r.request_time ASC`
    );
    res.json({ success: true, rides: rows });
  } catch (err) { next(err); }
};

/**
 * PUT /api/rides/:ride_id/cancel
 * Rider cancels their own ride (only if requested or accepted)
 */
const cancelRide = async (req, res, next) => {
  try {
    const { ride_id } = req.params;
    const [rides] = await db.query('SELECT * FROM Rides WHERE ride_id=? AND user_id=?', [ride_id, req.user.user_id]);
    if (!rides.length) return res.status(404).json({ success: false, message: 'Ride not found.' });
    const ride = rides[0];
    if (!['requested', 'accepted'].includes(ride.ride_status)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel a ride that is already in progress or completed.' });
    }
    await db.query('UPDATE Rides SET ride_status=? WHERE ride_id=?', ['cancelled', ride_id]);
    await db.query('INSERT INTO Ride_History (ride_id, status) VALUES (?,?)', [ride_id, 'cancelled']);
    // Free the driver if one was assigned
    if (ride.driver_id) {
      await db.query(`UPDATE Driver SET availability_status='available' WHERE driver_id=?`, [ride.driver_id]);
    }
    res.json({ success: true, message: 'Ride cancelled.' });
  } catch (err) { next(err); }
};

/**
 * GET /api/rides/active
 * Get rider's currently active ride (requested/accepted/en_route/in_progress)
 */
const getActiveRide = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*,
              lp.address AS pickup_address, ld.address AS dropoff_address,
              du.fname AS driver_fname, du.lname AS driver_lname, du.phone_number AS driver_phone,
              du.user_id AS driver_user_id,
              d.average_rating AS driver_rating,
              v.make, v.model, v.license_plate, v.vehicle_type, v.color
       FROM Rides r
       LEFT JOIN Location lp ON r.pickup_location_id = lp.location_id
       LEFT JOIN Location ld ON r.dropoff_location_id = ld.location_id
       LEFT JOIN Driver d ON r.driver_id = d.driver_id
       LEFT JOIN Users du ON d.user_id = du.user_id
       LEFT JOIN Vehicles v ON r.vehicle_id = v.vehicle_id
       WHERE r.user_id = ?
         AND (
           r.ride_status IN ('requested','accepted','driver_en_route','in_progress','rejected_by_driver')
           OR (
             r.ride_status = 'completed'
             AND NOT EXISTS (
               SELECT 1 FROM Ratings rt
               WHERE rt.ride_id = r.ride_id AND rt.rated_by = r.user_id
             )
           )
         )
       ORDER BY r.request_time DESC LIMIT 1`,
      [req.user.user_id]
    );
    res.json({ success: true, ride: rows[0] || null });
  } catch (err) { next(err); }
};


/**
 * GET /api/rides/driver/active
 * Get the driver's currently active ride (accepted/en_route/in_progress)
 */
const getDriverActiveRide = async (req, res, next) => {
  try {
    const [driverRows] = await db.query(
      'SELECT driver_id FROM Driver WHERE user_id = ?',
      [req.user.user_id]
    );
    if (!driverRows.length) {
      return res.status(404).json({ success: false, message: 'Driver not found.' });
    }
    const driver_id = driverRows[0].driver_id;

    const [rows] = await db.query(
      `SELECT r.*,
              lp.address AS pickup_address,
              ld.address AS dropoff_address,
              u.fname    AS rider_fname,
              u.lname    AS rider_lname,
              u.phone_number AS rider_phone,
              v.make, v.model, v.license_plate, v.vehicle_type, v.color
       FROM Rides r
       LEFT JOIN Location lp  ON r.pickup_location_id  = lp.location_id
       LEFT JOIN Location ld  ON r.dropoff_location_id = ld.location_id
       LEFT JOIN Users u      ON r.user_id = u.user_id
       LEFT JOIN Vehicles v   ON r.vehicle_id = v.vehicle_id
       WHERE r.driver_id = ?
         AND r.ride_status IN ('accepted', 'driver_en_route', 'in_progress')
       ORDER BY r.request_time DESC
       LIMIT 1`,
      [driver_id]
    );

    res.json({ success: true, ride: rows[0] || null });
  } catch (err) { next(err); }
};

module.exports = {
  getAvailableDrivers,
  requestRide,
  acceptRide,
  rejectRide,
  updateRideStatus,
  getRideById,
  getRideHistory,
  getPendingRides,
  cancelRide,
  getActiveRide,
  getDriverActiveRide
};