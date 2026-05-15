# 🚗 RiderFlow — Ride-Hailing Platform

> A full-stack ride-hailing web application built with Node.js, Express, and MySQL, featuring separate portals for Riders, Drivers, and Admins.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Features](#features)
- [Database Design](#database-design)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)

---

## Overview

RiderFlow is a ride-hailing backend platform modelled after services like Uber and Careem, built for the Pakistani market. It supports three distinct user roles — **Rider**, **Driver**, and **Admin** — each with a dedicated frontend dashboard and a comprehensive REST API backend.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MySQL (via mysql2) |
| Auth | JWT + bcryptjs |
| File Uploads | Multer |
| Geocoding | Nominatim (OpenStreetMap) |
| Dev Tools | Nodemon, dotenv |

---

## Project Structure

```
RiderFlow/
├── Backendd/
│   ├── server.js               # Entry point
│   ├── app.js                  # Express app config
│   ├── config/
│   │   └── db.js               # MySQL connection pool
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── rideController.js
│   │   ├── driverController.js
│   │   ├── riderController.js
│   │   ├── paymentController.js
│   │   ├── ratingController.js
│   │   ├── complaintController.js
│   │   └── adminController.js
│   ├── routes/                 # Route definitions per module
│   └── middleware/
│       ├── authMiddleware.js   # JWT verification
│       ├── roleMiddleware.js   # Role-based access control
│       └── errorMiddleware.js
├── Database/
│   ├── rideflow.sql            # Schema + seed data
│   ├── procedures.sql          # Stored procedures
│   ├── triggers.sql            # Database triggers
│   ├── views.sql               # SQL views
│   └── sample-data.sql
└── Frontend/
    ├── login.html
    ├── rider-dashboard.html
    ├── driver-dashboard.html
    ├── driver-profile.html
    └── admin-dashboard.html
```

---

## Features

### 🔐 Authentication & Authorization
- User registration for **Riders** and **Drivers** with hashed passwords (bcrypt, salt rounds = 12)
- JWT-based login with role-encoded tokens
- Role-based middleware protecting all sensitive routes (`rider`, `driver`, `admin`)
- Driver-specific registration requires CNIC and license number

### 👤 Rider Portal
- View and update profile (city, contact info)
- In-app **wallet** management (top-up, balance tracking)
- Browse nearby available drivers filtered by vehicle type (`economy`, `premium`, `bike`)
- Book, track, and cancel rides
- Apply **promo codes** at checkout for discounts
- View full ride history
- Submit post-ride **ratings and reviews**
- File **complaints** for specific rides

### 🚗 Driver Portal
- Complete driver profile setup with CNIC, license, and profile photo upload (Multer)
- Vehicle registration (make, model, year, color, license plate, type)
- Toggle availability status (`available` / `offline` / `busy`)
- Live GPS location updates pushed to the `Driver_Location` table
- Accept or decline incoming ride requests
- Start / complete rides and update ride status
- View personal earnings and trip history

### 💳 Payment System
- Dynamic **fare calculation** based on vehicle type, distance (Haversine formula), and duration
- **Surge pricing** engine: 1.5× multiplier during peak hours (7–9 AM, 5–8 PM); up to 1.8× under high demand (>10 active requests)
- Geocoding via **Nominatim** to resolve Pakistani addresses to lat/lng for distance calculation
- Platform commission: **20%** deducted from fare; remaining 80% goes to driver earnings
- Payment methods: `wallet` and `cash`
- Wallet balance validation before confirming wallet-paid rides
- Refund processing for cancelled rides
- Full payment ledger per ride stored in `Payments` table

### 🛡️ Admin Dashboard
- Full **user management**: list, filter by role/status, activate/suspend accounts
- **Driver verification**: approve or reject drivers and their vehicles
- Flag drivers with low ratings
- **Promo code management**: create, list, and delete promo codes
- **Analytics & Reporting**:
  - Platform summary (total users, rides, revenue)
  - Revenue reports (daily/weekly breakdowns, by city)
  - Ride reports with full trip details (multi-table JOIN)
  - Driver earnings breakdown
  - Payment method distribution
  - Refund report
  - All-riders report (including zero-ride riders via LEFT JOIN)
  - Promo code usage report
  - Low-rated drivers report (`AVG(score) < 3.5`)
- **Configurable fare rules** per vehicle type (update base fare, per-km rate, surge multipliers without redeploying)
- **Admin notifications** system with mark-as-read support

### ⭐ Ratings
- Post-ride ratings (1–5 stars) with optional comments
- Duplicate rating prevention per ride per user
- Driver's `average_rating` auto-updated after each new rating

### 📢 Complaints
- Riders can submit complaints tied to specific rides
- Admin can view all complaints (filterable by status) and resolve or close them

---

## Database Design

The MySQL schema includes 12+ tables with referential integrity via foreign keys:

| Table | Purpose |
|---|---|
| `Users` | All users (riders, drivers, admins) |
| `Driver` | Driver profile, CNIC, license, verification |
| `Vehicles` | Vehicle records linked to drivers |
| `Location` | Pickup/dropoff address snapshots |
| `Driver_Location` | Real-time GPS pings (timestamped) |
| `Rides` | Ride lifecycle and status |
| `Payments` | Fare, commission, payment method |
| `Ratings` | Post-ride scores and comments |
| `Complaints` | Ride-linked user complaints |
| `PromoCode` | Discount codes with expiry and usage limits |
| `FareRules` | Configurable pricing parameters per vehicle type |
| `Notifications` | Admin notification log |

The schema also includes **stored procedures**, **triggers**, and **SQL views** for analytics-heavy admin queries.

---

## API Reference

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register rider or driver |
| POST | `/api/auth/login` | Public | Login and receive JWT |
| GET | `/api/rides/drivers` | Rider | Get nearby available drivers |
| POST | `/api/rides/book` | Rider | Book a ride |
| PUT | `/api/rides/:id/cancel` | Rider/Driver | Cancel a ride |
| PUT | `/api/rides/:id/status` | Driver | Update ride status |
| POST | `/api/payments/calculate-fare` | Rider | Get fare estimate |
| POST | `/api/payments/process` | Rider | Process payment |
| POST | `/api/ratings` | Rider/Driver | Submit a rating |
| POST | `/api/complaints` | Rider | File a complaint |
| GET | `/api/admin/analytics/summary` | Admin | Platform overview |
| GET | `/api/admin/reports/trip-report` | Admin | Full trip details report |
| PUT | `/api/admin/fare-rules/:type` | Admin | Update fare config |

---

## Getting Started

**1. Clone the repo and install dependencies:**
```bash
git clone <repo-url>
cd RiderFlow
npm install
```

**2. Set up the database:**
```bash
mysql -u root -p < Database/rideflow.sql
mysql -u root -p RideFlow < Database/procedures.sql
mysql -u root -p RideFlow < Database/triggers.sql
mysql -u root -p RideFlow < Database/views.sql
mysql -u root -p RideFlow < Database/sample-data.sql
```

**3. Configure environment variables** (see below).

**4. Start the server:**
```bash
npm run dev      # development (nodemon)
npm start        # production
```

The server runs on `http://localhost:5000` by default.

---

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=RideFlow
JWT_SECRET=your_jwt_secret
NODE_ENV=development
```

---

## License

This project was developed as an academic project. All rights reserved.
