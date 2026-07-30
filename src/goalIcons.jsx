import React from 'react';
import {
  Dumbbell, BookOpen, Heart, Sparkles, Coffee, Music, Leaf, Code,
  Wallet, Bed, Bike, Camera, PawPrint, Utensils, Brain, Sun,
} from 'lucide-react';

// A curated set rather than all of lucide: a short grid is quicker to pick from,
// and it keeps the bundle to the icons actually reachable from the UI.
//
// `id` is what gets stored on the goal, so these strings are permanent — rename a
// label freely, but never an id, or existing goals lose their icon.
export const GOAL_ICONS = [
  { id: 'dumbbell', label: 'Fitness', Icon: Dumbbell },
  { id: 'book', label: 'Reading', Icon: BookOpen },
  { id: 'heart', label: 'Health', Icon: Heart },
  { id: 'sparkles', label: 'Self-care', Icon: Sparkles },
  { id: 'coffee', label: 'Routine', Icon: Coffee },
  { id: 'music', label: 'Music', Icon: Music },
  { id: 'leaf', label: 'Outdoors', Icon: Leaf },
  { id: 'code', label: 'Work', Icon: Code },
  { id: 'wallet', label: 'Money', Icon: Wallet },
  { id: 'bed', label: 'Rest', Icon: Bed },
  { id: 'bike', label: 'Cycling', Icon: Bike },
  { id: 'camera', label: 'Photos', Icon: Camera },
  { id: 'paw', label: 'Pets', Icon: PawPrint },
  { id: 'food', label: 'Food', Icon: Utensils },
  { id: 'brain', label: 'Study', Icon: Brain },
  { id: 'sun', label: 'Morning', Icon: Sun },
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
