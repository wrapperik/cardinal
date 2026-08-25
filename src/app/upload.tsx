import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useReducer, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { BottomSheet, type BottomSheetHandle } from "@/components/bottom-sheet";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Colors, Fonts, Spacing, Theme } from "@/constants/theme";
import { useReducedMotion } from "@/lib/accessibility";
import { notification, NotificationFeedbackType } from "@/lib/haptics";
import { normaliseTitle } from "@/features/upload/course-rules";
import { addCourse, adoptRemoteCourse, courseById, deleteCourse, useCourses } from "@/features/upload/courses";
import { adoptRemoteDeck, deleteDeck, moveDeckToCourse, saveDeck } from "@/features/upload/decks";
import { DestinationPicker } from "@/features/upload/destination-picker";
import {
  dropsCanonicalCourse,
  PENDING_COURSE_ID,
  planDiscard,
  planSave,
  type SaveDestination,
  type UploadDraft,
} from "@/features/upload/draft-rules";
import { clearDraftIds, setDraftIds } from "@/features/upload/drafts";
import { activeProvider, extractCards } from "@/features/upload/extract";
import { formatBytes, pickDocument } from "@/features/upload/picker";
import { SwipeAction } from "@/features/upload/swipe-action";
import { extractionStatus } from "@/features/upload/status-messages";
import { TEMPLATE_LABELS } from "@/features/upload/template-picker";
import type {
  Course,
  ExtractionResult,
  ExtractionPhase,
  PickedFile,
} from "@/features/upload/types";
import type { CardContent, GameType } from "@/types/cardinal";

/**
 * Roughly how many cards a provider should aim for. Enough for a full study
 * session without turning a two-page handout into fifty near-duplicate
 * cards — providers treat this as a target, not a hard cap.
 */
const CARD_TARGET = 20;

/* -------------------------------------------------------------------------- */
/* Session state                                                              */
/* -------------------------------------------------------------------------- */

interface UploadState {
  stage:
    | "idle"
    | "picked"
    | "extracting"
    | "review"
    | "saving"
    | "saved"
    | "failed";
  file: PickedFile | null;
  pickError: string | null;
  /** The user's own choice. Null means "let the model decide" — distinct
   *  from having chosen nothing yet, which is the same value but read
   *  differently depending on stage (optional at `picked`, a real decision
   *  once `review` has a suggestion to fall back to instead). */
  destinationId: string | null;
  /**
   * A course the user has named but that does not exist yet. It is created
   * for real only when the upload is confirmed, so until then it lives here
   * and in the picker rather than in the library.
   */
  pendingCourseTitle: string | null;
  progress: number;
  phase: ExtractionPhase;
  result: ExtractionResult | null;
  error: string | null;
  savedCourseTitle: string | null;
  savedCourseId: string | null;
  savedCount: number;
}

const initialState: UploadState = {
  stage: "idle",
  file: null,
  pickError: null,
  destinationId: null,
  pendingCourseTitle: null,
  progress: 0,
  phase: "uploading",
  result: null,
  error: null,
  savedCourseTitle: null,
  savedCourseId: null,
  savedCount: 0,
};

type Action =
  | { type: "pickBegin" }
  | { type: "picked"; file: PickedFile }
  | { type: "pickFailed"; message: string }
  | { type: "setDestination"; id: string }
  | { type: "setPendingCourse"; title: string }
  | { type: "extractStart" }
  | { type: "extractProgress"; fraction: number; phase: ExtractionPhase }
  | { type: "extractSuccess"; result: ExtractionResult }
  | { type: "extractFailed"; message: string }
  | { type: "dropCard"; index: number }
  | { type: "retry" }
  | { type: "saveStart" }
  | { type: "saveSuccess"; courseTitle: string; courseId: string; count: number }
  | { type: "reset" };

