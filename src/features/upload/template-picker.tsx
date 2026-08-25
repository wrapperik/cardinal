import { ChoiceList, type ChoiceOption } from "@/components/choice-list";
import type { TemplateChoice } from "@/features/upload/types";
import type { GameType } from "@/types/cardinal";

const OPTIONS: ChoiceOption<TemplateChoice>[] = [
  { value: "auto", label: "AUTO" },
  { value: "compassQuiz", label: "COMPASS QUIZ" },
  { value: "trueFalseDuel", label: "TRUE / FALSE" },
  { value: "sequenceSwipe", label: "SEQUENCE" },
  { value: "matchRelease", label: "MATCH" },
];

export const TEMPLATE_LABELS: Record<GameType, string> = {
  compassQuiz: "COMPASS QUIZ",
  trueFalseDuel: "TRUE / FALSE",
  sequenceSwipe: "SEQUENCE",
  matchRelease: "MATCH",
};

export function TemplatePicker({ value, onChange, includeAuto = true }: { value: TemplateChoice; onChange: (value: TemplateChoice) => void; includeAuto?: boolean }) {
  return <ChoiceList options={includeAuto ? OPTIONS : OPTIONS.slice(1)} value={value} onChange={onChange} layout="row" />;
}
