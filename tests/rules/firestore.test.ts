/**
 * Rules tests for firestore.rules.
 *
 * These run against the Firestore emulator, not a real project, so they are
 * skipped unless FIRESTORE_EMULATOR_HOST is set — which `npm run test:rules`
 * does by launching them under `firebase emulators:exec`. A plain `npm test`
 * therefore stays green on a machine with no emulator.
 *
 * Each test builds a document that is valid in every respect, then breaks
 * exactly one thing, so a failure names the rule it came from.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// courses.ts creates its app store at import time. The rules suite only needs
// its exported adapter config, so keep auth/cache startup out of this emulator
// boundary test while leaving the Firebase Firestore client itself real.
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock('firebase/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/auth')>()),
  onAuthStateChanged: vi.fn(() => vi.fn()),
}));
vi.mock('@/lib/firebase', () => ({ auth: {}, db: {} }));

import { toFirestorePayload } from '../../src/lib/sync/adapter';
import { reconcile } from '../../src/lib/sync/merge';
import { SERVER_TIMESTAMP } from '../../src/lib/sync/types';
import { seedCourses } from '../../src/features/upload/course-rules';
import { COURSE_FIELD } from '../../src/features/upload/courses';
import { CARD_FIELD, DECK_FIELD, expandDeck } from '../../src/features/upload/deck-rules';
import { CHECKPOINT_FIELD } from '../../src/features/recap/checkpoints';
import type { Course } from '../../src/features/upload/types';
import type { LocalDeck } from '../../src/features/upload/types';

const ALICE = 'alice';
const BOB = 'bob';

let testEnv: RulesTestEnvironment;

/** Firestore handle authenticated as the given uid. */
function as(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

/* -------------------------------------------------------------------------- */
/* Valid document builders                                                     */
/* -------------------------------------------------------------------------- */

function validUser(uid: string) {
  return {
    userId: uid,
    displayName: 'Student',
    email: `${uid}@example.com`,
    photoURL: null,
    currentStreak: 0,
    longestStreak: 0,
    lastStudiedDate: null,
    onboardingComplete: true,
    createdAt: serverTimestamp(),
  };
}

function validPreferences(uid: string) {
  return {
    userId: uid,
    accessibilityTapZones: false,
    hapticsEnabled: true,
    dailyReminderEnabled: false,
    reminderTime: '19:30',
    theme: 'default',
    updatedAt: serverTimestamp(),
  };
}

function validProgress(cardId: string) {
  return {
    cardId,
    deckId: 'deck-1',
    easeFactor: 2.5,
    interval: 1,
    repetitions: 1,
    lapses: 0,
    dueDate: new Date('2026-09-01'),
    lastReviewedAt: new Date('2026-08-19'),
    lastQuality: 5,
  };
}

function validSession(sessionId: string) {
  return {
    sessionId,
    courseId: 'course-geography',
    deckId: null,
    startedAt: serverTimestamp(),
    endedAt: null,
    correctCount: 0,
    wrongCount: 0,
    passedCount: 0,
    bestStreakInSession: 0,
    gameTypesPlayed: [],
  };
}

function validCheckpoint(courseId: string) {
  return {
    courseId,
    index: 1,
    total: 3,
    updatedAt: serverTimestamp(),
  };
}

function validCourse(courseId: string, ownerId: string) {
  return {
    courseId,
    ownerId,
    title: 'BIOLOGY',
    gameType: 'compassQuiz',
    seeded: false,
    createdAt: serverTimestamp(),
  };
}

function validDeck(deckId: string, ownerId: string) {
  return {
    deckId,
    ownerId,
    courseId: 'course-biology',
    title: 'Cell division',
    sourceType: 'manual',
    uploadId: null,
    cardCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function validCard(cardId: string, deckId: string) {
  return {
    cardId,
    deckId,
    gameType: 'compassQuiz',
    difficulty: 2,
    payload: {
      question: 'Which phase splits the centromeres?',
      choices: ['Anaphase', 'Prophase', 'Telophase'],
      correctIndex: 0,
    },
    createdAt: serverTimestamp(),
  };
}

function deckForSyncProof(): LocalDeck {
  return {
    id: 'deck-sync-proof',
    courseId: 'course-biology',
    title: 'Cell division',
    sourceName: 'cell-division.pdf',
    cards: [
      {
        cardId: 'card-sync-1',
        gameType: 'compassQuiz',
        difficulty: 2,
        payload: {
          question: 'Which phase splits the centromeres?',
          choices: ['Anaphase', 'Prophase', 'Telophase'],
          correctIndex: 0,
        },
      },
      {
        cardId: 'card-sync-2',
        gameType: 'trueFalseDuel',
        difficulty: 1,
        payload: { statement: 'Cells divide.', isTrue: true },
      },
    ],
    createdAt: 0,
    updatedAt: 0,
    provider: 'mock',
    sourceType: 'manual',
    uploadId: null,
  };
}

/** Converts the sync layer's pure marker into the SDK value at its write boundary. */
function materialize(payload: Record<string, unknown>): Record<string, unknown> {
  const materialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    materialized[key] = value === SERVER_TIMESTAMP ? serverTimestamp() : value;
  }
  return materialized;
}

function validUpload(uploadId: string, ownerId: string) {
  return {
    uploadId,
    ownerId,
    fileName: 'revision-notes.pdf',
    fileType: 'pdf',
    storagePath: `uploads/${ownerId}/${uploadId}`,
    template: 'auto',
    cardTarget: 20,
    status: 'processing',
    errorMessage: null,
    deckId: null,
    cardsGenerated: 0,
    createdAt: serverTimestamp(),
    completedAt: null,
  };
}

/* -------------------------------------------------------------------------- */

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('firestore.rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      // The `demo-` prefix marks this as an emulator-only project, so nothing
      // here can reach or bill a real Firebase project even by mistake.
      projectId: 'demo-cardinal',
      firestore: {
        rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  /* ------------------------------------------------------------------ */

  describe('users', () => {
    it('lets a user read and create their own document', async () => {
      const db = as(ALICE);
      await assertSucceeds(setDoc(doc(db, 'users', ALICE), validUser(ALICE)));
      await assertSucceeds(getDoc(doc(db, 'users', ALICE)));
    });

    it("denies reading another user's document", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', ALICE), validUser(ALICE));
      });
      await assertFails(getDoc(doc(as(BOB), 'users', ALICE)));
    });

    it('denies signing up with a streak already running', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'users', ALICE), {
          ...validUser(ALICE),
          currentStreak: 40,
        }),
      );
    });

    it('allows a profile edit but not a streak edit', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', ALICE), validUser(ALICE));
      });
      const db = as(ALICE);
      await assertSucceeds(
        updateDoc(doc(db, 'users', ALICE), { displayName: 'Riku' }),
      );
      await assertFails(
        updateDoc(doc(db, 'users', ALICE), { currentStreak: 99 }),
      );
    });

    it('denies deleting the user document', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', ALICE), validUser(ALICE));
      });
      await assertFails(deleteDoc(doc(as(ALICE), 'users', ALICE)));
    });
  });

  describe('stats', () => {
    it('is readable by its owner but writable by nobody', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', ALICE, 'stats', 'summary'), {
          userId: ALICE,
          totalCardsStudied: 0,
        });
      });
      const db = as(ALICE);
      await assertSucceeds(getDoc(doc(db, 'users', ALICE, 'stats', 'summary')));
      await assertFails(
        updateDoc(doc(db, 'users', ALICE, 'stats', 'summary'), {
          totalCardsStudied: 5000,
        }),
      );
    });
  });

  describe('preferences', () => {
    it('accepts a well-formed settings document', async () => {
      await assertSucceeds(
        setDoc(
          doc(as(ALICE), 'users', ALICE, 'preferences', 'settings'),
          validPreferences(ALICE),
        ),
      );
    });

    it('rejects any document id other than settings', async () => {
      await assertFails(
        setDoc(
          doc(as(ALICE), 'users', ALICE, 'preferences', 'other'),
          validPreferences(ALICE),
        ),
      );
    });

    it('rejects a malformed reminder time', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'users', ALICE, 'preferences', 'settings'), {
          ...validPreferences(ALICE),
          reminderTime: '7pm',
        }),
      );
    });

    it('requires a server timestamp so devices can reconcile settings', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'users', ALICE, 'preferences', 'settings'), {
          ...validPreferences(ALICE),
          updatedAt: new Date('2026-08-24'),
        }),
      );
    });

    it('rejects unknown fields', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'users', ALICE, 'preferences', 'settings'), {
          ...validPreferences(ALICE),
          isPremium: true,
        }),
      );
    });

    it("denies writing another user's preferences", async () => {
      await assertFails(
        setDoc(
          doc(as(BOB), 'users', ALICE, 'preferences', 'settings'),
          validPreferences(ALICE),
        ),
      );
    });
  });

  describe('progress', () => {
    it('accepts a well-formed SM-2 record', async () => {
      await assertSucceeds(
        setDoc(
          doc(as(ALICE), 'users', ALICE, 'progress', 'card-1'),
          validProgress('card-1'),
        ),
      );
    });

    it('rejects an ease factor below the SM-2 floor', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'users', ALICE, 'progress', 'card-1'), {
          ...validProgress('card-1'),
          easeFactor: 1.1,
        }),
      );
    });

    it('rejects a recall grade outside 0 to 5', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'users', ALICE, 'progress', 'card-1'), {
          ...validProgress('card-1'),
          lastQuality: 6,
        }),
      );
    });

    it('rejects a cardId that disagrees with the document id', async () => {
      await assertFails(
        setDoc(
          doc(as(ALICE), 'users', ALICE, 'progress', 'card-1'),
          validProgress('card-2'),
        ),
      );
    });
  });

  describe('sessions', () => {
    it('opens a session empty', async () => {
      await assertSucceeds(
        setDoc(
          doc(as(ALICE), 'users', ALICE, 'sessions', 'session-1'),
          validSession('session-1'),
        ),
      );
    });

    it('permits an optional string deckId when opening a session', async () => {
      await assertSucceeds(
        setDoc(doc(as(ALICE), 'users', ALICE, 'sessions', 'session-1'), {
          ...validSession('session-1'),
          deckId: 'deck-1',
        }),
      );
    });

    it('requires a string courseId when opening a session', async () => {
      const { courseId: _courseId, ...withoutCourseId } = validSession('session-1');

      await assertFails(
        setDoc(doc(as(ALICE), 'users', ALICE, 'sessions', 'session-1'), withoutCourseId),
      );
    });

    it('rejects a session that opens already scored', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'users', ALICE, 'sessions', 'session-1'), {
          ...validSession('session-1'),
          correctCount: 30,
        }),
      );
    });

    it('lets counters climb but not fall', async () => {
      const db = as(ALICE);
      const ref = doc(db, 'users', ALICE, 'sessions', 'session-1');
      await setDoc(ref, validSession('session-1'));

      await assertSucceeds(updateDoc(ref, { correctCount: 3 }));
      await assertFails(updateDoc(ref, { correctCount: 1 }));
    });

    it('keeps courseId immutable after opening', async () => {
      const db = as(ALICE);
      const ref = doc(db, 'users', ALICE, 'sessions', 'session-1');
      await setDoc(ref, validSession('session-1'));

      await assertFails(updateDoc(ref, { courseId: 'course-history' }));
    });

    it('keeps deckId immutable after opening', async () => {
      const db = as(ALICE);
      const ref = doc(db, 'users', ALICE, 'sessions', 'session-1');
      await setDoc(ref, validSession('session-1'));

      await assertFails(updateDoc(ref, { deckId: 'deck-1' }));
    });

    it('refuses to reopen a closed session', async () => {
      const db = as(ALICE);
      const ref = doc(db, 'users', ALICE, 'sessions', 'session-1');
      await setDoc(ref, validSession('session-1'));
      await assertSucceeds(updateDoc(ref, { endedAt: serverTimestamp() }));

      await assertFails(updateDoc(ref, { correctCount: 10 }));
    });
  });

  describe('checkpoints', () => {
    it('creates and reads a valid checkpoint for its path owner', async () => {
      const db = as(ALICE);
      const ref = doc(db, 'users', ALICE, 'checkpoints', 'course-geography');
      await assertSucceeds(setDoc(ref, validCheckpoint('course-geography')));
      await assertSucceeds(getDoc(ref));
    });

    it("denies another user reading or writing a user's checkpoint", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'users', ALICE, 'checkpoints', 'course-geography'),
          validCheckpoint('course-geography'),
        );
      });
      const ref = doc(as(BOB), 'users', ALICE, 'checkpoints', 'course-geography');
      await assertFails(getDoc(ref));
      await assertFails(setDoc(ref, validCheckpoint('course-geography')));
    });

    it('requires courseId to match the checkpoint document id', async () => {
      await assertFails(
        setDoc(
          doc(as(ALICE), 'users', ALICE, 'checkpoints', 'course-geography'),
          validCheckpoint('course-history'),
        ),
      );
    });

    it('rejects a checkpoint outside its non-empty integer bounds', async () => {
      const ref = doc(as(ALICE), 'users', ALICE, 'checkpoints', 'course-geography');
      await assertFails(setDoc(ref, { ...validCheckpoint('course-geography'), index: -1 }));
      await assertFails(setDoc(ref, { ...validCheckpoint('course-geography'), total: 0, index: 0 }));
      await assertFails(setDoc(ref, { ...validCheckpoint('course-geography'), index: 3 }));
      await assertFails(setDoc(ref, { ...validCheckpoint('course-geography'), index: 1.5 }));
    });

    it('requires a server timestamp on creation and every update', async () => {
      const db = as(ALICE);
      const ref = doc(db, 'users', ALICE, 'checkpoints', 'course-geography');
      await assertFails(
        setDoc(ref, {
          ...validCheckpoint('course-geography'),
          updatedAt: new Date('2026-08-24T00:00:00.000Z'),
        }),
      );
      await assertSucceeds(setDoc(ref, validCheckpoint('course-geography')));
      await assertFails(updateDoc(ref, { index: 2 }));
      await assertSucceeds(updateDoc(ref, { index: 2, updatedAt: serverTimestamp() }));
    });

    it('allows the owner to delete a checkpoint', async () => {
      const db = as(ALICE);
      const ref = doc(db, 'users', ALICE, 'checkpoints', 'course-geography');
      await setDoc(ref, validCheckpoint('course-geography'));
      await assertSucceeds(deleteDoc(ref));
    });
  });

  describe('checkpoint sync config (createSyncedStore integration)', () => {
    it('writes the production checkpoint payload to users/{uid}/checkpoints/{courseId}', async () => {
      const db = as(ALICE);
      const checkpoint = { id: 'course-geography', index: 1, total: 3, updatedAt: Date.now() };
      const payload = toFirestorePayload(checkpoint, 'set', ALICE, CHECKPOINT_FIELD);
      const ref = doc(db, 'users', ALICE, 'checkpoints', checkpoint.id);

      await assertSucceeds(setDoc(ref, materialize(payload)));
      const snap = await getDoc(ref);
      expect(snap.data()?.courseId).toBe(checkpoint.id);
      expect(typeof snap.data()?.updatedAt?.toMillis).toBe('function');
      expect(snap.data()?.ownerId).toBeUndefined();
    });
  });

  describe('courses', () => {
    it('creates a course owned by the caller', async () => {
      await assertSucceeds(
        setDoc(
          doc(as(ALICE), 'users', ALICE, 'courses', 'course-1'),
          validCourse('course-1', ALICE),
        ),
      );
    });

    it("denies creating a course under another user's path", async () => {
      await assertFails(
        setDoc(
          doc(as(BOB), 'users', ALICE, 'courses', 'course-1'),
          validCourse('course-1', ALICE),
        ),
      );
    });

    it('rejects a title that is not uppercase', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'users', ALICE, 'courses', 'course-1'), {
          ...validCourse('course-1', ALICE),
          title: 'Biology',
        }),
      );
    });

    it('rejects an unknown game type', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'users', ALICE, 'courses', 'course-1'), {
          ...validCourse('course-1', ALICE),
          gameType: 'flashcards',
        }),
      );
    });

    it('denies handing a course to another user', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'users', ALICE, 'courses', 'course-1'),
          validCourse('course-1', ALICE),
        );
      });
      await assertFails(
        updateDoc(doc(as(ALICE), 'users', ALICE, 'courses', 'course-1'), {
          ownerId: BOB,
        }),
      );
    });

    it('protects a seeded course from being renamed or deleted', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'users', ALICE, 'courses', 'course-seed'),
          { ...validCourse('course-seed', ALICE), seeded: true },
        );
      });
      const db = as(ALICE);
      await assertFails(
        updateDoc(doc(db, 'users', ALICE, 'courses', 'course-seed'), {
          title: 'CHEMISTRY',
        }),
      );
      await assertFails(
        deleteDoc(doc(db, 'users', ALICE, 'courses', 'course-seed')),
      );
    });

    // Seeded course ids are the bare slug with no random suffix (see
    // seedCourses in course-rules.ts), so every account's "biology" seed
    // carries the exact same id. This is the whole reason courses moved
    // under users/{userId}: in a root-level collection, the second user to
    // sync would hit `allow update` against a document owned by the first
    // and lose the course to a permission error.
    it('lets two different users each hold their own biology course without collision', async () => {
      await assertSucceeds(
        setDoc(
          doc(as(ALICE), 'users', ALICE, 'courses', 'biology'),
          validCourse('biology', ALICE),
        ),
      );
      await assertSucceeds(
        setDoc(
          doc(as(BOB), 'users', BOB, 'courses', 'biology'),
          validCourse('biology', BOB),
        ),
      );
    });
  });

  /**
   * These tests run the production course config through the real adapter
   * against the emulator. The import-time mocks above only prevent the
   * unrelated app singleton from connecting while this suite loads.
   */
  describe('courses sync config (createSyncedStore integration)', () => {
    it('writes a freshly-created course through the real adapter and lands it at users/{uid}/courses/{courseId}', async () => {
      const db = as(ALICE);
      const course: Course = {
        id: 'course-adapter',
        title: 'BIOLOGY',
        gameType: 'trueFalseDuel',
        seeded: false,
        createdAt: Date.now(),
      };

      const payload = toFirestorePayload(course, 'set', ALICE, COURSE_FIELD);
      const ref = doc(db, 'users', ALICE, 'courses', course.id);
      await assertSucceeds(setDoc(ref, materialize(payload)));

      const snap = await getDoc(ref);
      const data = snap.data();
      expect(data?.courseId).toBe('course-adapter');
      expect(data?.ownerId).toBe(ALICE);
      // A client-supplied createdAt (a plain millis number) must never reach
      // Firestore on create — toFirestorePayload has to replace it with the
      // serverTimestamp() marker or isServerTime('createdAt') denies the
      // write outright, which the assertSucceeds above already proves; this
      // also checks the stored value round-trips as a real Timestamp.
      expect(typeof data?.createdAt?.toMillis).toBe('function');
    });

    it("materialises every seed remotely on a fresh sign-in — the same toUpload list store.ts's Firestore listener enqueues from its first, empty snapshot", async () => {
      const db = as(ALICE);
      const seeds = seedCourses([
        { title: 'Biology', gameType: 'trueFalseDuel' },
        { title: 'History', gameType: 'sequenceSwipe' },
        { title: 'Geography', gameType: 'matchRelease' },
        { title: 'Visual Culture', gameType: 'compassQuiz' },
      ]);

      // Empty remote collection, exactly what a brand-new account has.
      // reconcile() is the exact function store.ts's onSnapshot callback
      // calls on the very first snapshot it ever receives.
      const { toUpload } = reconcile(seeds, {}, []);
      expect(toUpload).toHaveLength(4);

      for (const seed of toUpload) {
        // Seeds carry createdAt: 0 (see seedCourses in course-rules.ts) —
        // the exact value the adapter's 'onCreate' branch exists to
        // override, so it is worth proving against the real rules rather
        // than trusting adapter.test.ts's fixtures alone.
        expect(seed.createdAt).toBe(0);
        const payload = toFirestorePayload(seed, 'set', ALICE, COURSE_FIELD);
        await assertSucceeds(
          setDoc(doc(db, 'users', ALICE, 'courses', seed.id), materialize(payload)),
        );
      }

      const snap = await getDocs(collection(db, 'users', ALICE, 'courses'));
      expect(snap.docs.map((d) => d.id).sort()).toEqual([
        'biology',
        'geography',
        'history',
        'visual-culture',
      ]);
    });

    it('edits an already-synced course without disturbing createdAt — unchanged(createdAt) holds against a real Timestamp, not a millis approximation', async () => {
      const db = as(ALICE);
      const course: Course = {
        id: 'course-edit',
        title: 'HISTORY',
        gameType: 'sequenceSwipe',
        seeded: false,
        createdAt: Date.now(),
      };
      const ref = doc(db, 'users', ALICE, 'courses', course.id);
      await setDoc(ref, materialize(toFirestorePayload(course, 'set', ALICE, COURSE_FIELD)));

      const edited: Course = { ...course, gameType: 'matchRelease' };
      const updatePayload = toFirestorePayload(edited, 'update', ALICE, COURSE_FIELD);
      // The adapter's contract for an 'onCreate' field on an update: omit it
      // entirely rather than resend the client's local, millis-precision
      // copy — which is what firestore.rules' unchanged() compares against
      // as a Timestamp.
      expect('createdAt' in updatePayload).toBe(false);

      await assertSucceeds(updateDoc(ref, materialize(updatePayload)));
      const snap = await getDoc(ref);
      expect(snap.data()?.gameType).toBe('matchRelease');
    });
  });

  describe('decks', () => {
    it('creates a deck owned by the caller', async () => {
      await assertSucceeds(
        setDoc(doc(as(ALICE), 'decks', 'deck-1'), validDeck('deck-1', ALICE)),
      );
    });

    it("denies reading another user's deck", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'decks', 'deck-1'),
          validDeck('deck-1', ALICE),
        );
      });
      await assertFails(getDoc(doc(as(BOB), 'decks', 'deck-1')));
    });

    it('rejects a manual deck that claims an upload', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'decks', 'deck-1'), {
          ...validDeck('deck-1', ALICE),
          sourceType: 'manual',
          uploadId: 'upload-1',
        }),
      );
    });

    it('rejects an uploaded deck with no provenance', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'decks', 'deck-1'), {
          ...validDeck('deck-1', ALICE),
          sourceType: 'upload',
          uploadId: null,
        }),
      );
    });
  });

  describe('deck sync config (createSyncedStore integration)', () => {
    it('writes expandDeck’s parent before its cards, then reads the real production payloads back', async () => {
      const db = as(ALICE);
      const deck = deckForSyncProof();
      const [deckOp, ...cardOps] = expandDeck(deck, ALICE, {});

      expect(deckOp).toMatchObject({ collection: 'decks', docId: deck.id, kind: 'set' });
      expect(cardOps).toHaveLength(deck.cards.length);

      // The first card uses the exact payload expandDeck built from CARD_FIELD.
      // Without the already-committed parent, deckOwner() in firestore.rules
      // cannot authorize this child write.
      const firstCard = cardOps[0];
      await assertFails(
        setDoc(
          doc(db, firstCard.collection, firstCard.docId),
          materialize(firstCard.payload),
        ),
      );

      await assertSucceeds(
        setDoc(doc(db, deckOp.collection, deckOp.docId), materialize(deckOp.payload)),
      );
      for (const cardOp of cardOps) {
        await assertSucceeds(
          setDoc(
            doc(db, cardOp.collection, cardOp.docId),
            materialize(cardOp.payload),
          ),
        );
      }

      const deckSnap = await getDoc(doc(db, 'decks', deck.id));
      expect(deckSnap.data()?.[DECK_FIELD.idField]).toBe(deck.id);
      expect(deckSnap.data()?.cardCount).toBe(deck.cards.length);
      expect(deckSnap.data()?.sourceName).toBeUndefined();

      const cards = await getDocs(collection(db, 'decks', deck.id, 'cards'));
      expect(cards.docs.map((card) => card.data()?.[CARD_FIELD.idField]).sort()).toEqual([
        'card-sync-1',
        'card-sync-2',
      ]);
      expect(cards.docs.every((card) => card.data()?.deckId === deck.id)).toBe(true);
    });
  });

  describe('cards', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'decks', 'deck-1'),
          validDeck('deck-1', ALICE),
        );
      });
    });

    it("lets the parent deck's owner add a card", async () => {
      await assertSucceeds(
        setDoc(
          doc(as(ALICE), 'decks', 'deck-1', 'cards', 'card-1'),
          validCard('card-1', 'deck-1'),
        ),
      );
    });

    it('denies a card write from anyone else', async () => {
      await assertFails(
        setDoc(
          doc(as(BOB), 'decks', 'deck-1', 'cards', 'card-1'),
          validCard('card-1', 'deck-1'),
        ),
      );
    });

    it('rejects a difficulty outside 1 to 3', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'decks', 'deck-1', 'cards', 'card-1'), {
          ...validCard('card-1', 'deck-1'),
          difficulty: 4,
        }),
      );
    });

    it('rejects an unknown game type', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'decks', 'deck-1', 'cards', 'card-1'), {
          ...validCard('card-1', 'deck-1'),
          gameType: 'flashcards',
        }),
      );
    });

    /**
     * Settles the question of whether a deck and its first card can be
     * created in one writeBatch. They cannot: Firestore evaluates every
     * write in a batch against the state as it stood before the batch
     * started, not against the sibling writes committing alongside it. The
     * card rule's `deckOwner()` calls `get()` on the parent deck, and at
     * evaluation time that deck does not exist yet — the batch has not
     * committed — so the get() resolves to a non-existent document and the
     * card write is denied, which fails the whole (atomic) batch, deck
     * included.
     *
     * The consequence for the client: a deck and its cards can never be
     * created in a single batch. The deck write has to be sent and awaited
     * first, and only once it has committed can the cards — batched or not
     * — be written, because that is the only order in which `deckOwner()`
     * has anything to read.
     */
    it('denies a card created in the same writeBatch as its brand-new parent deck', async () => {
      const db = as(ALICE);
      const batch = writeBatch(db);
      batch.set(doc(db, 'decks', 'deck-batch'), validDeck('deck-batch', ALICE));
      batch.set(
        doc(db, 'decks', 'deck-batch', 'cards', 'card-1'),
        validCard('card-1', 'deck-batch'),
      );
      await assertFails(batch.commit());
    });

    it('succeeds when the deck is created and awaited before the card is written', async () => {
      const db = as(ALICE);
      await assertSucceeds(
        setDoc(doc(db, 'decks', 'deck-seq'), validDeck('deck-seq', ALICE)),
      );
      await assertSucceeds(
        setDoc(
          doc(db, 'decks', 'deck-seq', 'cards', 'card-1'),
          validCard('card-1', 'deck-seq'),
        ),
      );
    });
  });

  describe('uploads', () => {
    it('opens a pending job', async () => {
      await assertSucceeds(
        setDoc(
          doc(as(ALICE), 'uploads', 'upload-1'),
          validUpload('upload-1', ALICE),
        ),
      );
    });

    it('denies opening a job that claims to be finished', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'uploads', 'upload-1'), {
          ...validUpload('upload-1', ALICE),
          status: 'done',
          deckId: 'deck-1',
          cardsGenerated: 20,
        }),
      );
    });

    it('accepts an explicit game template and bounded positive card target', async () => {
      await assertSucceeds(
        setDoc(doc(as(ALICE), 'uploads', 'upload-1'), {
          ...validUpload('upload-1', ALICE),
          template: 'matchRelease',
          cardTarget: 1,
        }),
      );
    });

    it('denies an unknown template or card target outside the upload limit', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'uploads', 'upload-unknown-template'), {
          ...validUpload('upload-unknown-template', ALICE),
          template: 'madeUpTemplate',
        }),
      );
      await assertFails(
        setDoc(doc(as(ALICE), 'uploads', 'upload-zero-cards'), {
          ...validUpload('upload-zero-cards', ALICE),
          cardTarget: 0,
        }),
      );
      await assertFails(
        setDoc(doc(as(ALICE), 'uploads', 'upload-too-many-cards'), {
          ...validUpload('upload-too-many-cards', ALICE),
          cardTarget: 21,
        }),
      );
      await assertFails(
        setDoc(doc(as(ALICE), 'uploads', 'upload-fractional-cards'), {
          ...validUpload('upload-fractional-cards', ALICE),
          cardTarget: 1.5,
        }),
      );
    });

    it('denies a storage path outside the caller’s own folder', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'uploads', 'upload-1'), {
          ...validUpload('upload-1', ALICE),
          storagePath: `uploads/${BOB}/upload-1`,
        }),
      );
    });

    it('denies the client updating the job record', async () => {
      await setDoc(
        doc(as(ALICE), 'uploads', 'upload-1'),
        validUpload('upload-1', ALICE),
      );
      await assertFails(
        updateDoc(doc(as(ALICE), 'uploads', 'upload-1'), { status: 'done' }),
      );
    });
  });

  describe('unauthenticated access', () => {
    it('is denied everywhere', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(db, 'users', ALICE)));
      await assertFails(getDoc(doc(db, 'users', ALICE, 'courses', 'course-1')));
      await assertFails(getDoc(doc(db, 'decks', 'deck-1')));
      await assertFails(getDoc(doc(db, 'uploads', 'upload-1')));
    });
  });
});
