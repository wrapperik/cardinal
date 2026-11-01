import { useLocalSearchParams } from "expo-router";

import { ListGroup, ListInfoRow } from "@/components/grouped-list";
import { PageScaffold } from "@/components/page-scaffold";
import { courseStats } from "@/features/upload/course-stats";
import { useCourses } from "@/features/upload/courses";
import { useDecks } from "@/features/upload/decks";

/**
 * Course detail, reached from home's TOPICS row. Minimal for now — a later
 * pass fills this in with continue-from-checkpoint, uploading straight into
 * this course, and past scores read from the sessions store. Today it just
 * proves the course is real: its size, and whatever topics its cards cover.
 */
export default function CourseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const decks = useDecks();
  // Subscribed rather than read once: courses hydrate from AsyncStorage after
  // import, so a one-shot read on mount can render a heading for a course the
  // store has not caught up to yet. Decks are already subscribed just below
  // for the same reason.
  const courses = useCourses();

  const course = id ? courses.find((c) => c.id === id) : undefined;
  const stats = id ? courseStats(decks, id) : { cardCount: 0, gameTypes: [], topics: [] };

  return (
    <PageScaffold title="TOPICS" subtitle={course?.title ?? "—"}>
      <ListGroup title="OVERVIEW" iconless>
        <ListInfoRow label="CARDS" value={String(stats.cardCount)} />
        <ListInfoRow label="GAMES" value={String(stats.gameTypes.length)} />
      </ListGroup>

      <ListGroup
        title="TOPICS"
        footer={stats.topics.length === 0 ? "Upload material to this course and its topics appear here." : undefined}
      >
        {stats.topics.length === 0 ? (
          <ListInfoRow icon="list" label="NO UPLOADED MATERIAL YET" />
        ) : (
          stats.topics.map((topic) => <ListInfoRow key={topic} icon="list" label={topic} />)
        )}
      </ListGroup>
    </PageScaffold>
  );
}
