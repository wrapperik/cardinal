import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useReducer } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BackButton } from "@/components/back-button";
import { HOLD_BUTTON_SIZE } from "@/components/hold-button";
import { Colors, Fonts, Spacing, Theme } from "@/constants/theme";
import { notification, NotificationFeedbackType } from "@/lib/haptics";
import { addCourse, adoptRemoteCourse, courseById, useCourses } from "@/features/upload/courses";
import { adoptRemoteDeck, saveDeck } from "@/features/upload/decks";
import { DestinationPicker } from "@/features/upload/destination-picker";
import { activeProvider, extractCards } from "@/features/upload/extract";
import { formatBytes, pickDocument } from "@/features/upload/picker";
import { SwipeAction } from "@/features/upload/swipe-action";
import { TEMPLATE_LABELS, TemplatePicker } from "@/features/upload/template-picker";
import type {
  Course,
  ExtractionResult,
  PickedFile,
  TemplateChoice,
} from "@/features/upload/types";
import type { CardContent, GameType } from "@/types/cardinal";

/**
 * Roughly how many cards a provider should aim for. Enough for a full study
 * session without turning a two-page handout into fifty near-duplicate
 * cards — providers treat this as a target, not a hard cap.
 */
const CARD_TARGET = 20;

/**
 * How long the "saved" confirmation holds before the screen leaves — long
 * enough to actually read a five-word line, short enough that it never
 * feels like the app is stalling on you.
 */
const SAVED_HOLD_MS = 1400;

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
  template: TemplateChoice;
  /** The user's own choice. Null means "let the model decide" — distinct
   *  from having chosen nothing yet, which is the same value but read
   *  differently depending on stage (optional at `picked`, a real decision
   *  once `review` has a suggestion to fall back to instead). */
  destinationId: string | null;
  progress: number;
  result: ExtractionResult | null;
  error: string | null;
  savedCourseTitle: string | null;
  savedCount: number;
}

const initialState: UploadState = {
  stage: "idle",
  file: null,
  pickError: null,
  template: "auto",
  destinationId: null,
  progress: 0,
  result: null,
  error: null,
  savedCourseTitle: null,
  savedCount: 0,
};

type Action =
  | { type: "pickBegin" }
  | { type: "picked"; file: PickedFile }
  | { type: "pickFailed"; message: string }
  | { type: "setTemplate"; value: TemplateChoice }
  | { type: "setDestination"; id: string }
  | { type: "extractStart" }
  | { type: "extractProgress"; fraction: number }
  | { type: "extractSuccess"; result: ExtractionResult }
  | { type: "extractFailed"; message: string }
  | { type: "retry" }
  | { type: "saveStart" }
  | { type: "saveSuccess"; courseTitle: string; count: number }
  | { type: "reset" };

