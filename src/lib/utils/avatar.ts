const AVATAR_COLORS = [
  "#B8A9D4", // lavender
  "#A8D5BA", // mint
  "#F5C6AA", // peach
  "#E8B4C8", // pink
  "#D4C9E8", // light lavender
  "#C5E8D2", // light mint
  "#6B9FB8", // slate
  "#9DC4D8", // soft blue
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export { AVATAR_COLORS };
