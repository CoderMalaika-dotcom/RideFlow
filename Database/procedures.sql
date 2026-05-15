USE RideFlow;

DELIMITER $$

-- ─── PROCEDURE 1: Calculate fare (reads rates from FareRules table) ──────────
-- Rubric: "stored procedure auto-calculates fare using distance, duration, surge"
CREATE PROCEDURE sp_calculate_fare(
    IN  p_distance_km    DECIMAL(10,2),
    IN  p_duration_min   INT,
    IN  p_vehicle_type   ENUM('economy','premium','bike'),
    OUT p_fare           DECIMAL(10,2),
    OUT p_surge_applied  BOOLEAN
)
BEGIN
    DECLARE base_rate         DECIMAL(10,2);
    DECLARE per_km_rate       DECIMAL(10,2);
    DECLARE per_min_rate      DECIMAL(10,2);
    DECLARE peak_mult         DECIMAL(4,2);
    DECLARE demand_mult       DECIMAL(4,2);
    DECLARE surge_mult        DECIMAL(4,2) DEFAULT 1.0;
    DECLARE current_hour      INT;
    DECLARE pending_requests  INT;

    -- Read configurable rates from FareRules table
    SELECT base_fare, per_km_rate, per_min_rate, surge_peak_mult, surge_demand_mult
    INTO   base_rate, per_km_rate, per_min_rate, peak_mult, demand_mult
    FROM   FareRules
    WHERE  vehicle_type = p_vehicle_type
    LIMIT 1;

    -- Fallback defaults if no rule found
    IF base_rate IS NULL THEN
        SET base_rate = 50.00; SET per_km_rate = 20.00; SET per_min_rate = 2.00;
        SET peak_mult = 1.50;  SET demand_mult = 1.80;
    END IF;

    SET current_hour = HOUR(NOW());

    -- Peak hours surge (7–9 AM, 5–8 PM)
    IF (current_hour BETWEEN 7 AND 9) OR (current_hour BETWEEN 17 AND 20) THEN
        SET surge_mult = peak_mult;
    END IF;

    -- High demand surge
    SELECT COUNT(*) INTO pending_requests
    FROM Rides WHERE ride_status = 'requested';

    IF pending_requests > 10 THEN
        SET surge_mult = GREATEST(surge_mult, demand_mult);
    END IF;

    SET p_surge_applied = (surge_mult > 1.0);
    SET p_fare = ROUND(
        (base_rate + (per_km_rate * p_distance_km) + (per_min_rate * p_duration_min))
        * surge_mult, 2
    );
END$$

-- ─── PROCEDURE 2: Match nearest available driver ──────────────────────────────
CREATE PROCEDURE sp_find_nearest_driver(
    IN  p_pickup_lat  DECIMAL(10,7),
    IN  p_pickup_lng  DECIMAL(10,7),
    OUT p_driver_id   INT,
    OUT p_distance_km DECIMAL(10,2)
)
BEGIN
    SELECT d.driver_id,
           ROUND(6371 * ACOS(
               COS(RADIANS(p_pickup_lat)) * COS(RADIANS(dl.latitude)) *
               COS(RADIANS(dl.longitude) - RADIANS(p_pickup_lng)) +
               SIN(RADIANS(p_pickup_lat)) * SIN(RADIANS(dl.latitude))
           ), 2) AS dist
    INTO   p_driver_id, p_distance_km
    FROM   Driver d
    JOIN   Driver_Location dl ON d.driver_id = dl.driver_id
    WHERE  d.availability_status = 'available'
      AND  d.verification_status = 'verified'
      AND  dl.timestamp = (
               SELECT MAX(dl2.timestamp)
               FROM Driver_Location dl2
               WHERE dl2.driver_id = d.driver_id
           )
    ORDER BY dist ASC
    LIMIT 1;
END$$

-- ─── PROCEDURE 3: Complete a ride and finalise payment ────────────────────────
CREATE PROCEDURE sp_complete_ride(
    IN p_ride_id        INT,
    IN p_distance_km    DECIMAL(10,2),
    IN p_duration_min   INT,
    IN p_payment_method ENUM('cash','card','wallet'),
    IN p_promo_code     VARCHAR(50)
)
BEGIN
    DECLARE v_vehicle_type ENUM('economy','premium','bike');
    DECLARE v_fare         DECIMAL(10,2);
    DECLARE v_surge        BOOLEAN;
    DECLARE v_promo_id     INT     DEFAULT NULL;
    DECLARE v_discount     DECIMAL(10,2) DEFAULT 0;
    DECLARE v_user_id      INT;
    DECLARE v_driver_id    INT;

    SELECT r.user_id, r.driver_id, v.vehicle_type
    INTO   v_user_id, v_driver_id, v_vehicle_type
    FROM   Rides r
    LEFT JOIN Vehicles v ON r.vehicle_id = v.vehicle_id
    WHERE  r.ride_id = p_ride_id;

    CALL sp_calculate_fare(p_distance_km, p_duration_min,
                           IFNULL(v_vehicle_type, 'economy'), v_fare, v_surge);

    IF p_promo_code IS NOT NULL AND p_promo_code != '' THEN
        SELECT promo_id, discount_amount
        INTO   v_promo_id, v_discount
        FROM   PromoCode
        WHERE  code = p_promo_code AND expiry_date >= CURDATE()
        LIMIT 1;
        SET v_fare = GREATEST(0, v_fare - v_discount);
    END IF;

    UPDATE Rides
    SET ride_status = 'completed', end_time = NOW(), fare = v_fare
    WHERE ride_id = p_ride_id;

    -- Inserting with payment_status 'paid' fires trg_payment_completes_ride
    -- and trg_promo_usage_increment automatically.
    INSERT INTO Payments (ride_id, user_id, amount, payment_method, payment_status, promo_id)
    VALUES (p_ride_id, v_user_id, v_fare, p_payment_method, 'paid', v_promo_id);

    UPDATE Driver
    SET total_trips = total_trips + 1, availability_status = 'available'
    WHERE driver_id = v_driver_id;

    SELECT v_fare AS final_fare, v_surge AS surge_applied, v_discount AS discount_applied;
