# Cardinal

**The direction you swipe is the answer.**

Cardinal is a mobile revision app where the swipe *is* the answer, not a way to move
between cards. A question appears with its possible answers sitting at the compass
points around it — north, east, south, west — and you flick towards the one you
believe is right.

There is no button anywhere in the app, including onboarding. Even exiting a quiz is
a swipe, not a tap. That constraint is not a limitation worked around; it is the
whole point.

The name carries the same double meaning: cardinal directions, and cardinal in the
sense of fundamental — the core facts worth knowing.

**Built for:** students revising for exams — people who need something they can pick
up for sixty seconds in a queue or between classes, get honest feedback from, and
put down again without the session ever feeling like a chore.

---

## Table of contents

- [Status](#status)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Firebase setup](#firebase-setup)
- [Project structure](#project-structure)
- [Design system](#design-system)
- [The gesture model](#the-gesture-model)
- [The four game templates](#the-four-game-templates)
- [Firestore schema](#firestore-schema)
- [AI extraction pipeline](#ai-extraction-pipeline)
- [Accessibility](#accessibility)
- [Scripts](#scripts)
- [Roadmap](#roadmap)

---

## Status

**Week 4 — Foundations.** The Expo scaffold, design tokens, Firestore type
definitions and Firebase wiring are in place. The gesture/animation/haptics stack is
proven end to end by a scaffold screen at `src/app/index.tsx`, which is a wiring
check rather than a feature and will be replaced by the real templates.

Not yet built: auth flow, deck selection, the four game templates, SM-2 scheduling,
the upload and extraction pipeline.

---

## Tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| App framework | React Native via **Expo SDK 54** | One codebase for iOS and Android |
| Routing | **expo-router** | File-based routing, typed routes enabled |
| Gestures | **react-native-gesture-handler** | Native-thread pan recognition |
| Animation | **react-native-reanimated** | Drag physics, edge-glow preview, snap-back, all on the UI thread |
| Auth | **Firebase Authentication** | Sessions persist so returning users are not asked to log in again |
| Database | **Cloud Firestore** | Decks, cards, per-user progress, with offline persistence |
| File storage | **Firebase Storage** | Uploaded PDF and text source files |
| Server logic | **Firebase Cloud Functions** | Runs extraction, and validates SM-2 scheduling server-side so progress cannot be manipulated by rapid client-side swiping |
| AI extraction | **Claude Haiku via Vertex AI** | Reliable structured JSON output |
| Feedback | **expo-haptics** | Haptic confirmation on answer commit |
| Uploads | **expo-document-picker**, **expo-file-system** | Bring-your-own study material |
| Type | **Afacad** (body), dot-matrix face (display) | See [Design system](#design-system) |

---

## Getting started

### Prerequisites

- **Node.js `>=20.19.4`.** React Native 0.81 enforces this. Anything older prints an
  `EBADENGINE` warning and can fail in subtle ways. Check with `node --version`.
- The **Expo Go** app on a physical device, or Xcode (iOS Simulator) / Android Studio
  (emulator).
- A Firebase project — see [Firebase setup](#firebase-setup).

> **This project is pinned to Expo SDK 54, not the latest (57).** Expo Go supports one
> SDK at a time, so the project and the app on your phone must agree. If Expo Go ever
> reports *"Project is incompatible with this version of Expo Go"*, the two have
> drifted apart — check `expo` in `package.json` against the SDK version Expo Go
> reports on its home screen. Do not run `npx expo install expo@latest`; it will pull
> the project to SDK 57 and break Expo Go again.
>
> Because of the pin, **read the [SDK 54 docs](https://docs.expo.dev/versions/v54.0.0/)**,
> not the latest — APIs differ, `expo-file-system` especially.

### Install

```bash
npm install
```

### Configure environment

```bash
cp .env.example .env.local
```

Fill in the Firebase values, then start the dev server:

```bash
npx expo start
```

Scan the QR code with Expo Go, or press `i` for the iOS Simulator / `a` for an
Android emulator.

> Env vars are read at build time. Restart the dev server after editing `.env.local`.

---

## Firebase setup

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Add a Web app** (the `</>` icon) — Cardinal uses the Firebase **JS SDK**, so
   register a Web app even though this is a mobile project. Copy the config values
   into `.env.local`.
3. **Authentication** → Get started → enable **Email/Password**.
4. **Firestore Database** → Create database → start in **production mode**.
5. **Storage** → Get started, for PDF and text uploads.
6. Write your security rules before any real data goes in. `EXPO_PUBLIC_*` values are
   inlined into the JS bundle — that is expected for Firebase web config, which is not
   secret, but it means **Firestore Security Rules are the only thing protecting your
   data.**

A starting point that scopes every document to its owner:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /progress/{cardId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    match /decks/{deckId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == resource.data.ownerId;
      match /cards/{cardId} {
        allow read: if request.auth != null;
      }
    }
    match /uploads/{uploadId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == resource.data.ownerId;
    }
  }
}
```

Once SM-2 validation moves into Cloud Functions, tighten `users/{userId}/progress`
so the client can read but not write it.

---

## Project structure

```
assets/
└── fonts/
    ├── LEDDotMatrix-400.ttf   # display face — see licensing note below
    └── LICENSE.txt

src/
├── app/                  # expo-router routes — screens and layouts only
│   ├── _layout.tsx       # Root stack, font loading, GestureHandlerRootView
│   ├── index.tsx         # Onboarding — the pipe-and-ball screen
│   └── home.tsx          # Scaffold screen (temporary wiring check)
├── features/
│   └── onboarding/
│       └── path.ts       # Arc-length pipe geometry (pure, worklet-safe)
├── constants/
│   └── theme.ts          # Colours, type, spacing, gesture thresholds
├── lib/
│   └── firebase.ts       # Firebase init: auth, firestore, storage
└── types/
    └── cardinal.ts       # Firestore document shapes
```

### Onboarding

Onboarding holds the no-buttons constraint from the very first screen: a ball sits in
a pipe, and the user simply **holds** it. Nothing is tapped, including the thing that
advances the pages.

The rhythm is hold → travel → haptic → read → hold again. The ball advances to the
next milestone and stops there, so the pause to read the new line is built into the
mechanic rather than asked for.

The whole screen is driven by **one scalar** — how far the ball has travelled along
the pipe's centreline. Camera pan, body copy, progress dots and completion all derive
from it, so there is no second source of truth to keep in sync.

- **The ball never moves on screen.** It is pinned at 68% of the viewport height, in
  the thumb zone; the camera translates the pipe beneath it. That is what makes a hold
  possible at all — a moving ball would slide out from under a stationary finger.
- **`path.ts`** turns a polyline into an arc-length parameterised path with rounded
  corners, exposing `pointAtDistance(d) → { x, y, tx, ty }`. Being arc-length correct
  is what keeps the ball's speed constant through the bends instead of racing round
  the corners.
- **Holding** runs a `withTiming` to the next milestone with its duration derived from
  the distance remaining, so `HOLD_SPEED` (320 px/s) reads as one steady speed
  everywhere. Releasing early cancels it and springs back to the milestone the stage
  began at, so each stage is one deliberate hold.
- **The pipe** is one centreline stroked twice — wide in bone, then narrower in the
  background rust. Inner and outer corner radii are not independent numbers; they are
  the two edges of one stroked centreline, so `PIPE.cornerRadius` is the single dial
  for how the pipe turns (currently 120, giving an 80px inner and 160px outer radius
  around an 80px bore).

Only screens and layout files belong in `src/app` — everything else lives elsewhere
under `src/`. The `@/` alias maps to `src/`, so `@/constants/theme` resolves to
`src/constants/theme.ts`.

---

## Design system

Cardinal doesn't shout. One rust accent, a wash of charcoal, and blue held back for
the single moment it matters most: getting it right.

| Token | Hex | Role |
| --- | --- | --- |
| `blue` | `#233BC5` | Correct answer — deliberately scarce, this is the payoff colour |
| `rust` | `#C53D23` | The accent: wrong answers, active edges, the wordmark |
| `charcoal` | `#363636` | Background wash |
| `bone` | `#D9D9D9` | Primary text and card surfaces |

Typography is **Afacad** for body, and **LED Dot-Matrix** for display — the wordmark
gives the app a pulse, like something wired and alive.

| Token | Face | Source |
| --- | --- | --- |
| `Fonts.display` | LED Dot-Matrix 400 | Bundled — `assets/fonts/LEDDotMatrix-400.ttf` |
| `Fonts.body` / `bodyMedium` / `bodyBold` | Afacad 400 / 500 / 700 | `@expo-google-fonts/afacad` |

Both are registered in [`src/app/_layout.tsx`](src/app/_layout.tsx) and held behind the
splash screen until loaded, so no screen renders in a fallback face. The display font
is additionally embedded **natively** at build time via the `expo-font` config plugin
in `app.json` — that path applies to development and production builds; in Expo Go the
runtime `useFonts` load is what serves it.

Screens reference `Fonts.display`, never the filename, so replacing the face is a
one-line change.

> ⚠️ **Licensing.** The bundled LED Dot-Matrix file is the *preview* release —
> **free for personal use only** (see `assets/fonts/LICENSE.txt`). That covers a
> university submission. It does **not** cover publishing to the App Store or Play
> Store, and shipping it in a public repository is redistribution. Buy the full
> licence before Cardinal goes anywhere public.

All colour and type tokens live in [`src/constants/theme.ts`](src/constants/theme.ts).
Use the token, never a raw hex value or font filename.

All tokens live in [`src/constants/theme.ts`](src/constants/theme.ts). Use the token,
never a raw hex value.

---

## The gesture model

Every answer is a flick. The thresholds that decide what counts are centralised in
`Gestures` in [`src/constants/theme.ts`](src/constants/theme.ts) so all four templates
feel identical:

- **`commitDistance` (96px)** — how far a card must travel before a direction commits.
- **`commitVelocity` (800px/s)** — a fast flick commits early, before that distance.
- **`previewDistance` (24px)** — how far ahead the edge glow previews the pending answer.
- **`dominantAxisRatio` (1.25)** — the core of diagonal handling.

**Diagonal and ambiguous swipes** are resolved with dominant-axis thresholding: a
swipe only counts if one axis beats the other by `dominantAxisRatio`. A 45° drag
favours neither, so it is treated as ambiguous and springs back rather than guessing
and marking an answer the user did not intend.

---

## The four game templates

Once material is uploaded it needs somewhere to live. Four formats carry the weight
of the MVP — each a different way of asking the same question: *do you actually know
this?*

| Template | Interaction |
| --- | --- |
| **Compass Quiz** | Swipe to the edge holding the correct multiple-choice answer. Down is always reserved for Pass. |
| **True/False Duel** | Swipe right for true, left for false, up to skip. |
| **Sequence Swipe** | Drag cards into correct chronological or logical order. |
| **Match & Release** | Drag a term card onto its matching definition zone, where it locks in place on release. |

Any uploaded concept — a history timeline, a set of definitions, a run of true/false
facts — plays through this same small set of mechanics, rather than needing a bespoke
interface for every subject.

---

## Firestore schema

| Path | Fields |
| --- | --- |
| `users/{userId}` | `displayName`, `email`, `streak`, `createdAt` |
| `decks/{deckId}` | `title`, `ownerId`, `sourceType` (`upload` \| `manual`) |
| `decks/{deckId}/cards/{cardId}` | `gameType`, `payload`, `difficulty` |
| `users/{userId}/progress/{cardId}` | `easeFactor`, `interval`, `dueDate`, `lastResult` |
| `uploads/{uploadId}` | `ownerId`, `fileType`, `status`, `deckId` |

`payload` stays loosely typed **on purpose** — its shape varies by `gameType`. MCQ
cards store `choices[]` and `correctIndex`, sequence cards store `orderedItems[]`,
matching cards store `pairs[]`. On the client this is narrowed by the discriminated
union `CardDoc` in [`src/types/cardinal.ts`](src/types/cardinal.ts), so the compiler
enforces the right payload for the right game type.

**Scheduling** uses **SM-2** — the algorithm behind Anki — adjusting an ease factor
and interval per card based on recall performance, rather than a simplified requeue.

**Offline use** is handled by Firestore's built-in offline persistence (enabled in
`src/lib/firebase.ts` via `persistentLocalCache`), with sync resolving automatically
once the device reconnects. Revision continues in a queue with no signal.

---

## AI extraction pipeline

Uploaded material is parsed into structured question objects by **Claude Haiku**,
called from a Cloud Function via Vertex AI, which tags each question with the game
template it suits.

AI output will not always split cleanly into a valid sequence or matching-pair set.
The mitigation is layered:

1. Constrain the Haiku prompt with a **strict JSON schema** and worked examples per
   game type.
2. **Validate the response server-side** before it reaches Firestore.
3. **Fall back to Compass Quiz** — the most forgiving of the four formats — whenever
   extraction confidence is low.

---

## Accessibility

A gesture-only interface carries a real risk: it can exclude users with limited fine
motor control, or those relying on assistive technologies such as switch control,
since there is no fallback input method.

The mitigation is an **optional accessibility toggle** that overlays discreet tap
zones on each edge — satisfying basic operability requirements without removing the
gesture-first experience for everyone else.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npx expo start` | Start the dev server |
| `npm run ios` | Open in the iOS Simulator |
| `npm run android` | Open in an Android emulator |
| `npm run lint` | Lint |
| `npx tsc --noEmit` | Typecheck |
| `npx expo-doctor` | Validate project config and dependency versions |

---

## Roadmap

| Week | Milestone | Focus |
| --- | --- | --- |
| 4 | Foundations | Repository and branching strategy, Expo scaffold, Firebase configuration, Auth flow, Firestore and Storage wiring, one static test deck |
| 5 | Progress Phase 1 | Compass Quiz working end to end; AI extraction pipeline underway (PDF/text upload plus Claude Haiku parsing) |
| 6 | Progress Phase 2 | Remaining three MVP templates, SM-2 scheduling fully wired, deployment prep (icon, splash screen) |
| 7 | Final submission | Accessibility toggle, polish, cross-device testing, README, demonstration video — hand-in 20 August, 14:00 |

### Beyond the MVP

User-created manual decks · six further templates (slider, audio recall, timed
elimination, map-pin placement, fill-in-the-blank swipe-select, category sort) ·
daily reminder notifications · deck sharing · UI themes · multiplayer quiz duels ·
cross-deck analytics dashboard.

---

*Rikus Pretorius — 240144 · UX300 S2*
