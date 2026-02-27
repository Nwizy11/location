# 📍 Location Tracker

Silent IP-based visitor location tracker with real-time admin panel, MongoDB Atlas cloud storage, and CSV export. **No local MongoDB installation needed.**

---

## 🗂 File Structure

```
location-tracker/
├── server.js                  ← Main Express + Socket.IO server
├── package.json               ← Dependencies
├── .env                       ← Your config (never commit this)
├── .env.example               ← Template for .env
├── .gitignore
│
├── models/
│   └── Visitor.js             ← Mongoose schema for visitor data
│
├── routes/
│   └── visitors.js            ← REST API: GET, DELETE visitors + stats
│
├── middleware/
│   └── adminAuth.js           ← Password protection for /admin
│
└── public/
    ├── index.html             ← User-facing page (share this link)
    └── admin.html             ← Admin panel UI
```

---

## 🛠 Prerequisites

Only **Node.js v18+** is required — https://nodejs.org
MongoDB runs in the cloud via **MongoDB Atlas** (free, no install needed).

---

## Step 1 — Get Your Free MongoDB Atlas URL

1. Go to https://cloud.mongodb.com and create a free account
2. Click "Build a Database" → choose M0 Free Tier → pick any region → click Create
3. On the "Security Quickstart" screen:
   - Create a username and password (save these!)
   - Under "Where would you like to connect from?" choose "My Local Environment"
   - Click "Add My Current IP Address" then "Finish and Close"
4. On the Database page, click "Connect" on your cluster
5. Choose "Drivers"
6. Copy the connection string — it looks like:
   mongodb+srv://youruser:yourpassword@cluster0.abc123.mongodb.net/?retryWrites=true&w=majority
7. Replace <password> with your actual password

---

## Step 2 — Run Locally in VSCode

1. Open the project folder in VSCode:
   cd location-tracker
   code .

2. Install dependencies (open terminal with Ctrl + backtick):
   npm install

3. Open the .env file and paste your Atlas URL:

   PORT=3000
   MONGO_URI=mongodb+srv://youruser:yourpassword@cluster0.abc123.mongodb.net/location-tracker?retryWrites=true&w=majority
   ADMIN_PASSWORD=admin123

   IMPORTANT: Add /location-tracker before the ? in your connection string — this sets the database name.

4. Start the server:
   npm run dev

   You should see:
   ✅ MongoDB connected
   🚀 Server running at http://localhost:3000
   📊 Admin panel:  http://localhost:3000/admin?password=admin123

5. Open your pages:
   - Tracker link (share this): http://localhost:3000
   - Admin Panel:               http://localhost:3000/admin?password=admin123

---

## What Gets Captured Per Visitor (Zero Clicks, Zero Prompts)

  IP Address, City, Region, Country, ZIP Code,
  Latitude/Longitude, ISP, Organization, Timezone,
  Browser/Device, Referrer URL, Timestamp

---

## Admin Panel Features

  - Real-time updates via Socket.IO
  - Stats bar: total, last 7 days, top city, top country
  - Top countries / cities / ISPs leaderboard
  - Live search and filter
  - Delete individual visitors or clear all
  - Export everything to CSV

---

## Making it Public (Share with Real Users)

Run this in your terminal to get a public URL:
  npx ngrok http 3000

Atlas tip: If you get a connection error from a public IP, go to:
  Atlas → Network Access → Add IP Address → Allow Access From Anywhere (0.0.0.0/0)
