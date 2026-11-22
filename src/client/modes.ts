export type Mode = "last" | "recent";

export const MODES: Record<Mode, { title: string; home: string }> = {
  last: { title: "你推多久沒開台了？", home: "/" },
  recent: { title: "你推最近開了多久？", home: "/recent" },
};
