USE RideFlow;

-- ─── VIEW 1: ActiveRidesView ──────────────────────────────────────────────────
-- Shows all ongoing trips with full rider and driver details.
-- Rubric name: ActiveRidesView
CREATE OR REPLACE VIEW ActiveRidesView AS
SELECT
    r.ride_id,
    r.ride_status,
    r.request_time,
    lp.address        AS pickup_address,
    lp.city           AS pickup_city,
    ld.address        AS dropoff_address,
    ld.city           AS dropoff_city,
    u.user_id         AS rider_id,
    u.fname           AS rider_fname,
    u.lname           AS rider_lname,
    u.phone_number    AS rider_phone,
    du.fname          AS driver_fname,
    du.lname          AS driver_lname,
    du.phone_number   AS driver_phone,
    v.make            AS vehicle_make,
    v.model           AS vehicle_model,
    v.license_plate,
    v.vehicle_type
FROM Rides r
LEFT JOIN Location  lp  ON r.pickup_location_id  = lp.location_id
LEFT JOIN Location  ld  ON r.dropoff_location_id = ld.location_id
LEFT JOIN Users     u   ON r.user_id             = u.user_id
LEFT JOIN Driver    d   ON r.driver_id           = d.driver_id
LEFT JOIN Users     du  ON d.user_id             = du.user_id
LEFT JOIN Vehicles  v   ON r.vehicle_id          = v.vehicle_id
WHERE r.ride_status IN ('requested', 'accepted', 'driver_en_route', 'in_progress');

-- ─── VIEW 2: TopDriversView ───────────────────────────────────────────────────
-- Shows only drivers whose average rating is above 4.5.
-- Rubric name: TopDriversView
CREATE OR REPLACE VIEW TopDriversView AS
SELECT
    d.driver_id,
    u.fname,
    u.lname,
    u.email,
    u.city,
    d.average_rating,
    d.total_trips,
    d.availability_status,
    d.verification_status
FROM Driver d
JOIN Users u ON d.user_id = u.user_id
WHERE d.verification_status = 'verified'
  AND d.average_rating > 4.5
ORDER BY d.average_rating DESC, d.total_trips DESC;

-- ─── VIEW 3: Ride_Summary ─────────────────────────────────────────────────────
-- Full trip detail used by the INNER JOIN trip report.
CREATE OR REPLACE VIEW Ride_Summary AS
SELECT
    r.ride_id,
    r.ride_status,
    r.fare,
    r.request_time,
    r.start_time,
    r.end_time,
    TIMESTAMPDIFF(MINUTE, r.start_time, r.end_time) AS duration_minutes,
    lp.address        AS pickup_address,
    lp.city           AS pickup_city,
    ld.address        AS dropoff_address,
    ld.city           AS dropoff_city,
    u.user_id         AS rider_id,
    u.fname           AS rider_fname,
    u.lname           AS rider_lname,
    u.phone_number    AS rider_phone,
    du.fname          AS driver_fname,
    du.lname          AS driver_lname,
    v.make            AS vehicle_make,
    v.model           AS vehicle_model,
    v.license_plate,
    v.vehicle_type
FROM Rides r
LEFT JOIN Location lp  ON r.pickup_location_id  = lp.location_id
LEFT JOIN Location ld  ON r.dropoff_location_id = ld.location_id
LEFT JOIN Users    u   ON r.user_id             = u.user_id
LEFT JOIN Driver   d   ON r.driver_id           = d.driver_id
LEFT JOIN Users    du  ON d.user_id             = du.user_id
LEFT JOIN Vehicles v   ON r.vehicle_id          = v.vehicle_id;

-- ─── VIEW 4: Platform_Revenue ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW Platform_Revenue AS
SELECT
    DATE(p.transaction_date) AS date,
    COUNT(p.payment_id)      AS total_transactions,
    SUM(p.amount)            AS gross_revenue,
    SUM(p.amount * 0.20)     AS platform_commission,
    SUM(p.amount * 0.80)     AS driver_payouts,
    p.payment_method
FROM Payments p
WHERE p.payment_status = 'paid'
GROUP BY DATE(p.transaction_date), p.payment_method;

-- ─── VIEW 5: Revenue_By_City ──────────────────────────────────────────────────
-- SUM() of total revenue grouped by city (Component 2 requirement).
CREATE OR REPLACE VIEW Revenue_By_City AS
SELECT
    lp.city                  AS city,
    COUNT(p.payment_id)      AS total_rides,
    SUM(p.amount)            AS total_revenue,
    SUM(p.amount * 0.20)     AS platform_commission,
    SUM(p.amount * 0.80)     AS driver_payouts
FROM Payments p
JOIN Rides    r  ON p.ride_id         = r.ride_id
JOIN Location lp ON r.pickup_location_id = lp.location_id
WHERE p.payment_status = 'paid'
GROUP BY lp.city
ORDER BY total_revenue DESC;

-- ─── VIEW 6: Driver_Performance ──────────────────────────────────────────────
CREATE OR REPLACE VIEW Driver_Performance AS
SELECT
    d.driver_id,
    u.fname,
    u.lname,
    u.city,
    d.average_rating,
    d.total_trips,
    d.verification_status,
    d.availability_status,
    COUNT(c.complaint_id)    AS total_complaints,
    SUM(pay.amount * 0.80)   AS total_earnings
FROM Driver d
JOIN Users     u   ON d.user_id    = u.user_id
LEFT JOIN Rides      r   ON d.driver_id = r.driver_id AND r.ride_status = 'completed'
LEFT JOIN Payments   pay ON r.ride_id   = pay.ride_id AND pay.payment_status = 'paid'
LEFT JOIN Complaints c   ON r.ride_id   = c.ride_id
GROUP BY d.driver_id, u.fname, u.lname, u.city, d.average_rating,
         d.total_trips, d.verification_status, d.availability_status;

-- ─── VIEW 7: Flagged_Accounts ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW Flagged_Accounts AS
SELECT
    u.user_id,
    u.fname,
    u.lname,
    u.email,
    u.role,
    u.account_status,
    CASE
        WHEN d.driver_id IS NOT NULL THEN d.average_rating
        ELSE (SELECT AVG(score) FROM Ratings WHERE rated_user_id = u.user_id)
    END AS avg_rating
FROM Users u
LEFT JOIN Driver d ON u.user_id = d.user_id
WHERE u.account_status = 'suspended';