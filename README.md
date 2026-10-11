# ✈️ FlyPool — Smart Airport Cab Pooling

**Share your flight. Share your ride. Split the fare.**

FlyPool is a full-stack MERN application prototype that helps passengers arriving on the same flight discover other travellers heading toward similar destinations and explore shared airport cab rides.

Instead of booking separate taxis, passengers can find compatible travellers, share a cab, and reduce their individual transportation costs.

**Project Type:** Academic / Portfolio Project
**Status:** Working Prototype
**Tech Stack:** MongoDB, Express.js, React.js, Node.js

---

## 📌 Overview

Airport transportation can be expensive when passengers travelling toward nearby destinations book individual cabs. FlyPool explores a solution by grouping passengers who share a flight and have geographically compatible destinations.

The platform provides a workflow for user authentication, trip details, flight verification, passenger matching, fare estimation, and ride confirmation.

FlyPool is designed as a modular foundation for future intelligent ride-matching and route-optimization capabilities.

## 🎯 Problem Statement

Passengers arriving at the same airport frequently travel toward nearby areas but may not know who else is heading in the same direction.

This can result in:

* Higher individual transportation costs.
* Multiple taxis travelling toward similar destinations.
* Missed opportunities to share airport transfers.

**FlyPool aims to simplify airport cab sharing by connecting compatible passengers through a common digital platform.**

## ✨ Key Features

### 🔐 User Authentication

* User registration and login.
* Backend-connected authentication.
* Password hashing and protected access.

### 🧳 Trip Management

* Enter trip and travel details.
* Select travel date and passenger count.
* Navigate through the airport ride-booking workflow.

### 🛫 Flight Verification

* Flight details and verification workflow.
* Prototype-friendly verification without requiring airline API integration.

### 📍 Destination-Based Ride Matching

* Identify passengers travelling on the same flight and date.
* Find compatible destinations for shared rides.
* Display matching passenger and destination information.

### 🚕 Shared Fare Estimation

* Display estimated total cab fares.
* Calculate estimated cost per passenger.
* Explore alternative cab categories, such as sedans, SUVs, and individual rides, where implemented.

### ✅ Ride Confirmation

* View shared ride details.
* Review passenger and destination information.
* Confirm a proposed ride through the application workflow.

### 🎨 Modern User Interface

* React-based interface.
* Dedicated login and registration experience.
* Airport-to-destination cab animation.
* Navigation between the application's main screens.

## 🔄 Application Workflow

1. **Register / Log in** — Access the FlyPool application.
2. **Enter Trip Details** — Provide the required travel information.
3. **Verify Flight Details** — Complete the prototype's flight-verification workflow.
4. **Find a Shared Ride** — Explore passengers travelling on the same flight toward compatible destinations.
5. **Review Fare Estimates** — Compare estimated shared and alternative cab costs.
6. **Confirm the Ride** — Review the proposed ride details and confirmation status.

## 🛠️ Technology Stack

| Layer             | Technologies                             |
| ----------------- | ---------------------------------------- |
| Frontend          | React.js, JavaScript, CSS / Tailwind CSS |
| Routing           | React Router, if configured              |
| Backend           | Node.js, Express.js                      |
| Database          | MongoDB Atlas                            |
| ODM               | Mongoose                                 |
| Authentication    | JWT and password hashing                 |
| API Communication | REST APIs, fetch or Axios                |
| Animation         | CSS animations or Framer Motion          |
| Version Control   | Git and GitHub                           |

## 🏗️ System Architecture

```text
                 ┌──────────────────────┐
                 │     User / Client    │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │   React Frontend     │
                 │ Authentication       │
                 │ Trips and Ride Flow  │
                 └──────────┬───────────┘
                            │
                         REST APIs
                            │
                            ▼
                 ┌──────────────────────┐
                 │  Express / Node.js   │
                 │ Authentication       │
                 │ Trip and Ride Logic  │
                 │ Matching and Fares   │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │    MongoDB Atlas     │
                 │ Persistent App Data  │
                 └──────────────────────┘
```

The frontend communicates with the backend through REST APIs. The backend handles application logic and interacts with MongoDB through Mongoose.

---

*FlyPool — Making shared airport travel simpler, smarter, and more affordable.*
