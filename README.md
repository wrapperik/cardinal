<style>
a { color: #C53D23; }
</style>

# Cardinal

**The direction you swipe is the answer.**

Cardinal is a mobile revision app where the swipe *is* the answer, not a way to move
between cards. A question appears with its possible answers sitting at the compass
points around it (north, east, south and west) and you flick towards the one you
believe is right.

There is no button anywhere in the app, including onboarding. Even leaving a quiz is
a swipe, not a tap. That constraint is not a limitation worked around; it is the
whole point.

The name carries the same double meaning: cardinal directions, the four points you
swipe towards, and cardinal in the sense of fundamental, the core facts worth
knowing.

**Built for:** students revising for exams. People who need something they can pick
up for sixty seconds in a queue or between classes, get honest feedback from, and put
down again without the session ever feeling like a chore.

---

## Table of contents

- [Status](#status)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Firebase setup](#firebase-setup)
- [Project structure](#project-structure)
- [Architecture notes](#architecture-notes)
- [Design system](#design-system)
- [The gesture model](#the-gesture-model)
- [Onboarding](#onboarding)
- [Home and navigation](#home-and-navigation)
- [The four game templates](#the-four-game-templates)
- [The upload flow](#the-upload-flow)
- [AI extraction with Gemini](#ai-extraction-with-gemini)
- [Firestore schema](#firestore-schema)
- [Authentication](#authentication)
- [Accessibility](#accessibility)
- [Testing](#testing)
- [Security rules](#security-rules)
- [Scripts](#scripts)
- [Roadmap](#roadmap)

---

## Status

The app is playable end to end on a device. Onboarding, authentication, the home
screen, the upload flow and all four game templates are built and wired together.

**What works today**

- Gesture-only onboarding: a ball held in a pipe, with no tap target anywhere.
- Firebase Authentication: email and password sign-up, sign-in and password reset.
  Sessions persist across launches, and a route gate keeps signed-out users off
  protected screens.
- The home screen: a drifting marquee row of courses as ambience, a swipeable course
  row per course — right for a recap, left for its detail screen — and a settings
  panel dragged in from the right edge.
- The upload flow: pick a PDF, text or Markdown file, choose a template, watch
  extraction run, review the result, and save it as a deck under a course.
- All four MVP game templates, each fed either by an uploaded deck or by the
  fixtures the app ships with.
- 60 unit tests across six pure logic modules, run under Vitest.

**What is not built yet**

- Gemini extraction requires a deployed Cloud Function and its server-side API key.
  Without those, the upload flow falls back to the bundled demo provider. See
  [AI extraction with Gemini](#ai-extraction-with-gemini).
- SM-2 spaced repetition. The document shape is declared in
  [`src/types/cardinal.ts`](src/types/cardinal.ts), but nothing schedules against it
  yet.
- Firestore persistence for decks, cards and progress. Only the `users/{userId}`
  document is written today; courses and decks live in AsyncStorage on the device.
- Uploading source files to Firebase Storage. Storage is initialised but unused.
- The session summary, streak and past scores screens. The home menu rows for
  "QUICK RECAP" and "PAST SCORES" are deliberately inert until those screens exist.
- The accessibility tap-zone overlay. The toggle renders and holds its state, but it
  does not yet drive anything.

---

## Tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| App framework | React Native via **Expo SDK 54** | One codebase for iOS, Android and web |
| Routing | **expo-router** | File-based routing, typed routes enabled |
| Gestures | **react-native-gesture-handler** | Native-thread pan recognition |
| Animation | **react-native-reanimated** | Drag physics, edge glow, snap-back, all on the UI thread |
| Auth | **Firebase Authentication** | Email and password, with sessions that persist |
| Database | **Cloud Firestore** | User documents today, decks, cards and progress next |
| File storage | **Firebase Storage** | Uploaded PDF and text source files |
| Server logic | **Firebase Cloud Functions** | Holds the Gemini key, runs extraction, and validates server-owned results |
| AI extraction | **Gemini API** | Structured JSON extraction, called only from a Cloud Function |
| Feedback | **expo-haptics** | Haptic confirmation on every commit |
| Uploads | **expo-document-picker**, **expo-file-system** | Bring your own study material |
| Local state | **AsyncStorage** | Courses, decks and the onboarding flag |
| Testing | **Vitest** | Pure logic modules, run under Node with no native shims |
| Type | **Afacad** (body), **LED Dot-Matrix** (display) | See [Design system](#design-system) |

---

## Getting started

### Prerequisites

- **Node.js 20.19.4 or newer.** React Native 0.81 enforces this. Anything older
  prints an `EBADENGINE` warning and can fail in subtle ways. Check with
  `node --version`.
- Xcode (iOS Simulator) or Android Studio (emulator), or a physical device.
- A Firebase project. See [Firebase setup](#firebase-setup).

> **This project is pinned to Expo SDK 54.** Expo Go supports one SDK at a time, so
> the project and the app on your phone must agree. Read the
> [SDK 54 docs](https://docs.expo.dev/versions/v54.0.0/) rather than the latest, since
> APIs differ, `expo-file-system` especially. Do not run
> `npx expo install expo@latest`.

### Install

```bash
npm install
```

### Configure the environment

```bash
cp .env.example .env
```

Fill in the Firebase values from the console, then start the dev server:

```bash
npx expo start
```

Press `i` for the iOS Simulator, `a` for an Android emulator, or `w` for web.

Environment variables are read at build time, so restart the dev server after
editing `.env`.

### Native builds

Cardinal uses no custom native modules. Every dependency it does use ships inside the
prebuilt Expo Go binary, and Firebase is reached through the pure-JS SDK, so `npx expo
start` and the Expo Go app are enough to run the whole thing — no Xcode, no Android
Studio, no development build.

Native builds remain available if you want one:

```bash
npm run ios
```

```bash
npm run android
```

All configuration lives in `app.json`. There is no `app.config.ts`; it existed only to
register the Google Sign-In config plugin and went with it.

---

## Firebase setup

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Add a Web app** (the `</>` icon). Cardinal uses the Firebase **JS SDK**, so
   register a Web app even though this is a mobile project. Copy the config values
   into `.env`.
3. **Authentication** then **Sign-in method**: enable **Email/Password**.
4. **Firestore Database**: create the database in **production mode**.
5. **Storage**: enable it, for PDF and text uploads.
6. Deploy the security rules before any real data goes in — see
   [Security rules](#security-rules).

`EXPO_PUBLIC_*` values are inlined into the JS bundle. That is correct for Firebase
web config, which is not a secret, but it means **Firestore Security Rules are the
only thing protecting your data**. Model API keys must never carry that prefix.

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

Once SM-2 validation moves into a Cloud Function, tighten
`users/{userId}/progress` so the client can read it but not write it. Progress that
the client can write is progress a fast swiper can manufacture.

---

## Project structure

```
assets/
  fonts/
    LEDDotMatrix-400.ttf     the display face
  images/                    app icons, splash, background grid

src/
  app/                       expo-router routes: screens and layouts only
    _layout.tsx              root stack, font loading, providers, AuthGate
    index.tsx                onboarding, the pipe and ball screen
    sign-in.tsx              email, password and password reset
    sign-up.tsx              account creation
    home.tsx                 pill row, course list, settings tab, upload tab
    course/[id].tsx          course detail: stats, topics, back tab
    quiz.tsx                 Compass Quiz
    true-false.tsx           True/False Duel
    sequence.tsx             Sequence Swipe
    match.tsx                Match and Release

  components/                shared UI with no feature knowledge
    game-shell.tsx           header, progress readout and the exit sled
    pull-tab.tsx             the edge tab every drawer is dragged by
    bottom-pull-tab.tsx      the same idea, rotated for the upload sheet
    character-mark.tsx       the player puck, drawn from the roster
    dot-cluster.tsx

  constants/
    theme.ts                 colours, type, spacing, gesture thresholds

  features/
    auth/                    provider, service, route gate, validation, errors
    character/roster.ts      the playable puck shapes
    home/                    pill row, course row, settings panel, topics
    onboarding/path.ts       arc-length pipe geometry, pure and worklet safe
    quiz/                    Compass Quiz fixtures
    true-false/              True/False fixtures
    sequence/                Sequence fixtures
    match/                   Match fixtures and zone layout maths
    upload/                  picker, courses, decks, sheet, and:
      extract/               provider selection, prompt, parser, demo provider

  lib/
    firebase.ts              web and SSR safe init
    firebase.native.ts       native init, with AsyncStorage auth persistence

  types/
    cardinal.ts              Firestore document shapes
```

Only screens and layouts belong in `src/app`. Everything else lives elsewhere under
`src/`. The `@/` alias maps to `src/`, so `@/constants/theme` resolves to
`src/constants/theme.ts`.

---

## Architecture notes

**Platform-specific modules.** `firebase.ts` and `firebase.native.ts` are selected by
Metro at build time. The native file configures `initializeAuth` with AsyncStorage
persistence, which is what keeps a returning user signed in. Firestore runs on its
memory cache on native, because `persistentLocalCache()` is IndexedDB backed and
React Native has no implementation of it.

**State lives in module-level stores.** `features/upload/courses.ts` and
`features/upload/decks.ts` are small stores exposed through `useSyncExternalStore`
rather than React context. Courses are read from the home screen, the upload sheet
and the review step, and threading a provider through the router layout for one array
is more plumbing than it is worth. Both hydrate from AsyncStorage once at import and
write back on every commit, fire and forget.

**Pure modules are separated deliberately.** `course-rules.ts`, `extract/parse.ts`,
`match/layout.ts`, `auth/routing.ts`, `auth/validation.ts` and `auth/errors.ts` have
no React Native imports, so Vitest can exercise them directly under Node with no
native shims. That is where the awkward input lives: model output, whatever
AsyncStorage handed back after a botched migration, and half-typed forms.

**Games render home as their own backdrop.** Every template imports `Home` and draws
it behind an exit sled, so dragging the exit tab pulls home across the game rather
than shoving the game aside. That is why the game routes set `animation: 'none'` in
the root stack: the screens animate themselves, in both directions, and the stack's
own push transition would play a second slide over the top of that one.

---

## Design system

Cardinal does not shout. One rust accent, a wash of charcoal, and blue held back for
the single moment it matters most: getting it right.

| Token | Hex | Role |
| --- | --- | --- |
| `blue` | `#233BC5` | Correct answer. Deliberately scarce, this is the payoff colour |
| `rust` | `#C53D23` | The accent: wrong answers, active edges, the wordmark |
| `charcoal` | `#363636` | Background wash |
| `bone` | `#D9D9D9` | Primary text and card surfaces |

Ghost trails are pre-blended rather than alpha-composited. `Trail` is bone over rust
and `TrailDark` is bone over charcoal, both at 30, 18 and 10 per cent. Solid fills
keep a trail flat where its ghosts overlap instead of compounding into darker
crescents, so recompute them if either base colour changes.

| Token | Face | Source |
| --- | --- | --- |
| `Fonts.display` | LED Dot-Matrix 400 | Bundled, `assets/fonts/LEDDotMatrix-400.ttf` |
| `Fonts.body` / `bodyMedium` / `bodyBold` | Afacad 400 / 500 / 700 | `@expo-google-fonts/afacad` |

Both are registered in [`src/app/_layout.tsx`](src/app/_layout.tsx) and held behind
the splash screen until loaded, so no screen ever renders in a fallback face. The
display font is additionally embedded natively at build time through the `expo-font`
config plugin in `app.json`. Screens reference `Fonts.display`, never the filename, so
replacing the face is a one-line change.

All card text is uppercase, and the app applies no casing on the client. That rule is
enforced at the two points where text enters the system: `normaliseTitle` for course
titles, and the parser for everything a model returns.

All colour and type tokens live in
[`src/constants/theme.ts`](src/constants/theme.ts). Use the token, never a raw hex
value or font filename.

---

## The gesture model

Every answer is a flick. The thresholds that decide what counts are centralised in
`Gestures` in [`src/constants/theme.ts`](src/constants/theme.ts), so all four
templates feel identical:

- **`commitDistance` (96px)**: how far a card must travel before a direction commits.
- **`commitVelocity` (800px/s)**: a fast flick commits early, before that distance.
- **`previewDistance` (24px)**: how far ahead the edge glow previews the pending
  answer.
- **`dominantAxisRatio` (1.25)**: the core of diagonal handling.

**Diagonal and ambiguous swipes** are resolved with dominant-axis thresholding. A
swipe only counts if one axis beats the other by `dominantAxisRatio`. A 45 degree drag
favours neither, so it is treated as ambiguous and springs back rather than guessing
and marking an answer the player did not intend.

**Down is always Pass**, in every template. That mapping is fixed app-wide rather
than decided per screen, so the one direction that is never a wrong answer is never
in doubt.

---

## Onboarding

Onboarding holds the no-buttons constraint from the very first screen: a ball sits in
a pipe, and the user simply holds it. Nothing is tapped, including the thing that
advances the pages.

The rhythm is hold, travel, haptic, read, hold again. The ball advances to the next
milestone and stops there, so the pause to read the new line is built into the
mechanic rather than asked for.

The whole screen is driven by one scalar: how far the ball has travelled along the
pipe's centreline. Camera pan, body copy, progress dots and completion all derive
from it, so there is no second source of truth to keep in step.

- **The ball never moves on screen.** It is pinned at 68 per cent of the viewport
  height, in the thumb zone, and the camera translates the pipe beneath it. That is
  what makes a hold possible at all, since a moving ball would slide out from under a
  stationary finger.
- **[`path.ts`](src/features/onboarding/path.ts)** turns a polyline into an
  arc-length parameterised path with rounded corners, exposing
  `pointAtDistance(d)`. Being arc-length correct is what keeps the ball's speed
  constant through the bends instead of racing round the corners.
- **Holding** runs a `withTiming` to the next milestone with its duration derived
  from the distance remaining, so `HOLD_SPEED` (320px/s) reads as one steady speed
  everywhere. Releasing early cancels it and springs back to the milestone the stage
  began at, so each stage is one deliberate hold. Releasing within 50px of the target
  carries the ball home instead, because losing a whole stage over the last few pixels
  reads as a bug.
- **The pipe** is one centreline stroked twice, wide in bone and then narrower in
  rust. Inner and outer corner radii are not independent numbers; they are the two
  edges of one stroked centreline, so `PIPE.cornerRadius` is the single dial for how
  the pipe turns.
- **The progress dots** can be dragged backwards to revisit a stage, but never
  forwards. Forward progress is earned by holding the ball.

Completing onboarding writes a flag to AsyncStorage and routes to sign-up. It is
never shown again.

---

## Home and navigation

One row of course pills drifts beneath the wordmark as pure ambience — nothing in it
responds to touch. Below it, a scrollable list of course rows is the actual content,
and every interaction is a swipe.

- **Swipe a course row right** to fire a quick recap: it routes through the recap
  dispatcher, which resumes an in-progress recap or starts a new one, carrying the
  course id so the game deals that course's cards.
- **Swipe a course row left** to open that course's detail screen — its stats and
  the topics its uploaded material actually covers.
- **The settings panel** is dragged in from a tab on the right edge. It shows the
  signed-in account, the accessibility toggle, and a sign-out control that is itself
  a swipe.
- **The upload sheet** is dragged up from a tab at the bottom edge.

The pill row and the course list are the same data, so a course created by an upload
appears on the home screen without a second source of truth to keep in step.

---

## The four game templates

Once material is uploaded it needs somewhere to live. Four formats carry the weight
of the MVP, each a different way of asking the same question: do you actually know
this?

| Template | Route | Interaction |
| --- | --- | --- |
| **Compass Quiz** | [`quiz.tsx`](src/app/quiz.tsx) | Three lettered choices sit west, north and east. Drag the puck to the one you want. South is Pass |
| **True/False Duel** | [`true-false.tsx`](src/app/true-false.tsx) | The statement rides a bone circle. Right is TRUE, left is FALSE, down is Pass. Up, and anything too diagonal to call, snaps back and does nothing |
| **Sequence Swipe** | [`sequence.tsx`](src/app/sequence.tsx) | Four rows, dragged into the correct chronological or logical order. The board turns blue when it resolves |
| **Match and Release** | [`match.tsx`](src/app/match.tsx) | Three definition zones sit fixed on the field. Drag each term onto the one it names, where it locks in place on release |

Design decisions worth knowing:

- **The compass targets are identical circles.** The answer text lives in the list
  above, and only the letter (A, B, C) is shared between the list and the compass. A
  drag is therefore never aimed at a word, and no direction can read as lopsided.
- **Left is FALSE and right is TRUE** is a deliberate, non-obvious mapping, which is
  exactly why the edge pills carry labels. Without a label pinned to each side, nobody
  would guess it correctly.
- **Wrong answers linger.** The verdict holds for 600ms when correct and 1100ms when
  wrong, because the reveal is the lesson.
- **Sequence shuffles are re-rolled** if they land back on the identity order. An
  already-solved board would resolve in zero moves, which reads as broken rather than
  lucky.
- **Match zones are shuffled per round**, so the term list and the zone list never
  line up. The whole point is reading the definitions, not the order.
- **The way out is a drag, everywhere.** `GameShell` owns the header, the NN/NN
  progress readout and the exit sled. Quiz and True/False build the same sled inline,
  because their backdrops differ.

Any uploaded concept, a history timeline, a set of definitions, a run of true or false
facts, plays through this same small set of mechanics rather than needing a bespoke
interface for every subject.

---

## The upload flow

The sheet runs a small state machine, declared as `UploadStage` in
[`src/features/upload/types.ts`](src/features/upload/types.ts):

`idle` to `picked` to `extracting` to `review` to `saving` to `saved`, with `failed`
reachable from extraction and `review` reachable twice if a bad result is
re-extracted.

1. **Pick.** [`picker.ts`](src/features/upload/picker.ts) wraps
   `expo-document-picker` and normalises what comes back. PDF, plain text and Markdown
   are accepted, up to 20MB. Android content providers routinely return an undefined
   MIME type, so the file extension is the documented fallback rather than an edge
   case. On web the picker returns a full `data:` URL despite the field being named
   `base64`, so the prefix is stripped once, at the only place a `PickedFile` is ever
   built.
2. **Choose a template.** AUTO hands the choice to the model per card. Choosing a
   specific template constrains both the prompt and the parser, so a card of any other
   shape is dropped rather than silently reshaped.
3. **Choose a destination.** An existing course, or a new one proposed from the
   material.
4. **Extract.** The active provider runs and reports progress as a fraction.
5. **Review.** The card count, the per-template breakdown, the provider that produced
   them, and the suggested course, weighted by the model's own confidence.
6. **Save.** The deck is written to the local deck store and the course is created if
   it did not already exist. Courses de-duplicate on title, not id, because uploading
   twice under "Biology" should file both decks under one course.

[`play.ts`](src/features/upload/play.ts) is the bridge from stored cards to the shape
each game screen plays. Every screen keeps its own local round type, because those
types encode constraints the payloads do not: a Compass question's choices are a fixed
triple, a sequence board lays out exactly four slots, and a match board has room for
exactly three zones. A card that violates one of those is dropped rather than crashing
the screen. A screen opened without a course id, or for a course with nothing uploaded
under that template, falls back to the shipped fixtures, which is what keeps every
game playable on a fresh install.

---

## AI extraction with Gemini

Uploaded material is turned into structured cards by the **Gemini API**, called from a
**Firebase Cloud Function**. The default model is `gemini-3.5-flash`; the model tags
each card with the game template it suits.

### Why the key lives on the server

Anything prefixed `EXPO_PUBLIC_` is inlined into the JS bundle, and a bundle is not a
secret store. `GEMINI_API_KEY` is therefore held as a Cloud Functions secret and never
reaches the client. The client's only job is to call an authenticated function and
validate what comes back.

### The provider boundary

[`src/features/upload/types.ts`](src/features/upload/types.ts) declares one interface,
`ExtractionProvider`, with an `id`, a `label` shown on the review screen, an
`isConfigured()` check and an `extract()` call. The UI knows nothing about where card
generation runs.

[`extract/index.ts`](src/features/upload/extract/index.ts) selects the Gemini job
provider when Firebase, authentication and `EXPO_PUBLIC_ENABLE_GEMINI_EXTRACTION=1`
are available. Otherwise it returns the demo provider, so a clean checkout remains
usable without a cloud key.

### Configuration and deployment

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Store it in Firebase Secret Manager from the repository root:

   ```bash
   npx firebase-tools functions:secrets:set GEMINI_API_KEY
   ```

3. Set `EXPO_PUBLIC_ENABLE_GEMINI_EXTRACTION=1` in the app's untracked `.env` file.
4. Deploy the Function:

   ```bash
   npx firebase-tools deploy --only functions:processUpload
   ```

The client uploads the source file to Storage and creates a processing job. The
Function extracts PDF or text content, splits long material into bounded chunks,
requests Gemini structured JSON, validates every card, writes the canonical course,
deck and cards, then marks the job complete. Override the default model with
`GEMINI_MODEL` in the Function environment only when intentionally testing another
compatible model.

### The prompt

[`extract/prompt.ts`](src/features/upload/extract/prompt.ts) builds the system and
user messages. Its rules mirror the constraints the game screens actually assume,
because a card that violates one of them is wasted work:

- `compassQuiz`: exactly three choices, and `correctIndex` is 0, 1 or 2.
- `trueFalseDuel`: a single statement under 60 characters, since it renders inside a
  circle and wraps badly past that.
- `sequenceSwipe`: exactly four items, stored in the correct order. The app shuffles
  its own copy for play.
- `matchRelease`: exactly three pairs, each a term and a short definition clause.

The prompt also asks for uppercase text and JSON only, with no prose, no Markdown and
no code fences, and asks the model to name a course and rate its confidence in that
match.

### The parser

[`extract/parse.ts`](src/features/upload/extract/parse.ts) treats model output as the
least trustworthy input in the system, and is the most heavily tested module in the
repository.

1. **Slice.** Models routinely wrap JSON in fences or lead with a sentence despite
   being told not to. Slicing from the first `{` to the last `}` survives both without
   needing a real parser for the surrounding prose.
2. **Validate per template.** Every card is checked against the rules above, field by
   field. Anything that fails is dropped, not repaired.
3. **Enforce the constraints the UI depends on.** Choice counts, index bounds,
   statement length, item counts, pair counts, and the requested template when the
   user chose one explicitly.
4. **Report honestly.** No usable cards is an `empty` failure with a readable message,
   not an empty deck saved silently.

Difficulty is clamped to 1 to 3 and confidence to 0 to 1, both with sane fallbacks, so
a nonsense number never reaches the review screen.

---

## Firestore schema

| Path | Fields |
| --- | --- |
| `users/{userId}` | `displayName`, `email`, `streak`, `createdAt` |
| `decks/{deckId}` | `title`, `ownerId`, `sourceType` (`upload` or `manual`) |
| `decks/{deckId}/cards/{cardId}` | `gameType`, `payload`, `difficulty` |
| `users/{userId}/progress/{cardId}` | `easeFactor`, `interval`, `dueDate`, `lastResult` |
| `uploads/{uploadId}` | `ownerId`, `fileType`, `status`, `deckId` |

`payload` stays loosely typed on purpose, because its shape varies by `gameType`.
Compass cards store `choices[]` and `correctIndex`, sequence cards store
`orderedItems[]`, and matching cards store `pairs[]`. On the client this is narrowed
by the discriminated union `CardDoc` in
[`src/types/cardinal.ts`](src/types/cardinal.ts), so the compiler enforces the right
payload for the right game type.

Of this schema, only `users/{userId}` is written today, on account creation. Decks
and courses are stored on the device by
[`decks.ts`](src/features/upload/decks.ts) and
[`courses.ts`](src/features/upload/courses.ts), whose record shapes were written to
map cleanly onto `decks/` and `uploads/` when the sync lands.

**Scheduling** will use **SM-2**, the algorithm behind Anki, adjusting an ease factor
and interval per card based on recall performance rather than a simplified requeue.
Validating it in a Cloud Function is what stops a fast swiper manufacturing progress.

**Offline use** will rely on Firestore's built-in offline persistence, with sync
resolving once the device reconnects. Note that on native the SDK runs on its memory
cache, since `persistentLocalCache()` is IndexedDB backed and React Native has no
implementation of it.

---

## Authentication

[`auth-provider.tsx`](src/features/auth/auth-provider.tsx) holds the session, the
onboarding flag and every auth action behind one context.
[`auth-gate.tsx`](src/features/auth/auth-gate.tsx) sits beside the root navigator
rather than around it, so the navigator stays mounted while a redirect is dispatched.

The routing rules are a pure function,
[`routing.ts`](src/features/auth/routing.ts), which is the reason they are testable:

- Signed in, standing on `/`, `/sign-in` or `/sign-up`: go to `/home`.
- Signed out and not yet onboarded: stay on onboarding, but explicit auth links still
  work.
- Signed out and onboarded: go to `/sign-in` from anywhere that is not already an
  auth screen. Matching only `/` here left sign-out with no visible effect, since it
  is triggered from the settings panel on `/home`.

Sign-in, sign-up and sign-out all update the local session immediately rather than
waiting for Firebase to emit the same state, which closes the brief window where the
gate would otherwise see the wrong answer.

[`validation.ts`](src/features/auth/validation.ts) checks form input before a request
is made, and [`errors.ts`](src/features/auth/errors.ts) maps Firebase error codes to
messages a person can act on, falling back to a generic line rather than leaking an
internal error string.

---

## Accessibility

A gesture-only interface carries a real risk: it can exclude users with limited fine
motor control, or those relying on assistive technologies such as switch control,
since there is no fallback input method.

The mitigation is an optional toggle that overlays discreet tap zones on each edge,
satisfying basic operability requirements without removing the gesture-first
experience for everyone else. The toggle is built and holds its state in the settings
panel under EDGE TAP ZONES. The overlay it drives is the remaining piece of work.

---

## Testing

```bash
npm test
```

Vitest runs 61 tests across six files, all of them pure modules with no React Native
imports:

| File | Covers |
| --- | --- |
| [`extract/parse.test.ts`](src/features/upload/extract/parse.test.ts) | Malformed and adversarial model output |
| [`course-rules.test.ts`](src/features/upload/course-rules.test.ts) | Title normalisation, slugs, seeding, merging stored data |
| [`auth-gate.test.ts`](src/features/auth/auth-gate.test.ts) | Every redirect decision |
| [`validation.test.ts`](src/features/auth/validation.test.ts) | Sign-in and sign-up form rules |
| [`errors.test.ts`](src/features/auth/errors.test.ts) | Firebase error code mapping |
| [`layout.test.ts`](src/features/match/layout.test.ts) | Match zone height maths |

Note that Vitest has no alias resolution configured, so a pure module that imports
another pure module must do so relatively. `parse.ts` imports `../course-rules` for
exactly this reason; type-only imports may still use `@/`, since they are erased
before the test runs.

A further 38 tests cover the security rules and run separately, against the Firestore
emulator:

```bash
npm run test:rules
```

These are skipped by a plain `npm test`, guarded on `FIRESTORE_EMULATOR_HOST`, so the
main suite needs no emulator. The emulator is a Java program, so running them needs a
JDK on the PATH (`brew install openjdk`).

---

## Security rules

[`firestore.rules`](firestore.rules) and [`storage.rules`](storage.rules) enforce the
model in [`docs/erd.md`](docs/erd.md). The app talks to Firestore directly from the
device, so the TypeScript shapes in `src/types/cardinal.ts` only describe what the
client *intends* to write — these rules are the only thing deciding what it is
allowed to.

Ownership is the backbone: every root document carries `ownerId`, and every user
subcollection is keyed by the uid in its path. Beyond that, two groups of fields are
denied to the client because the ERD assigns them to a Cloud Function, which bypasses
rules through the Admin SDK:

| Locked to the backend | Why |
| --- | --- |
| `users/{userId}/stats/**` | Derived from sessions and progress in its entirety |
| `currentStreak`, `longestStreak`, `lastStudiedDate` | Derived from sessions, so a client cannot award itself a streak |
| An upload's `status`, `deckId`, `cardsGenerated`, `completedAt` | A client can only ever open an honestly pending job, never mint a finished one pointing at a deck it does not own |

Session counters are also monotonic, and a closed session cannot reopen, so the
totals the stats trigger reads cannot be rewritten after the fact.

Storage objects live at `uploads/{userId}/{uploadId}` — keyed by the job rather than
the filename, which makes them collision-free and write-once.

```bash
npx firebase deploy --only firestore:rules,firestore:indexes,storage
```

Two constraints worth knowing before writing the sync layer: a deck update must set
`updatedAt: serverTimestamp()` or it is rejected, and course title uniqueness is not
enforceable in rules, since rules cannot query — `addCourse()` handles that
client-side.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npx expo start` | Start the dev server |
| `npm run ios` | Build and run the iOS development build |
| `npm run android` | Build and run the Android development build |
| `npm run web` | Start the web build |
| `npm test` | Run the Vitest suite |
| `npm run test:rules` | Run the security rules tests against the Firestore emulator |
| `npm run lint` | Lint |
| `npx tsc --noEmit` | Typecheck |
| `npx expo-doctor` | Validate project config and dependency versions |

---

## Roadmap

| Week | Milestone | Focus |
| --- | --- | --- |
| 4 | Foundations | Repository and branching strategy, Expo scaffold, Firebase configuration, auth flow, Firestore and Storage wiring, one static test deck |
| 5 | Progress phase 1 | Compass Quiz working end to end, with the extraction pipeline underway |
| 6 | Progress phase 2 | The remaining three templates, SM-2 scheduling, and deployment prep (icon, splash screen) |
| 7 | Final submission | Accessibility toggle, polish, cross-device testing, README, demonstration video, hand-in 20 August, 14:00 |

### Next up

Firestore sync for decks and progress, SM-2 scheduling, the
session summary and streak screens, and the accessibility overlay.

### Beyond the MVP

Manually created decks, six further templates (slider, audio recall, timed
elimination, map-pin placement, fill-in-the-blank swipe-select and category sort),
daily reminder notifications, deck sharing, UI themes, multiplayer quiz duels, and a
cross-deck analytics dashboard.

---

*Rikus Pretorius, 240144. UX300 S2.*
