import { describe, expect, it, vi } from "vitest";

import { createSyncedStore } from "./store";

const platform = vi.hoisted(() => {
  Reflect.deleteProperty(globalThis, "window");
  return {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: platform.getItem, setItem: platform.setItem },
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth, listener: (user: { uid: string } | null) => void) => {
    listener({ uid: "server-user" });
    return vi.fn();
  }),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ auth: {}, db: {} }));

describe("createSyncedStore server rendering", () => {
  it("does not hydrate device storage when window is unavailable", () => {
    createSyncedStore<{ id: string }>({
      name: "server-render",
      collectionPath: () => "records",
      pathIsOwnerScoped: false,
      field: { idField: "recordId", ownerIdField: "ownerId", timestampFields: [] },
      remoteUpdatedAtField: "updatedAt",
      isValid: (value): value is { id: string } => !!value && typeof value === "object" && "id" in value,
    });

    expect(platform.getItem).not.toHaveBeenCalled();
  });
});
