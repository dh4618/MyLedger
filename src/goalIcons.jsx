import React from 'react';
import {
  Dumbbell, BookOpen, Heart, Sparkles, Coffee, Music, Leaf, Code,
  Wallet, Bed, Bike, Camera, PawPrint, Utensils, Brain, Sun,
} from 'lucide-react';

// A curated set rather than all of lucide: a short grid is quicker to pick from,
// and it keeps the bundle to the icons actually reachable from the UI.
//
// `id` is what gets stored on the goal, so these strings are permanent — never
// rename an id, or existing goals lose their icon. The visible label lives in
// src/i18n/strings.js under goalIcon.<id>, so it can be translated.
export const GOAL_ICONS = [
  { id: 'dumbbell', Icon: Dumbbell },
  { id: 'book', Icon: BookOpen },
  { id: 'heart', Icon: Heart },
  { id: 'sparkles', Icon: Sparkles },
  { id: 'coffee', Icon: Coffee },
  { id: 'music', Icon: Music },
  { id: 'leaf', Icon: Leaf },
  { id: 'code', Icon: Code },
  { id: 'wallet', Icon: Wallet },
  { id: 'bed', Icon: Bed },
  { id: 'bike', Icon: Bike },
  { id: 'camera', Icon: Camera },
  { id: 'paw', Icon: PawPrint },
  { id: 'food', Icon: Utensils },
  { id: 'brain', Icon: Brain },
  { id: 'sun', Icon: Sun },
];

const byId = (id) => GOAL_ICONS.find((entry) => entry.id === id);

// Renders a goal's icon, or nothing when the goal has no icon set — goals created
// before icons existed simply keep their coloured dot.
export function GoalIcon({ icon, size = 12, color, strokeWidth = 2.2 }) {
  const entry = icon && byId(icon);
  if (!entry) return null;
  const { Icon } = entry;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}

export const hasGoalIcon = (icon) => !!(icon && byId(icon));
