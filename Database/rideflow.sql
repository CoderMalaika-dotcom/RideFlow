DROP DATABASE IF EXISTS RideFlow;
CREATE DATABASE RideFlow;

USE RideFlow;

-- ─── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE Users (
    user_id         INT AUTO_INCREMENT PRIMARY KEY,
    fname           VARCHAR(50)  NOT NULL,
    lname           VARCHAR(50)  NOT NULL,
    email           VARCHAR(100) NOT NULL UNIQUE,
    phone_number    VARCHAR(15)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('rider','driver','admin') NOT NULL,
    account_status  ENUM('active','inactive','suspended') DEFAULT 'active',
    wallet_balance  DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (wallet_balance >= 0),
    city            VARCHAR(100) DEFAULT NULL,
    registration_date DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── DRIVER ──────────────────────────────────────────────────────────────────
CREATE TABLE Driver (
    driver_id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id             INT NOT NULL UNIQUE,
    CNIC                VARCHAR(15)  NOT NULL UNIQUE,
    license_number      VARCHAR(50)  NOT NULL UNIQUE,
    profile_photo       VARCHAR(255),
    verification_status ENUM('pending','verified','rejected') DEFAULT 'pending',
    availability_status ENUM('available','busy','offline') DEFAULT 'offline',
    average_rating      DECIMAL(3,2) DEFAULT 0 CHECK (average_rating BETWEEN 0 AND 5),
    total_trips         INT DEFAULT 0 CHECK (total_trips >= 0),

    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- ─── VEHICLES ────────────────────────────────────────────────────────────────
CREATE TABLE Vehicles (
    vehicle_id          INT AUTO_INCREMENT PRIMARY KEY,
    driver_id           INT NOT NULL,
    license_plate       VARCHAR(20) NOT NULL UNIQUE,
    make                VARCHAR(50),
    model               VARCHAR(50),
    year                INT CHECK (year >= 2000),
    color               VARCHAR(30),
    vehicle_type        ENUM('economy','premium','bike') NOT NULL,
    verification_status ENUM('pending','verified','rejected') DEFAULT 'pending',
    total_trips         INT DEFAULT 0 CHECK (total_trips >= 0),

    FOREIGN KEY (driver_id) REFERENCES Driver(driver_id) ON DELETE CASCADE
);

-- ─── LOCATIONS ───────────────────────────────────────────────────────────────
CREATE TABLE Location (
    location_id INT AUTO_INCREMENT PRIMARY KEY,
    latitude    DECIMAL(10,7) NOT NULL,
    longitude   DECIMAL(10,7) NOT NULL,
    address     VARCHAR(255),
    city        VARCHAR(100) DEFAULT NULL
);

CREATE TABLE Driver_Location (
    location_id INT AUTO_INCREMENT PRIMARY KEY,
    driver_id   INT NOT NULL,
    latitude    DECIMAL(10,7) NOT NULL,
    longitude   DECIMAL(10,7) NOT NULL,
    timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (driver_id) REFERENCES Driver(driver_id) ON DELETE CASCADE
);

-- ─── FARE RULES ──────────────────────────────────────────────────────────────
-- Stores configurable fare parameters per vehicle type.
-- Admin can update these via the Admin Panel instead of hardcoding in procedures.
CREATE TABLE FareRules (
    rule_id         INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_type    ENUM('economy','premium','bike') NOT NULL UNIQUE,
    base_fare       DECIMAL(10,2) NOT NULL DEFAULT 50.00 CHECK (base_fare >= 0),
    per_km_rate     DECIMAL(10,2) NOT NULL DEFAULT 20.00 CHECK (per_km_rate >= 0),
    per_min_rate    DECIMAL(10,2) NOT NULL DEFAULT 2.00  CHECK (per_min_rate >= 0),
    surge_peak_mult DECIMAL(4,2)  NOT NULL DEFAULT 1.50  CHECK (surge_peak_mult >= 1),
    surge_demand_mult DECIMAL(4,2) NOT NULL DEFAULT 1.80 CHECK (surge_demand_mult >= 1),
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed default fare rules
INSERT INTO FareRules (vehicle_type, base_fare, per_km_rate, per_min_rate, surge_peak_mult, surge_demand_mult) VALUES
('economy', 50.00, 20.00, 2.00, 1.50, 1.80),
('premium', 100.00, 40.00, 4.00, 1.50, 1.80),
('bike',    30.00,  12.00, 1.00, 1.50, 1.80);

-- ─── PROMO CODES ─────────────────────────────────────────────────────────────
CREATE TABLE PromoCode (
    promo_id        INT AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(50) NOT NULL UNIQUE,
    discount_amount DECIMAL(10,2) NOT NULL CHECK (discount_amount > 0),
    expiry_date     DATE NOT NULL,
    usage_count     INT NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
    max_uses        INT DEFAULT NULL
);

-- ─── RIDES ───────────────────────────────────────────────────────────────────
CREATE TABLE Rides (
    ride_id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id             INT NOT NULL,
    driver_id           INT,
    vehicle_id          INT,
    pickup_location_id  INT NOT NULL,
    dropoff_location_id INT NOT NULL,
    request_time        DATETIME DEFAULT CURRENT_TIMESTAMP,
    scheduled_time      DATETIME,
    start_time          DATETIME,
    end_time            DATETIME,
    ride_status         ENUM('requested','accepted','driver_en_route','in_progress','completed','cancelled') DEFAULT 'requested',
    fare                DECIMAL(10,2) CHECK (fare >= 0),

    FOREIGN KEY (user_id)             REFERENCES Users(user_id),
    FOREIGN KEY (driver_id)           REFERENCES Driver(driver_id),
    FOREIGN KEY (vehicle_id)          REFERENCES Vehicles(vehicle_id),
    FOREIGN KEY (pickup_location_id)  REFERENCES Location(location_id),
    FOREIGN KEY (dropoff_location_id) REFERENCES Location(location_id)
);

-- ─── RIDE HISTORY ─────────────────────────────────────────────────────────────
CREATE TABLE Ride_History (
    history_id INT AUTO_INCREMENT PRIMARY KEY,
    ride_id    INT NOT NULL,
    status     VARCHAR(50) NOT NULL,
    timestamp  DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (ride_id) REFERENCES Rides(ride_id) ON DELETE CASCADE
);

-- ─── PAYMENTS ────────────────────────────────────────────────────────────────
CREATE TABLE Payments (
    payment_id      INT AUTO_INCREMENT PRIMARY KEY,
    ride_id         INT NOT NULL,
    user_id         INT NOT NULL,
    amount          DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    payment_method  ENUM('cash','card','wallet') NOT NULL,
    payment_status  ENUM('pending','paid','failed','refunded') DEFAULT 'pending',
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    promo_id        INT,

    FOREIGN KEY (ride_id)   REFERENCES Rides(ride_id),
    FOREIGN KEY (user_id)   REFERENCES Users(user_id),
    FOREIGN KEY (promo_id)  REFERENCES PromoCode(promo_id)
);

-- ─── RATINGS ─────────────────────────────────────────────────────────────────
CREATE TABLE Ratings (
    rating_id    INT AUTO_INCREMENT PRIMARY KEY,
    ride_id      INT NOT NULL,
    rated_by     INT NOT NULL,
    rated_user_id INT NOT NULL,
    score        INT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment      TEXT,
    timestamp    DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (ride_id)       REFERENCES Rides(ride_id),
    FOREIGN KEY (rated_by)      REFERENCES Users(user_id),
    FOREIGN KEY (rated_user_id) REFERENCES Users(user_id)
);

-- ─── COMPLAINTS ──────────────────────────────────────────────────────────────
CREATE TABLE Complaints (
    complaint_id INT AUTO_INCREMENT PRIMARY KEY,
    ride_id      INT NOT NULL,
    user_id      INT NOT NULL,
    description  TEXT NOT NULL,
    status       ENUM('open','resolved','closed') DEFAULT 'open',
    timestamp    DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (ride_id) REFERENCES Rides(ride_id),
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

-- ─── ADMIN NOTIFICATIONS ─────────────────────────────────────────────────────
-- Used by triggers to surface alerts in the Admin Panel.
CREATE TABLE AdminNotifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    type            VARCHAR(50)  NOT NULL,
    message         TEXT         NOT NULL,
    ref_user_id     INT,
    is_read         TINYINT(1)   NOT NULL DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (ref_user_id) REFERENCES Users(user_id) ON DELETE SET NULL
);

-- ─── INDEXES (Component 4 requirement) ───────────────────────────────────────
CREATE INDEX idx_rides_rider_id    ON Rides(user_id);
CREATE INDEX idx_rides_driver_id   ON Rides(driver_id);
CREATE INDEX idx_rides_status      ON Rides(ride_status);
CREATE INDEX idx_location_city     ON Location(city);
CREATE INDEX idx_users_city        ON Users(city);
CREATE INDEX idx_payments_ride_id  ON Payments(ride_id);
CREATE INDEX idx_ratings_rated_user ON Ratings(rated_user_id);
CREATE INDEX idx_promo_code        ON PromoCode(code);