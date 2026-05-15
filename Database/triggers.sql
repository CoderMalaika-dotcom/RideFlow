USE RideFlow;

DELIMITER $$

-- ─── TRIGGER 1: Auto-update ride status to Completed when payment is marked Paid
-- Rubric: "trigger automatically updates ride status to Completed when payment is marked Paid"
CREATE TRIGGER trg_payment_completes_ride
AFTER UPDATE ON Payments
FOR EACH ROW
BEGIN
    IF NEW.payment_status = 'paid' AND OLD.payment_status <> 'paid' THEN
        UPDATE Rides
        SET ride_status = 'completed',
            end_time    = IFNULL(end_time, NOW())
        WHERE ride_id    = NEW.ride_id
          AND ride_status <> 'completed';
    END IF;
END$$

-- ─── TRIGGER 2: Increment promo code usage_count when a promo is applied ────
-- Rubric: "trigger increments promo code usage count when a promo is applied to a ride"
CREATE TRIGGER trg_promo_usage_increment
AFTER INSERT ON Payments
FOR EACH ROW
BEGIN
    IF NEW.promo_id IS NOT NULL THEN
        UPDATE PromoCode
        SET usage_count = usage_count + 1
        WHERE promo_id = NEW.promo_id;
    END IF;
END$$

-- ─── TRIGGER 3: Flag driver account and notify admin when rating drops below 3.5
-- Rubric: "flags driver account and notifies admin when average rating drops below 3.5"
CREATE TRIGGER trg_flag_low_rating_driver
AFTER INSERT ON Ratings
FOR EACH ROW
BEGIN
    DECLARE avg_score        DECIMAL(3,2);
    DECLARE target_driver_id INT;

    SELECT driver_id INTO target_driver_id
    FROM Driver WHERE user_id = NEW.rated_user_id
    LIMIT 1;

    IF target_driver_id IS NOT NULL THEN
        SELECT AVG(score) INTO avg_score
        FROM Ratings
        WHERE rated_user_id = NEW.rated_user_id;

        UPDATE Driver
        SET average_rating = avg_score
        WHERE driver_id = target_driver_id;

        IF avg_score < 3.5 AND avg_score > 0 THEN
            -- Suspend the driver account
            UPDATE Users
            SET account_status = 'suspended'
            WHERE user_id        = NEW.rated_user_id
              AND account_status = 'active';

            -- Notify admin
            INSERT INTO AdminNotifications (type, message, ref_user_id)
            VALUES (
                'low_driver_rating',
                CONCAT('Driver user_id=', NEW.rated_user_id,
                       ' has average rating ', avg_score,
                       ' (below 3.5). Account suspended for review.'),
                NEW.rated_user_id
            );
        END IF;
    END IF;
END$$

-- ─── TRIGGER 4: Flag rider if average rating drops below 3.0 ─────────────────
CREATE TRIGGER trg_flag_low_rating_rider
AFTER INSERT ON Ratings
FOR EACH ROW
BEGIN
    DECLARE avg_score DECIMAL(3,2);
    DECLARE is_driver INT DEFAULT 0;

    SELECT COUNT(*) INTO is_driver FROM Driver WHERE user_id = NEW.rated_user_id;

    IF is_driver = 0 THEN
        SELECT AVG(score) INTO avg_score
        FROM Ratings WHERE rated_user_id = NEW.rated_user_id;

        IF avg_score < 3.0 THEN
            UPDATE Users
            SET account_status = 'suspended'
            WHERE user_id        = NEW.rated_user_id
              AND account_status = 'active';
        END IF;
    END IF;
END$$

-- ─── TRIGGER 5: Log ride status changes into Ride_History ────────────────────
CREATE TRIGGER trg_ride_status_change
AFTER UPDATE ON Rides
FOR EACH ROW
BEGIN
    IF OLD.ride_status <> NEW.ride_status THEN
        INSERT INTO Ride_History (ride_id, status, timestamp)
        VALUES (NEW.ride_id, NEW.ride_status, NOW());
    END IF;
END$$

-- ─── TRIGGER 6: On ride complete/cancel, set driver back to available ─────────
CREATE TRIGGER trg_driver_available_on_complete
AFTER UPDATE ON Rides
FOR EACH ROW
BEGIN
    IF NEW.ride_status IN ('completed', 'cancelled')
       AND OLD.ride_status NOT IN ('completed', 'cancelled') THEN
        IF NEW.driver_id IS NOT NULL THEN
            UPDATE Driver
            SET availability_status = 'available'
            WHERE driver_id = NEW.driver_id;
        END IF;
    END IF;
END$$

-- ─── TRIGGER 7: Prevent double-booking a driver ───────────────────────────────
CREATE TRIGGER trg_prevent_driver_double_booking
BEFORE INSERT ON Rides
FOR EACH ROW
BEGIN
    DECLARE active_rides INT DEFAULT 0;

    IF NEW.driver_id IS NOT NULL THEN
        SELECT COUNT(*) INTO active_rides
        FROM Rides
        WHERE driver_id   = NEW.driver_id
          AND ride_status IN ('accepted', 'driver_en_route', 'in_progress');

        IF active_rides > 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Driver is already on an active ride.';
        END IF;
    END IF;
END$$

-- ─── TRIGGER 8: Update driver location to dropoff point on ride completion ────
CREATE TRIGGER trg_update_driver_location_on_complete
AFTER UPDATE ON Rides
FOR EACH ROW
BEGIN
    DECLARE drop_lat DECIMAL(10,7);
    DECLARE drop_lng DECIMAL(10,7);

    IF NEW.ride_status = 'completed' AND OLD.ride_status <> 'completed'
       AND NEW.driver_id IS NOT NULL THEN

        SELECT l.latitude, l.longitude
        INTO   drop_lat, drop_lng
        FROM   Location l
        WHERE  l.location_id = NEW.dropoff_location_id
        LIMIT 1;

        IF drop_lat IS NOT NULL THEN
            INSERT INTO Driver_Location (driver_id, latitude, longitude, timestamp)
            VALUES (NEW.driver_id, drop_lat, drop_lng, NOW());
        END IF;
    END IF;
END$$

DELIMITER ;