function reducer(state: UploadState, action: Action): UploadState {
  switch (action.type) {
    case "pickBegin":
      return { ...state, pickError: null };
    case "picked":
      return { ...state, stage: "picked", file: action.file, pickError: null };
    case "pickFailed":
      return { ...state, pickError: action.message };
    case "setTemplate":
      return { ...state, template: action.value };
    case "setDestination":
      return { ...state, destinationId: action.id };
    case "extractStart":
      return { ...state, stage: "extracting", progress: 0 };
    case "extractProgress":
      return { ...state, progress: action.fraction };
    case "extractSuccess":
      return { ...state, stage: "review", result: action.result };
    case "extractFailed":
      return { ...state, stage: "failed", error: action.message };
    case "retry":
      return { ...state, stage: "picked", error: null };
    case "saveStart":
      return { ...state, stage: "saving" };
    case "saveSuccess":
      return {
        ...state,
        stage: "saved",
        savedCourseTitle: action.courseTitle,
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

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The upload flow, now a pushed screen instead of a sheet dragged up from
 * the bottom edge. Reached from home by holding the plus icon, optionally
 * pointed at a specific course — the old imperative `open(courseId)` call is
 * a route param here instead, seeded into the reducer once on mount.
 */
export default function Upload() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const courses = useCourses();

  const [state, dispatch] = useReducer(reducer, initialState);

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

  // The save confirmation is a beat, not a screen it waits on: hold it
  // briefly, then hand back to whatever pushed this screen.
  useEffect(() => {
    if (state.stage !== "saved") return;
    notification(NotificationFeedbackType.Success);
    const timer = setTimeout(() => {
      router.back();
    }, SAVED_HOLD_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stage]);

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
    dispatch({ type: "extractStart" });
    const outcome = await extractCards(
      {
        file: state.file,
        template: state.template,
        courses: courses.map((course) => ({ id: course.id, title: course.title })),
        cardTarget: CARD_TARGET,
      },
      (fraction) => dispatch({ type: "extractProgress", fraction }),
    );
    if (outcome.ok) {
      dispatch({ type: "extractSuccess", result: outcome.result });
    } else {
      dispatch({ type: "extractFailed", message: outcome.message });
    }
  }

  function handleSave() {
    if (!state.result) return;

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
      dispatch({
        type: "saveSuccess",
        courseTitle: canonicalCourse.title,
        count: canonicalDeck.cards.length,
      });
      return;
    }

    dispatch({ type: "saveStart" });

    const chosenId = state.destinationId ?? state.result.suggestedCourseId;
    const existing = chosenId ? courseById(chosenId) : undefined;
    // A suggestion that doesn't match an existing course id is a brand new
    // one, seeded with whatever template the cards mostly turned out to
    // be rather than always defaulting to compassQuiz.
    const course =
      existing ?? addCourse(state.result.suggestedTitle, majorityGameType(state.result.cards));

    const deck = saveDeck({
      courseId: course.id,
      title: state.result.suggestedTitle,
      sourceName: state.file?.name ?? "",
      cards: state.result.cards,
      provider: state.result.provider,
    });

    dispatch({ type: "saveSuccess", courseTitle: course.title, count: deck.cards.length });
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          // Clears the BACK button, exactly like course detail's own clearance.
          paddingTop: insets.top + HOLD_BUTTON_SIZE + Spacing.lg,
          paddingHorizontal: Spacing.lg,
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
              template={state.template}
              courses={courses}
              destinationId={state.destinationId}
              onTemplateChange={(value) => dispatch({ type: "setTemplate", value })}
              onDestinationSelect={(id) => dispatch({ type: "setDestination", id })}
              onDestinationCreate={(title) => {
                const created = addCourse(
                  title,
                  state.template === "auto" ? undefined : state.template,
                );
                dispatch({ type: "setDestination", id: created.id });
              }}
              onExtract={handleExtract}
            />
          )}

          {state.stage === "extracting" && state.file && (
            <ExtractingStage file={state.file} progress={state.progress} />
          )}

          {state.stage === "review" && state.result && (
            <ReviewStage
              result={state.result}
              courses={courses}
              destinationId={state.destinationId}
              onDestinationSelect={(id) => dispatch({ type: "setDestination", id })}
              onDestinationCreate={(title) => {
                const created = addCourse(title, majorityGameType(state.result!.cards));
                dispatch({ type: "setDestination", id: created.id });
              }}
              onSave={handleSave}
              onDiscard={() => dispatch({ type: "reset" })}
            />
          )}

          {(state.stage === "saving" || state.stage === "saved") && (
            <SavedStage courseTitle={state.savedCourseTitle} count={state.savedCount} />
          )}

          {state.stage === "failed" && (
            <FailedStage
              message={state.error}
              onRetry={() => dispatch({ type: "retry" })}
              onStartOver={() => dispatch({ type: "reset" })}
            />
          )}
        </View>
      </ScrollView>

      <BackButton label="BACK" onBack={() => router.back()} />
    </View>
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
  template,
  courses,
  destinationId,
  onTemplateChange,
  onDestinationSelect,
  onDestinationCreate,
  onExtract,
}: {
  file: PickedFile;
  template: TemplateChoice;
  courses: Course[];
  destinationId: string | null;
  onTemplateChange: (value: TemplateChoice) => void;
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
      </View>

      <TemplatePicker value={template} onChange={onTemplateChange} />

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

function ExtractingStage({ file, progress }: { file: PickedFile; progress: number }) {
  const pct = Math.round(progress * 100);
  return (
    <View style={styles.stageGap}>
      <Text style={styles.filename} numberOfLines={1}>
        {file.name}
      </Text>
      <Text style={styles.provider}>{activeProvider().label.toUpperCase()}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressPct}>{pct}%</Text>
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
  onDiscard,
}: {
  result: ExtractionResult;
  courses: Course[];
  destinationId: string | null;
  onDestinationSelect: (id: string) => void;
  onDestinationCreate: (title: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const breakdown = countByTemplate(result.cards);
  const isCanonical = result.provider === "gemini" && !!result.canonicalDeck;
  // Falls back to the model's own suggestion so the picker shows a filled
  // row even before the user has touched it — "preselected", not "empty".
  const chosenId = isCanonical ? result.canonicalDeck!.courseId : destinationId ?? result.suggestedCourseId;
  const chosenCourse = isCanonical
    ? result.canonicalCourse
    : chosenId
      ? courseById(chosenId)
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

      <Text style={styles.suggestion}>
        SUGGESTED: {result.suggestedTitle}
        {result.confidence > 0 ? `  ·  ${Math.round(result.confidence * 100)}%` : ""}
      </Text>

      {isCanonical ? (
        <Text style={styles.note}>CLOUD DESTINATION: {chosenCourse?.title ?? result.suggestedTitle}</Text>
      ) : (
        <DestinationPicker
          courses={courses}
          selectedId={chosenId}
          suggestedId={result.suggestedCourseId}
          onSelect={onDestinationSelect}
          onCreate={onDestinationCreate}
        />
      )}

      <SwipeAction label={saveLabel} hint="SWIPE RIGHT" tone="accent" onConfirm={onSave} />
      <SwipeAction label="DISCARD" hint="SWIPE RIGHT" onConfirm={onDiscard} />
    </View>
  );
}

function SavedStage({ courseTitle, count }: { courseTitle: string | null; count: number }) {
  return (
    <View style={styles.stageGap}>
      <Text style={styles.copy}>
        {count} CARD{count === 1 ? "" : "S"} ADDED TO {courseTitle ?? "—"}
      </Text>
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
  container: {
    flex: 1,
    backgroundColor: Theme.background,
  },
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
    backgroundColor: Colors.bone,
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
  suggestion: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Theme.text,
  },
});
