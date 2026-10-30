import type { Avatar } from "@brick/game";

export const AVATAR_HEX: Record<Avatar["color"], string> = {
  teal: "#00c4b8",
  coral: "#ff5a4e",
  sun: "#ffcc33",
  grape: "#8b6cff",
  sky: "#5ec8ff",
  lime: "#5fd068",
  rose: "#ff7ab6",
  slate: "#94a3b8",
};

export const HAT_LABELS: Record<Avatar["hat"], string> = {
  none: "No hat",
  cap: "Cap",
  crown: "Crown",
  party: "Party hat",
  tophat: "Top hat",
  beanie: "Beanie",
  headset: "Headset",
  halo: "Halo",
};

export const FACE_LABELS: Record<Avatar["face"], string> = {
  classic: "Classic",
  blush: "Blush",
  glasses: "Glasses",
  shades: "Shades",
  mustache: "Mustache",
  cyclops: "One eye",
  freckles: "Freckles",
  brows: "Brows",
};

export const SHAPE_LABELS: Record<Avatar["shape"], string> = {
  brick: "Classic",
  round: "Round",
  triple: "Three studs",
  tile: "Smooth",
  jelly: "Jelly",
  slim: "Slim",
};
