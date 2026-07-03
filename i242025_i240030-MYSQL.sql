Drop database RideFlow;
CREATE DATABASE RideFlow;

USE RideFlow;

-- USERS
CREATE TABLE Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    fname VARCHAR(50) NOT NULL,
    lname VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone_number VARCHAR(15) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('rider','driver','admin') NOT NULL,
    account_status ENUM('active','inactive','suspended') DEFAULT 'active',
    registration_date DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- DRIVER
CREATE TABLE Driver (
    driver_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    CNIC VARCHAR(15) NOT NULL UNIQUE,
    license_number VARCHAR(50) NOT NULL UNIQUE,
    profile_photo VARCHAR(255),
    verification_status ENUM('pending','verified','rejected') DEFAULT 'pending',
    availability_status ENUM('available','busy','offline') DEFAULT 'offline',
    average_rating DECIMAL(3,2) DEFAULT 0 CHECK (average_rating BETWEEN 0 AND 5),
    total_trips INT DEFAULT 0 CHECK (total_trips >= 0),
    
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

-- VEHICLES
CREATE TABLE Vehicles (
    vehicle_id INT AUTO_INCREMENT PRIMARY KEY,
    driver_id INT NOT NULL,
    license_plate VARCHAR(20) NOT NULL UNIQUE,
    make VARCHAR(50),
    model VARCHAR(50),
    year INT CHECK (year >= 2000),
    color VARCHAR(30),
    vehicle_type ENUM('economy','premium','bike') NOT NULL,
    verification_status ENUM('pending','verified','rejected') DEFAULT 'pending',
    total_trips INT DEFAULT 0 CHECK (total_trips >= 0),
    
    FOREIGN KEY (driver_id) REFERENCES Driver(driver_id) ON DELETE CASCADE
);

CREATE TABLE Location (
    location_id INT AUTO_INCREMENT PRIMARY KEY,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    address VARCHAR(255)
);
CREATE TABLE Driver_Location (
    location_id INT AUTO_INCREMENT PRIMARY KEY,
    driver_id INT NOT NULL,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (driver_id) REFERENCES Driver(driver_id) ON DELETE CASCADE
);

-- RIDES
CREATE TABLE Rides (
    ride_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    driver_id INT,
    vehicle_id INT,
    pickup_location_id INT NOT NULL,
    dropoff_location_id INT NOT NULL,
    request_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    scheduled_time DATETIME,
    start_time DATETIME,
    end_time DATETIME,
    ride_status ENUM('requested','accepted','driver_en_route','in_progress','completed','cancelled') DEFAULT 'requested',
    fare DECIMAL(10,2) CHECK (fare >= 0),
    
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    FOREIGN KEY (driver_id) REFERENCES Driver(driver_id),
    FOREIGN KEY (vehicle_id) REFERENCES Vehicles(vehicle_id),
    FOREIGN KEY (pickup_location_id) REFERENCES Location(location_id),
    FOREIGN KEY (dropoff_location_id) REFERENCES Location(location_id)
);

-- RIDE HISTORY
CREATE TABLE Ride_History (
    history_id INT AUTO_INCREMENT PRIMARY KEY,
    ride_id INT NOT NULL,
    status VARCHAR(50) NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (ride_id) REFERENCES Rides(ride_id) ON DELETE CASCADE
);

-- PROMO
CREATE TABLE PromoCode (
    promo_id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_amount DECIMAL(10,2) NOT NULL CHECK (discount_amount > 0),
    expiry_date DATE NOT NULL
);

-- PAYMENTS 
CREATE TABLE Payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    ride_id INT NOT NULL,
    user_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    payment_method ENUM('cash','card','wallet') NOT NULL,
    payment_status ENUM('pending','paid','failed','refunded') DEFAULT 'pending',
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    promo_id INT,
    
    FOREIGN KEY (ride_id) REFERENCES Rides(ride_id),
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    FOREIGN KEY (promo_id) REFERENCES PromoCode(promo_id)
);

-- RATINGS
CREATE TABLE Ratings (
    rating_id INT AUTO_INCREMENT PRIMARY KEY,
    ride_id INT NOT NULL,
    rated_by INT NOT NULL,
    rated_user_id INT NOT NULL,
    score INT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (ride_id) REFERENCES Rides(ride_id),
    FOREIGN KEY (rated_by) REFERENCES Users(user_id),
    FOREIGN KEY (rated_user_id) REFERENCES Users(user_id)
);

-- COMPLAINTS
CREATE TABLE Complaints (
    complaint_id INT AUTO_INCREMENT PRIMARY KEY,
    ride_id INT NOT NULL,
    user_id INT NOT NULL,
    description TEXT NOT NULL,
    status ENUM('open','resolved','closed') DEFAULT 'open',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (ride_id) REFERENCES Rides(ride_id),
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

-- VIEW (Leaderboard)
CREATE VIEW Top_Drivers AS
SELECT d.driver_id, AVG(r.score) AS avg_rating
FROM Driver d
JOIN Ratings r ON d.driver_id = r.rated_user_id
GROUP BY d.driver_id
ORDER BY avg_rating DESC;