END$$

-- ─── PROCEDURE 4: Generate revenue report ────────────────────────────────────
CREATE PROCEDURE sp_revenue_report(
    IN p_start_date DATE,
    IN p_end_date   DATE
)
BEGIN
    SELECT
        DATE(p.transaction_date) AS date,
        COUNT(p.payment_id)      AS total_transactions,
        SUM(p.amount)            AS gross_revenue,
        SUM(p.amount * 0.20)     AS platform_commission,
        SUM(p.amount * 0.80)     AS driver_payouts,
        p.payment_method
    FROM Payments p
    WHERE p.payment_status = 'paid'
      AND DATE(p.transaction_date) BETWEEN p_start_date AND p_end_date
    GROUP BY DATE(p.transaction_date), p.payment_method
    ORDER BY date;
END$$

-- ─── PROCEDURE 5: Suspend low-rated drivers (manual batch run) ───────────────
CREATE PROCEDURE sp_flag_low_rated_drivers()
BEGIN
    UPDATE Users u
    JOIN   Driver d ON u.user_id = d.user_id
    SET    u.account_status = 'suspended'
    WHERE  d.average_rating < 3.5
      AND  d.average_rating > 0
      AND  d.total_trips    >= 5
      AND  u.account_status = 'active';

    SELECT ROW_COUNT() AS drivers_flagged;
END$$

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPONENT 1 — Basic SQL Queries (as callable procedures for demonstration)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Basic Query 1: All completed rides for a specific rider ordered by date ──
-- Rubric: "list all completed rides for a specific rider ordered by date"
CREATE PROCEDURE sp_completed_rides_by_rider(IN p_user_id INT)
BEGIN
    SELECT
        r.ride_id,
        r.fare,
        r.request_time,
        r.start_time,
        r.end_time,
        lp.address AS pickup_address,
        ld.address AS dropoff_address,
        u.fname    AS driver_fname,
        u.lname    AS driver_lname
    FROM  Rides r
    LEFT JOIN Location lp ON r.pickup_location_id  = lp.location_id
    LEFT JOIN Location ld ON r.dropoff_location_id = ld.location_id
    LEFT JOIN Driver   d  ON r.driver_id           = d.driver_id
    LEFT JOIN Users    u  ON d.user_id             = u.user_id
    WHERE r.user_id     = p_user_id
      AND r.ride_status = 'completed'
    ORDER BY r.request_time DESC;
END$$

-- ─── Basic Query 2: All drivers in a city ordered by rating ──────────────────
-- Rubric: "list all drivers in a city ordered by rating"
CREATE PROCEDURE sp_drivers_in_city_by_rating(IN p_city VARCHAR(100))
BEGIN
    SELECT
        d.driver_id,
        u.fname,
        u.lname,
        u.email,
        u.phone_number,
        u.city,
        d.average_rating,
        d.total_trips,
        d.availability_status,
        d.verification_status
    FROM  Driver d
    JOIN  Users u ON d.user_id = u.user_id
    WHERE u.city = p_city
      AND d.verification_status = 'verified'
    ORDER BY d.average_rating DESC;
END$$

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPONENT 2 — Aggregate Functions & HAVING Clause
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Aggregate 1: Total revenue per city using SUM() ─────────────────────────
-- Rubric: "SUM() used to calculate total revenue per city"
CREATE PROCEDURE sp_revenue_per_city()
BEGIN
    SELECT
        lp.city                  AS city,
        COUNT(p.payment_id)      AS total_rides,
        SUM(p.amount)            AS total_revenue,
        SUM(p.amount * 0.20)     AS platform_commission,
        SUM(p.amount * 0.80)     AS driver_payouts
    FROM  Payments p
    JOIN  Rides    r  ON p.ride_id            = r.ride_id
    JOIN  Location lp ON r.pickup_location_id = lp.location_id
    WHERE p.payment_status = 'paid'
    GROUP BY lp.city
    ORDER BY total_revenue DESC;
END$$