function reducer(state: UploadState, action: Action): UploadState {
  switch (action.type) {
    case "pickBegin":
      return { ...state, pickError: null };
    case "picked":
      return { ...state, stage: "picked", file: action.file, pickError: null };
    case "pickFailed":
      return { ...state, pickError: action.message };
    case "setDestination":
      // Choosing a real course abandons a name typed earlier, so the picker
      // stops offering a pending course nothing points at any more.
      return {
        ...state,
        destinationId: action.id,
        pendingCourseTitle: action.id === PENDING_COURSE_ID ? state.pendingCourseTitle : null,
      };
    case "setPendingCourse":
      return { ...state, pendingCourseTitle: action.title, destinationId: PENDING_COURSE_ID };
    case "extractStart":
      return { ...state, stage: "extracting", progress: 0, phase: "uploading" };
    case "extractProgress":
      return { ...state, progress: action.fraction, phase: action.phase };
    case "extractSuccess":
      return { ...state, stage: "review", result: action.result };
    case "extractFailed":
      return { ...state, stage: "failed", error: action.message };
    case "dropCard":
      return state.result
        ? { ...state, result: { ...state.result, cards: state.result.cards.filter((_, index) => index !== action.index) } }
        : state;
    case "retry":
      return { ...state, stage: "picked", error: null };
    case "saveStart":
      return { ...state, stage: "saving" };
    case "saveSuccess":
      return {
        ...state,
        stage: "saved",
        savedCourseTitle: action.courseTitle,
        savedCourseId: action.courseId,
        savedCount: action.count,
      };
    case "reset":
      return initialState;
    default:
      return state;
  }
}

/** The count each gameType shows up with most often wins. A course created
 *  from an "auto" upload still needs some default template to open into
 *  from the home screen, and the cards themselves are the only signal for
 *  what that should be. */
function majorityGameType(cards: CardContent[]): GameType {
  const counts = new Map<GameType, number>();
  for (const card of cards) counts.set(card.gameType, (counts.get(card.gameType) ?? 0) + 1);
  let best: GameType = "compassQuiz";
  let bestCount = 0;
  for (const [gameType, count] of counts) {
    if (count > bestCount) {
      best = gameType;
      bestCount = count;
    }
  }
  return best;
}

function countByTemplate(cards: CardContent[]): { gameType: GameType; count: number }[] {
  const counts = new Map<GameType, number>();
  for (const card of cards) counts.set(card.gameType, (counts.get(card.gameType) ?? 0) + 1);
  return Array.from(counts.entries()).map(([gameType, count]) => ({ gameType, count }));
}

