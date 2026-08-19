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
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

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
    deckId: 'deck-1',
    startedAt: serverTimestamp(),
    endedAt: null,
    correctCount: 0,
    wrongCount: 0,
    passedCount: 0,
    bestStreakInSession: 0,
    gameTypesPlayed: [],
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

function validUpload(uploadId: string, ownerId: string) {
  return {
    uploadId,
    ownerId,
    fileName: 'revision-notes.pdf',
    fileType: 'pdf',
    storagePath: `uploads/${ownerId}/${uploadId}`,
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

    it('refuses to reopen a closed session', async () => {
      const db = as(ALICE);
      const ref = doc(db, 'users', ALICE, 'sessions', 'session-1');
      await setDoc(ref, validSession('session-1'));
      await assertSucceeds(updateDoc(ref, { endedAt: serverTimestamp() }));

      await assertFails(updateDoc(ref, { correctCount: 10 }));
    });
  });

  describe('courses', () => {
    it('creates a course owned by the caller', async () => {
      await assertSucceeds(
        setDoc(
          doc(as(ALICE), 'courses', 'course-1'),
          validCourse('course-1', ALICE),
        ),
      );
    });

    it('denies creating a course owned by someone else', async () => {
      await assertFails(
        setDoc(
          doc(as(BOB), 'courses', 'course-1'),
          validCourse('course-1', ALICE),
        ),
      );
    });

    it('rejects a title that is not uppercase', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'courses', 'course-1'), {
          ...validCourse('course-1', ALICE),
          title: 'Biology',
        }),
      );
    });

    it('rejects an unknown game type', async () => {
      await assertFails(
        setDoc(doc(as(ALICE), 'courses', 'course-1'), {
          ...validCourse('course-1', ALICE),
          gameType: 'flashcards',
        }),
      );
    });

    it('denies handing a course to another user', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'courses', 'course-1'),
          validCourse('course-1', ALICE),
        );
      });
      await assertFails(
        updateDoc(doc(as(ALICE), 'courses', 'course-1'), { ownerId: BOB }),
      );
    });

    it('protects a seeded course from being renamed or deleted', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'courses', 'course-seed'), {
          ...validCourse('course-seed', ALICE),
          seeded: true,
        });
      });
      const db = as(ALICE);
      await assertFails(
        updateDoc(doc(db, 'courses', 'course-seed'), { title: 'CHEMISTRY' }),
      );
      await assertFails(deleteDoc(doc(db, 'courses', 'course-seed')));
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
      await assertFails(getDoc(doc(db, 'courses', 'course-1')));
      await assertFails(getDoc(doc(db, 'decks', 'deck-1')));
      await assertFails(getDoc(doc(db, 'uploads', 'upload-1')));
    });
  });
});