-- ─── Aggregate 2: Low-rated drivers using AVG() + HAVING ─────────────────────
-- Rubric: "AVG() used to calculate average driver ratings with HAVING AVG(score) < 3.5"
CREATE PROCEDURE sp_low_rated_drivers()
BEGIN
    SELECT
        d.driver_id,
        u.fname,
        u.lname,
        u.city,
        AVG(r.score)    AS avg_rating,
        COUNT(r.rating_id) AS total_ratings
    FROM  Driver  d
    JOIN  Users   u ON d.user_id       = u.user_id
    JOIN  Ratings r ON r.rated_user_id = u.user_id
    GROUP BY d.driver_id, u.fname, u.lname, u.city
    HAVING AVG(r.score) < 3.5
    ORDER BY avg_rating ASC;
END$$

-- ─── Aggregate 3: Number of trips completed per driver using COUNT() ──────────
-- Rubric: "COUNT() used to find number of trips completed per driver"
CREATE PROCEDURE sp_trips_per_driver()
BEGIN
    SELECT
        d.driver_id,
        u.fname,
        u.lname,
        COUNT(r.ride_id)  AS completed_trips,
        COALESCE(SUM(p.amount), 0) AS total_earned
    FROM  Driver  d
    JOIN  Users   u  ON d.user_id    = u.user_id
    LEFT JOIN Rides    r  ON r.driver_id  = d.driver_id AND r.ride_status = 'completed'
    LEFT JOIN Payments p  ON p.ride_id    = r.ride_id   AND p.payment_status = 'paid'
    GROUP BY d.driver_id, u.fname, u.lname
    ORDER BY completed_trips DESC;
END$$

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPONENT 3 — Joins for Reports
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Join 1: INNER JOIN full trip report (Riders × Rides × Drivers × Vehicles)
-- Rubric: "INNER JOIN: full trip report linking Riders, Rides, Drivers, Vehicles"
CREATE PROCEDURE sp_full_trip_report()
BEGIN
    SELECT
        r.ride_id,
        r.ride_status,
        r.fare,
        r.request_time,
        r.start_time,
        r.end_time,
        TIMESTAMPDIFF(MINUTE, r.start_time, r.end_time) AS duration_minutes,
        u.user_id          AS rider_id,
        u.fname            AS rider_fname,
        u.lname            AS rider_lname,
        u.phone_number     AS rider_phone,
        du.fname           AS driver_fname,
        du.lname           AS driver_lname,
        du.phone_number    AS driver_phone,
        v.make             AS vehicle_make,
        v.model            AS vehicle_model,
        v.license_plate,
        v.vehicle_type,
        lp.address         AS pickup_address,
        ld.address         AS dropoff_address
    FROM  Rides    r
    INNER JOIN Users    u   ON r.user_id    = u.user_id
    INNER JOIN Driver   d   ON r.driver_id  = d.driver_id
    INNER JOIN Users    du  ON d.user_id    = du.user_id
    INNER JOIN Vehicles v   ON r.vehicle_id = v.vehicle_id
    LEFT  JOIN Location lp  ON r.pickup_location_id  = lp.location_id
    LEFT  JOIN Location ld  ON r.dropoff_location_id = ld.location_id
    ORDER BY r.request_time DESC;
END$$

-- ─── Join 2: LEFT JOIN — all riders including those with no completed ride ─────
-- Rubric: "LEFT JOIN: all riders shown including those who have never completed a ride"
CREATE PROCEDURE sp_all_riders_with_ride_history()
BEGIN
    SELECT
        u.user_id,
        u.fname,
        u.lname,
        u.email,
        u.phone_number,
        u.city,
        u.registration_date,
        COUNT(r.ride_id)                                              AS total_rides,
        SUM(CASE WHEN r.ride_status = 'completed' THEN 1 ELSE 0 END) AS completed_rides,
        SUM(CASE WHEN r.ride_status = 'completed' THEN r.fare ELSE 0 END) AS total_spent
    FROM  Users u
    LEFT JOIN Rides r ON u.user_id = r.user_id
    WHERE u.role = 'rider'
    GROUP BY u.user_id, u.fname, u.lname, u.email, u.phone_number, u.city, u.registration_date
    ORDER BY completed_rides DESC;
END$$

-- ─── Join 3: JOIN Payments + PromoCodes — discount usage per ride ─────────────
-- Rubric: "JOIN on Payments and PromoCodes: discount usage displayed per ride"
CREATE PROCEDURE sp_promo_usage_report()
BEGIN
    SELECT
        p.payment_id,
        p.ride_id,
        u.fname             AS rider_fname,
        u.lname             AS rider_lname,
        pc.code             AS promo_code,
        pc.discount_amount,
        pc.usage_count,
        p.amount            AS amount_paid,
        p.payment_method,
        p.transaction_date
    FROM  Payments  p
    JOIN  Users     u  ON p.user_id  = u.user_id
    JOIN  PromoCode pc ON p.promo_id = pc.promo_id
    WHERE p.payment_status = 'paid'
    ORDER BY p.transaction_date DESC;
END$$

DELIMITER ;