function cardPreview(card: CardContent): string {
  switch (card.gameType) {
    case "compassQuiz": return card.payload.question;
    case "trueFalseDuel": return card.payload.statement;
    case "sequenceSwipe": return card.payload.prompt;
    case "matchRelease": return card.payload.prompt;
  }
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The upload flow, presented as a hand-rolled bottom sheet. Reached from
 * home by holding the plus icon, optionally pointed at a specific course —
 * the old imperative `open(courseId)` call is a route param here instead,
 * seeded into the reducer once on mount.
 */
export default function Upload() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const courses = useCourses();

  const [state, dispatch] = useReducer(reducer, initialState);
  const [discardIntent, setDiscardIntent] = useState<"reset" | "leave" | null>(null);
  const extraction = useRef<AbortController | null>(null);
  const sheet = useRef<BottomSheetHandle>(null);
  // Study/Done both need to navigate the *host* route (home), not this
  // transparent modal — firing that navigation before the sheet has closed
  // would push it in behind the still-visible sheet. So the desired
  // navigation is stashed here and only run from the sheet's `onClosed`,
  // once the close animation has actually landed off screen.
  const afterClose = useRef<(() => void) | null>(null);
  // What the extraction Function has already written for this upload. Held in
  // a ref rather than reducer state because it is not rendered — it exists so
  // the flow can hand these records to the library on save, or take them back
  // out of Firestore on discard.
  const draft = useRef<UploadDraft | null>(null);
  // The library as it stood before this upload began. Read once, at extract
  // time, so "did the model file the cards under a course I already had?"
  // cannot be answered by the very course the Function just created — the
  // listener may well have delivered it before the user reaches review.
  const knownCourseIds = useRef<ReadonlySet<string>>(new Set());

  /**
   * Gives back everything this upload staged. The deck the Function wrote is
   * always removed; the course only when the upload is what created it. Both
   * are adopted first so the store has a record to delete — a remote document
   * the local cache has never seen would otherwise be dropped silently here
   * and arrive again on the next snapshot.
   */
  function discardDraft() {
    const { deck, course } = planDiscard(draft.current);
    draft.current = null;
    clearDraftIds();
    if (deck) {
      adoptRemoteDeck(deck);
      deleteDeck(deck.id);
    }
    if (course) {
      adoptRemoteCourse(course);
      deleteCourse(course.id);
    }
  }

  // The grabber's drag-to-dismiss and the discard dialog both funnel through
  // here rather than closing directly, so a swipe that would drop
  // in-progress extraction gets the same confirmation the old BACK button
  // required.
  function attemptClose() {
    if (state.stage === "idle" || state.stage === "saved") {
      sheet.current?.close();
    } else {
      setDiscardIntent("leave");
    }
  }

  useEffect(() => {
    if (courseId) dispatch({ type: "setDestination", id: courseId });
    // Deliberately once-at-mount, mirroring what the old `open(courseId)`
    // did on the sheet: seed the destination exactly once, not every time
    // the param happens to be present on a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fires exactly once per arrival at `failed`, not on every re-render the
  // stage happens to produce while the message is on screen.
  useEffect(() => {
    if (state.stage === "failed") {
      notification(NotificationFeedbackType.Warning);
    }
  }, [state.stage]);

  useEffect(() => {
    if (state.stage === "saved") notification(NotificationFeedbackType.Success);
  }, [state.stage]);

  // The one place every abandoned upload passes through. Discard, a dismissed
  // sheet and a route popped some other way all end in this unmount, and a
  // saved upload has already cleared the ref, so this cleans up exactly the
  // uploads nobody confirmed.
  // Mount/unmount only: discardDraft reads refs and module state, so it never
  // goes stale, and a dependency here would re-arm the cleanup every render.
  useEffect(() => {
    return () => discardDraft();
  }, []);

  async function handlePick() {
    dispatch({ type: "pickBegin" });
    const outcome = await pickDocument();
    if (outcome.ok) {
      dispatch({ type: "picked", file: outcome.file });
      return;
    }
    // A cancelled picker is not a failure — the user just changed their
    // mind, so the row resets silently instead of showing an error.
    if (outcome.reason === "cancelled") return;
    dispatch({ type: "pickFailed", message: outcome.message });
  }

  async function handleExtract() {
    if (!state.file) return;
    // Extracting again abandons whatever the previous attempt staged — a
    // second run must not strand the first run's course and deck in Firestore.
    discardDraft();
    const controller = new AbortController();
    extraction.current = controller;
    knownCourseIds.current = new Set(courses.map((course) => course.id));
    dispatch({ type: "extractStart" });
    const outcome = await extractCards(
      {
        file: state.file,
        // The picker is gone — the model always chooses the card type now.
        template: "auto",
        // Seeded courses are the shipped demo decks and can't take uploads,
        // so the model is never even shown them as a place to file cards.
        courses: courses.filter((course) => !course.seeded).map((course) => ({ id: course.id, title: course.title })),
        cardTarget: CARD_TARGET,
        signal: controller.signal,
      },
      ({ fraction, phase }) => dispatch({ type: "extractProgress", fraction, phase }),
    );
    if (controller.signal.aborted) return;
    if (outcome.ok) {
      const { canonicalCourse, canonicalDeck } = outcome.result;
      if (canonicalCourse && canonicalDeck) {
        // These are already in Firestore, and the collection listeners will
        // hand them to the library within seconds. Claiming them keeps both
        // out of the course pills until this upload is confirmed.
        draft.current = {
          course: canonicalCourse,
          deck: canonicalDeck,
          courseExisted: knownCourseIds.current.has(canonicalCourse.id),
        };
        setDraftIds([canonicalCourse.id, canonicalDeck.id]);
      }
      dispatch({ type: "extractSuccess", result: outcome.result });
    } else {
      dispatch({ type: "extractFailed", message: outcome.message });
    }
  }

  function handleCancel() {
    extraction.current?.abort();
    extraction.current = null;
    dispatch({ type: "retry" });
  }

  function handleSave() {
    if (!state.result) return;
    if (state.result.cards.length === 0) {
      dispatch({ type: "extractFailed", message: "COULDN'T FIND CARDS IN THAT" });
      return;
    }

    if (state.result.provider === "gemini") {
      const { canonicalDeck, canonicalCourse } = state.result;
      if (!canonicalDeck || !canonicalCourse) {
        dispatch({ type: "extractFailed", message: "THE CLOUD DECK WASN'T READY" });
        return;
      }
      dispatch({ type: "saveStart" });
      // The Function has already written these records. Adopting them gives
      // the app an immediate local view without sending a second deck back
      // through the sync outbox.
      adoptRemoteCourse(canonicalCourse);
      adoptRemoteDeck(canonicalDeck);
      const staged = draft.current ?? {
        course: canonicalCourse,
        deck: canonicalDeck,
        courseExisted: knownCourseIds.current.has(canonicalCourse.id),
      };
      const destination = planSave({
        destinationId: state.destinationId,
        pendingTitle: state.pendingCourseTitle,
        fallbackCourseId: canonicalCourse.id,
        fallbackTitle: state.result.suggestedTitle,
      });
      const course = resolveDestination(
        destination,
        canonicalCourse,
        canonicalDeck.cards,
        state.result.suggestedTitle,
      );
      if (course.id !== canonicalCourse.id) {
        moveDeckToCourse(canonicalDeck.id, course.id);
        // When the Function created a brand-new course solely for this deck,
        // correcting the destination should not leave that empty AI guess in
        // the library. Existing courses are never removed here.
        if (dropsCanonicalCourse(destination, staged)) deleteCourse(canonicalCourse.id);
      }
      // Confirmed: these records are no longer this screen's to clean up, and
      // the library is free to show them.
      draft.current = null;
      clearDraftIds();
      dispatch({
        type: "saveSuccess",
        courseTitle: course.title,
        courseId: course.id,
        count: canonicalDeck.cards.length,
      });
      return;
    }

    dispatch({ type: "saveStart" });

    const destination = planSave({
      destinationId: state.destinationId,
      pendingTitle: state.pendingCourseTitle,
      fallbackCourseId: state.result.suggestedCourseId,
      fallbackTitle: state.result.suggestedTitle,
    });
    const course = resolveDestination(destination, null, state.result.cards, state.result.suggestedTitle);

    const deck = saveDeck({
      courseId: course.id,
      title: state.result.suggestedTitle,
      sourceName: state.file?.name ?? "",
      cards: state.result.cards,
      provider: state.result.provider,
    });

    dispatch({ type: "saveSuccess", courseTitle: course.title, courseId: course.id, count: deck.cards.length });
  }

  /**
   * Turns a planned destination into a real course. This is the only place the
   * upload flow writes one: a title typed at the start of the flow is carried
   * as a pending name until here, so an upload that is never confirmed leaves
   * nothing behind. A brand new course is seeded with whatever template the
   * cards mostly turned out to be rather than always defaulting to compassQuiz.
   */
  function resolveDestination(
    destination: SaveDestination,
    canonical: Course | null,
    cards: CardContent[],
    fallbackTitle: string,
  ): Course {
    if (destination.kind === "new") return addCourse(destination.title, majorityGameType(cards));
    if (canonical && destination.courseId === canonical.id) return canonical;
    // A chosen course can have been deleted from another screen while the
    // sheet was open; the model's own answer is a better landing place for
    // the cards than dropping the save on the floor.
    return courseById(destination.courseId) ?? canonical ?? addCourse(fallbackTitle, majorityGameType(cards));
  }

  // A pending course is offered alongside the real ones so the picker can show
  // it as selected. It is a display-only stand-in — nothing in the library
  // answers to PENDING_COURSE_ID until the upload is confirmed.
  const offeredCourses = state.pendingCourseTitle
    ? [
        ...courses,
        {
          id: PENDING_COURSE_ID,
          title: normaliseTitle(state.pendingCourseTitle),
          gameType: "compassQuiz" as GameType,
          seeded: false,
          createdAt: 0,
        },
      ]
    : courses;

  return (
    <BottomSheet
      ref={sheet}
      onRequestClose={attemptClose}
      onClosed={() => {
        const pending = afterClose.current;
        afterClose.current = null;
        router.back();
        if (pending) pending();
      }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          paddingBottom: insets.bottom + Spacing.lg,
        }}
      >
        <Text style={styles.heading}>UPLOAD</Text>

        <View style={styles.body}>
          {state.stage === "idle" && (
            <IdleStage error={state.pickError} onPick={handlePick} />
          )}

          {state.stage === "picked" && state.file && (
            <PickedStage
              file={state.file}
              courses={offeredCourses}
              destinationId={state.destinationId}
              onDestinationSelect={(id) => dispatch({ type: "setDestination", id })}
              onDestinationCreate={(title) => dispatch({ type: "setPendingCourse", title })}
              onExtract={handleExtract}
            />
          )}

          {state.stage === "extracting" && state.file && (
            <ExtractingStage file={state.file} progress={state.progress} phase={state.phase} onCancel={handleCancel} />
          )}

          {state.stage === "review" && state.result && (
            <ReviewStage
              result={state.result}
              courses={offeredCourses}
              destinationId={state.destinationId}
              onDestinationSelect={(id) => dispatch({ type: "setDestination", id })}
              onDestinationCreate={(title) => dispatch({ type: "setPendingCourse", title })}
              onSave={handleSave}
              onDropCard={(index) => dispatch({ type: "dropCard", index })}
              onDiscard={() => setDiscardIntent("reset")}
            />
          )}

          {state.stage === "saving" && <SavedStage courseTitle={null} count={0} saving />}
          {state.stage === "saved" && (
            <SavedStage
              courseTitle={state.savedCourseTitle}
              count={state.savedCount}
              onStudy={() => {
                // `push`, not `replace` — by the time this runs the sheet
                // route is already popped, so the game pushes normally onto
                // home instead of standing in for the route that just left.
                afterClose.current = () =>
                  router.push({ pathname: "/recap", params: { courseId: state.savedCourseId ?? "" } });
                sheet.current?.close();
              }}
              onDone={() => sheet.current?.close()}
            />
          )}

          {state.stage === "failed" && (
            <FailedStage
              message={state.error}
              onRetry={() => dispatch({ type: "retry" })}
              onStartOver={() => setDiscardIntent("reset")}
            />
          )}
        </View>
      </ScrollView>

      <ConfirmationDialog
        visible={discardIntent !== null}
        title="DISCARD UPLOAD?"
        message="Your selected file and extracted cards will be cleared."
        confirmLabel="DISCARD"
        onCancel={() => setDiscardIntent(null)}
        onConfirm={() => {
          const intent = discardIntent;
          extraction.current?.abort();
          extraction.current = null;
          setDiscardIntent(null);
          // Takes the Function's course and deck back out of Firestore. The
          // unmount cleanup would catch a "leave", but a "reset" keeps the
          // sheet open on a fresh upload, so the discard happens here for both.
          discardDraft();
          dispatch({ type: "reset" });
          if (intent === "leave") sheet.current?.close();
        }}
      />
    </BottomSheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Stages                                                                     */
/* -------------------------------------------------------------------------- */

function IdleStage({ error, onPick }: { error: string | null; onPick: () => void }) {
  return (
    <View style={styles.stageGap}>
      <Text style={styles.copy}>PDF IN, CARDS OUT</Text>
      <SwipeAction label="CHOOSE A FILE" hint="SWIPE RIGHT" onConfirm={onPick} />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

function PickedStage({
  file,
  courses,
  destinationId,
  onDestinationSelect,
  onDestinationCreate,
  onExtract,
}: {
  file: PickedFile;
  courses: Course[];
  destinationId: string | null;
  onDestinationSelect: (id: string) => void;
  onDestinationCreate: (title: string) => void;
  onExtract: () => void;
}) {
  return (
    <View style={styles.stageGap}>
      <View>
        <Text style={styles.filename} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={styles.filesize}>{formatBytes(file.size)}</Text>
        <Text style={styles.note}>CARD TYPES ARE CHOSEN FOR YOU</Text>
      </View>

      <DestinationPicker
        courses={courses}
        selectedId={destinationId}
        onSelect={onDestinationSelect}
        onCreate={onDestinationCreate}
      />
      {destinationId === null && (
        <Text style={styles.note}>NO COURSE CHOSEN — THE MODEL WILL DECIDE</Text>
      )}

      <SwipeAction label="EXTRACT" hint="SWIPE RIGHT" tone="accent" onConfirm={onExtract} />
    </View>
  );
}

function ExtractingStage({ file, progress, phase, onCancel }: { file: PickedFile; progress: number; phase: ExtractionPhase; onCancel: () => void }) {
  const pct = Math.round(progress * 100);
  const reducedMotion = useReducedMotion();

  // Lazily captured so it reads "now" once, at mount, rather than the
  // instant the module first evaluated.
  const [startedAt] = useState(() => Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const status = extractionStatus(phase, elapsedMs);

  // Loops between the resting text colour and rust — the palette's "active"
  // accent — so the status line reads as work in progress rather than a
  // static caption. Skipped entirely under reduced motion: no loop is
  // started, and the text just renders at its resting colour.
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [reducedMotion, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    color: interpolateColor(pulse.value, [0, 1], [Theme.text, Colors.rust]),
  }));

  return (
    <View style={styles.stageGap}>
      <Text style={styles.filename} numberOfLines={1}>
        {file.name}
      </Text>
      <Text style={styles.provider}>{activeProvider().label.toUpperCase()}</Text>
      {reducedMotion ? (
        <Text style={[styles.copy, { color: Theme.text }]}>{status}</Text>
      ) : (
        <Animated.Text style={[styles.copy, pulseStyle]}>{status}</Animated.Text>
      )}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressPct}>{pct}%</Text>
      <SwipeAction label="CANCEL" hint="SWIPE RIGHT" onConfirm={onCancel} />
    </View>
  );
}

function ReviewStage({
  result,
  courses,
  destinationId,
  onDestinationSelect,
  onDestinationCreate,
  onSave,
  onDropCard,
  onDiscard,
}: {
  result: ExtractionResult;
  courses: Course[];
  destinationId: string | null;
  onDestinationSelect: (id: string) => void;
  onDestinationCreate: (title: string) => void;
  onSave: () => void;
  onDropCard: (index: number) => void;
  onDiscard: () => void;
}) {
  const breakdown = countByTemplate(result.cards);
  // Falls back to the model's own suggestion so the picker shows a filled
  // row even before the user has touched it — "preselected", not "empty".
  const chosenId = destinationId ?? result.canonicalCourse?.id ?? result.suggestedCourseId;
  const pickerCourses = result.canonicalCourse && !courses.some((course) => course.id === result.canonicalCourse?.id)
    ? [...courses, result.canonicalCourse]
    : courses;
  // Resolved against the offered list first: it is the only place the model's
  // own course and a course the user has named but not created yet exist —
  // neither is in the store while the upload is still being reviewed.
  const chosenCourse = chosenId
    ? pickerCourses.find((course) => course.id === chosenId) ?? courseById(chosenId)
    : undefined;
  const saveLabel = `SAVE TO ${(chosenCourse?.title ?? result.suggestedTitle).toUpperCase()}`;

  return (
    <View style={styles.stageGap}>
      <Text style={styles.copy}>
        {result.cards.length} CARD{result.cards.length === 1 ? "" : "S"}
      </Text>
      <View style={styles.breakdown}>
        {breakdown.map(({ gameType, count }) => (
          <Text key={gameType} style={styles.breakdownLine}>
            {TEMPLATE_LABELS[gameType]} · {count}
          </Text>
        ))}
      </View>

      {result.provider !== "gemini" && result.cards.map((card, index) => (
        <View key={`${card.gameType}-${index}`} style={styles.cardReviewRow}>
          <Text style={styles.breakdownLine}>{TEMPLATE_LABELS[card.gameType]}</Text>
          <Text style={styles.note}>{cardPreview(card)}</Text>
          <SwipeAction label="DROP" hint="SWIPE RIGHT" onConfirm={() => onDropCard(index)} />
        </View>
      ))}

      <Text style={styles.suggestion}>
        SUGGESTED: {result.suggestedTitle}
        {result.confidence > 0 ? `  ·  ${Math.round(result.confidence * 100)}%` : ""}
      </Text>

      <DestinationPicker
        courses={pickerCourses}
        selectedId={chosenId}
        suggestedId={result.suggestedCourseId ?? result.canonicalCourse?.id}
        onSelect={onDestinationSelect}
        onCreate={onDestinationCreate}
      />

      <View style={styles.divider} />

      <SwipeAction label={saveLabel} hint="SWIPE RIGHT" tone="accent" onConfirm={onSave} />
      <SwipeAction label="DISCARD" hint="SWIPE RIGHT" onConfirm={onDiscard} />
    </View>
  );
}

function SavedStage({ courseTitle, count, saving = false, onStudy, onDone }: { courseTitle: string | null; count: number; saving?: boolean; onStudy?: () => void; onDone?: () => void }) {
  if (saving) {
    return (
      <View style={styles.stageGap}>
        <Text style={styles.copy}>SAVING…</Text>
      </View>
    );
  }
  return (
    <View style={styles.stageGap}>
      <Text style={styles.copy}>
        {count} CARD{count === 1 ? "" : "S"} ADDED TO {courseTitle ?? "—"}
      </Text>
      {onStudy && <SwipeAction label="STUDY NOW" hint="SWIPE RIGHT" tone="accent" onConfirm={onStudy} />}
      {onDone && <SwipeAction label="DONE" hint="SWIPE RIGHT" onConfirm={onDone} />}
    </View>
  );
}

function FailedStage({
  message,
  onRetry,
  onStartOver,
}: {
  message: string | null;
  onRetry: () => void;
  onStartOver: () => void;
}) {
  return (
    <View style={styles.stageGap}>
      <Text style={styles.error}>{message ?? "SOMETHING WENT WRONG"}</Text>
      <SwipeAction label="TRY AGAIN" hint="SWIPE RIGHT" onConfirm={onRetry} />
      <SwipeAction label="START OVER" hint="SWIPE RIGHT" onConfirm={onStartOver} />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  heading: {
    fontFamily: Fonts.display,
    color: Theme.text,
    letterSpacing: 2,
    fontSize: 40,
  },
  body: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  stageGap: {
    gap: Spacing.md,
  },
  copy: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 1,
    color: Theme.textMuted,
  },
  filename: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    color: Theme.text,
  },
  filesize: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Theme.textMuted,
    marginTop: 2,
  },
  note: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Theme.textMuted,
  },
  error: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.rust,
  },
  provider: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: Theme.textMuted,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.surface,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.rust,
  },
  progressPct: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Theme.text,
    alignSelf: "flex-end",
  },
  breakdown: {
    gap: 2,
  },
  breakdownLine: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Theme.textMuted,
  },
  cardReviewRow: { gap: Spacing.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Theme.hairline },
  suggestion: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Theme.text,
  },
});
