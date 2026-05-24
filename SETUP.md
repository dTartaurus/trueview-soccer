# Trueview Soccer — Setup & Deployment Guide

## What You're Building

A Progressive Web App (PWA) that works on **any iPhone or Android** — no app store needed.
Players and the coach install it by visiting the URL and tapping "Add to Home Screen."

---

## Prerequisites

- A computer with [Node.js 18+](https://nodejs.org) installed
- A free [Firebase](https://firebase.google.com) account
- A free [Vercel](https://vercel.com) account
- An [Anthropic API key](https://console.anthropic.com)

---

## Step 1 — Firebase Setup (Real-time Database)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add project"** → name it `trueview-soccer` → disable Google Analytics → **Create**
3. In the left sidebar, click **Firestore Database** → **Create database**
   - Choose **Production mode** → select your nearest region → **Enable**
4. Click the **gear icon** (Project Settings) → scroll to **Your apps** → click the **`</>`** (Web) icon
5. Register app with nickname `trueview-soccer-web` (no Firebase Hosting needed)
6. Copy the `firebaseConfig` object — you'll need these values next

### Firestore Security Rules

In Firestore → **Rules** tab, paste this and click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // Team app — anyone with the URL can read/write
    }
  }
}
```

> **Note:** For a private team, you can restrict this to specific email domains later.

---

## Step 2 — Local Setup

```bash
# In the project folder:
npm install

# Copy the environment template
cp .env.example .env.local

# Edit .env.local with your actual values
```

Open `.env.local` and fill in your Firebase values from Step 1:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=trueview-soccer.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=trueview-soccer
VITE_FIREBASE_STORAGE_BUCKET=trueview-soccer.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
ANTHROPIC_API_KEY=sk-ant-...
```

Test locally:

```bash
npm run dev
# Open http://localhost:5173 in your browser
```

---

## Step 3 — Deploy to Vercel (Free Hosting)

1. Push this folder to a GitHub repository (private is fine):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   # Create a new repo on github.com, then:
   git remote add origin https://github.com/YOURUSERNAME/trueview-soccer.git
   git push -u origin main
   ```

2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your GitHub repo

3. In **Environment Variables**, add all variables from your `.env.local` file:
   - All `VITE_FIREBASE_*` variables
   - `ANTHROPIC_API_KEY` ← **Critical: this stays server-side only**

4. Click **Deploy** — Vercel builds and hosts it automatically

5. Your app URL will be something like `https://trueview-soccer.vercel.app`

> **Custom domain (optional):** In Vercel → Domains → add `soccer.yourname.com` — free with most registrars

---

## Step 4 — First-Time App Setup

1. Open your app URL on your phone
2. Go to **More** tab
3. Under "Set up your team," enter:
   - **Team Name** (e.g. "Lightning FC")
   - **Coach PIN** (4 digits — memorize this, it unlocks coach features)
4. Tap **Complete Setup** — you're now in Coach mode

---

## Step 5 — Add Your Roster

1. Go to **Roster** tab (Coach mode required)
2. Tap **Add Player** for each of your 20 players
3. Set their jersey number and preferred positions
4. Positions used: GK, CB, LB, RB, CDM, CM, CAM, LM, RM, LW, RW, ST, CF

---

## Step 6 — Share with Players

### On iPhone (Safari):
1. Player opens the app URL in **Safari** (not Chrome)
2. Tap the **Share** button (box with arrow) at the bottom
3. Scroll down → **"Add to Home Screen"**
4. Tap **Add** — the app icon appears on their home screen

### On Android (Chrome):
1. Player opens the app URL in **Chrome**
2. Tap the **three dots** (⋮) menu
3. Tap **"Add to Home Screen"** or **"Install app"**
4. Tap **Install**

### Sharing the link:
- Post the URL in your team group chat (WhatsApp, GroupMe, etc.)
- Players tap the link → follow the above steps to install

### Player setup (each player):
1. Open the app → go to **More** tab
2. Under "I am a Player," select their name from the dropdown
3. They're ready — they'll see their personal stats, surveys, and game info

---

## Game Day Workflow

### Before the game (coach):
1. Open **Games** → create the game or tap the scheduled one
2. Tap **Setup** — mark attendance (all present players)
3. Optionally tap **Get AI Advice** for lineup recommendations
4. Tap **Start Game** when ready

### During the game (coach):
- **Timer** runs automatically with half-relative time (0:00–45:00 each half)
- **Shift alert** appears 2 minutes before each 15-min shift change
- Tap **Shift** button to set next shift lineup
- Tap **Goal** button → select scorer + assistant
- Tap a player on the field to substitute them
- Tap **HT** at ~45 min for half time → **Start 2nd Half**
- Tap **End** at ~90 min to complete the game

### After the game:
1. Players see a banner on the Home screen: "Reflect on your game!"
2. They tap it → 4 star ratings + 2 text questions → Submit
3. Coach can view all reflections in each player's profile

---

## Practice Workflow

1. **More** → **Practice Log** → **Log Practice**
2. Select the date and duration
3. Check off all present players
4. Add optional focus notes (e.g. "work on pressing")
5. Tap **Save**
6. Expand the practice → tap **Generate** for AI drill recommendations

---

## AI Features Summary

All AI features require an internet connection:

| Feature | Where | What it does |
|---|---|---|
| Lineup advice | Game Setup | Recommends starting 11 + rotation plan |
| Shift management | Live game | Suggests who to put on for next shift |
| Substitution advice | Game Active | Recommends subs based on minutes played |
| Practice planner | Practice Log | Generates full drill session plan |
| Season review | AI Coach tab | Analyzes season trends, gives team advice |
| Formation advisor | AI Coach tab | Recommends formation vs. specific opponent |
| Player tips | Player Profile | Personalized development recommendations |

---

## App Icons (Replace Before Sharing)

The placeholder icons are 1×1 pixels. Before sharing with players, create proper icons:

**Easy method:**
1. Go to [realfavicongenerator.net](https://realfavicongenerator.net)
2. Upload `public/favicon.svg`
3. Download the package
4. Copy:
   - `android-chrome-192x192.png` → `public/icon-192.png`
   - `android-chrome-512x512.png` → `public/icon-512.png`
   - `apple-touch-icon.png` → `public/apple-touch-icon.png`
5. Commit and push — Vercel redeploys automatically

---

## Troubleshooting

**"Could not connect to AI"** — Check that `ANTHROPIC_API_KEY` is set in Vercel environment variables and redeploy.

**Data not syncing** — Check Firebase console → Firestore → verify data is being written. Check browser console for Firebase errors.

**App not installing on iOS** — Must use **Safari** on iPhone. Chrome on iOS cannot install PWAs.

**Coach PIN forgot** — Go to Firebase Console → Firestore → config → settings document → delete the `coachPin` field → open app → set up again.

**Build fails** — Run `npm run build` locally to see TypeScript errors.

---

## Season Data Export

All data lives in Firebase Firestore. To export:
1. Firebase Console → Firestore → click each collection
2. Use the Firebase CLI: `firebase firestore:export gs://your-bucket/backup`

---

## Costs

| Service | Free Tier | Limit |
|---|---|---|
| Vercel | Free | 100GB bandwidth/month |
| Firebase Firestore | Free (Spark) | 1GB storage, 50k reads/day |
| Anthropic API | Pay per use | ~$0.003 per AI request |

For a 20-player team with 16 games, expect **< $5 total** in Anthropic API costs for the season.
