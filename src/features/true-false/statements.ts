export interface TrueFalseStatement {
  /** Rendered inside a circle — keep it under ~60 characters or it wraps ugly. */
  statement: string;
  isTrue: boolean;
}

export const SAMPLE_STATEMENTS: TrueFalseStatement[] = [
  {
    statement: "SATURN HAS RINGS MADE OF ICE AND ROCK",
    isTrue: true,
  },
  {
    statement: "VENUS IS ALSO KNOWN AS THE RED PLANET",
    isTrue: false,
  },
  {
    statement: "SHARKS ARE FISH, NOT MAMMALS",
    isTrue: true,
  },
  {
    statement: "THE NILE IS A RIVER IN AFRICA",
    isTrue: true,
  },
  {
    statement: "A GROUP OF LIONS IS CALLED A HERD",
    isTrue: false,
  },
  {
    statement: "PARIS IS THE CAPITAL OF GERMANY",
    isTrue: false,
  },
  {
    statement: "WORLD WAR II ENDED IN 1945",
    isTrue: true,
  },
  {
    statement: "THE ENGLISH ALPHABET HAS 30 LETTERS",
    isTrue: false,
  },
  {
    statement: "LIGHT TRAVELS FASTER THAN SOUND",
    isTrue: true,
  },
  {
    statement: "THE EIFFEL TOWER WAS BUILT IN THE 1600S",
    isTrue: false,
  },
];
