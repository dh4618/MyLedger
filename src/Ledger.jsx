import { storage, knownUserId } from './storage';
import { readUnflushed, clearUnflushed } from './pendingWrites';
import useDurableBlob from './useDurableBlob';
import GroceryList from './GroceryList';
import { emptyGroceries, normalizeGroceries, addItem, toggleItem, removeItem, clearBought } from './groceries';
import CapturePanel from './CapturePanel';
import { requestParse } from './capture';
import { guardProposal } from './parseGuard';
import { supabase } from './supabase';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, MoreVertical, Check, Settings, Trash2, Repeat, Pencil, CornerDownRight, Download, Upload, LogOut, Smile, CalendarDays, Sparkles, ChevronDown, Trophy, RotateCcw, ShoppingCart } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useLang } from './i18n/LanguageProvider';
import ProgressBar from './ProgressBar';
import PasswordSetting from './PasswordSetting';
import LanguagePicker from './LanguagePicker';
import { GOAL_ICONS, GoalIcon, hasGoalIcon } from './goalIcons';
import { genId } from './ids';

const GOAL_COLORS = ['#3F5A44', '#3E5C76', '#B8862F', '#9C4430', '#6B5B87', '#3F7A6B'];
const NO_GOAL_ID = '__no_goal__';
const NO_GOAL_COLOR = '#8A8577';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first, values match JS Date.getDay()

const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDateStr = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const startOfWeek = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
};
const defaultDay = () => ({ oneOff: [], completed: {}, removedRecurring: [] });
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

// An absent `freq` means weekly, so templates stored before monthly existed need no
// migration — they keep matching on `days` exactly as they did.
const isMonthly = (r) => !!r && r.freq === 'monthly';
const monthDaysOf = (r) => (r && r.monthDays && r.monthDays.length ? r.monthDays : [1]);
// Day 0 of the next month is the last day of this one.
const daysInMonth = (dateStr) => new Date(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)), 0).getDate();

// Dates come from Intl rather than hand-written month and weekday arrays, so a new
// language needs no date work at all. Formatters are cached per locale because
// constructing one is comparatively expensive and these run on every render of the
// week strip and the calendar grid.
const formatterCache = new Map();
const formatter = (locale, options) => {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, f);
  }
  return f;
};

// "Thursday, 30 July" / "7月30日 星期四" — en-GB puts the day first, which is what
// this app has always shown, and zh-CN produces its own natural order.
//
// Built from parts rather than format() because Intl's punctuation needs adjusting
// at both ends: en-GB renders a bare space after the weekday where this headline has
// always had a comma, and zh-CN butts the weekday straight onto the date with no gap
// at all ("7月30日星期四"), which reads cramped.
//
// The test for "needs a gap" is whether the text so far ends in whitespace — not
// whether Intl emitted a literal. In zh-CN the 日 *is* a literal, but it's content
// rather than a separator, so keying off the part type gets this exactly backwards.
const formatHeadline = (date, locale) => {
  const parts = formatter(locale, { weekday: 'long', day: 'numeric', month: 'long' }).formatToParts(date);
  const endsOpen = (s) => s.length > 0 && !/\s$/.test(s);
  let out = '';
  parts.forEach((part, i) => {
    const prev = parts[i - 1];
    if (part.type === 'literal' && part.value === ' ' && prev && prev.type === 'weekday') {
      out += ', ';
      return;
    }
    // Separate the weekday from whatever it abuts, in either order.
    const abutsWeekday = part.type === 'weekday' || (prev && prev.type === 'weekday');
    if (abutsWeekday && endsOpen(out)) out += ' ';
    out += part.value;
  });
  return out;
};
// "Jul 30" / "7月30日"
const formatShortDate = (date, locale) =>
  formatter(locale, { day: 'numeric', month: 'short' }).format(date);
// "July 2026" / "2026年7月"
const formatMonthYear = (date, locale) =>
  formatter(locale, { year: 'numeric', month: 'long' }).format(date);

// Takes t and the localised abbreviations so the summary reads naturally in both
// languages — including the separator, which is 、rather than a comma in Chinese.
const summarizeDays = (days, t, weekdayAbbr) => {
  const d = days && days.length ? days : ALL_DAYS;
  const set = new Set(d);
  if (set.size === 7) return t('days.everyDay');
  if (set.size === 5 && [1, 2, 3, 4, 5].every((x) => set.has(x))) return t('days.weekdays');
  if (set.size === 2 && set.has(0) && set.has(6)) return t('days.weekends');
  return WEEKDAY_ORDER
    .filter((x) => set.has(x))
    .map((x) => weekdayAbbr[WEEKDAY_ORDER.indexOf(x)])
    .join(t('common.listSep'));
};

// "1st" reads better than "1" in English and needs the plural rules to get right;
// languages that don't inflect ordinals get the bare number, and their `days.monthlyOn`
// pattern supplies whatever marker they need (Chinese puts 日 after the list).
const ordinalCache = new Map();
const ordinal = (n, locale) => {
  if (!String(locale).startsWith('en')) return String(n);
  let pr = ordinalCache.get(locale);
  if (!pr) { pr = new Intl.PluralRules(locale, { type: 'ordinal' }); ordinalCache.set(locale, pr); }
  return `${n}${{ one: 'st', two: 'nd', few: 'rd' }[pr.select(n)] || 'th'}`;
};

// 31 is always the last day of the month, since shorter months clamp onto it, so it
// reads better named than as a date most months don't have.
const monthDayLabel = (n, t, locale) => (
  n === 31 ? t('days.monthEnd') : t('days.dayOfMonth', { day: ordinal(n, locale) })
);

const summarizeRepeat = (r, t, weekdayAbbr, locale) => {
  if (!isMonthly(r)) return summarizeDays(r.days, t, weekdayAbbr);
  const list = [...monthDaysOf(r)].sort((a, b) => a - b)
    .map((n) => monthDayLabel(n, t, locale))
    .join(t('common.listSep'));
  return t('days.monthlyOn', { days: list });
};

export default function Ledger() {
  const { theme, themeId, setThemeId, themes } = useTheme();
  const { t, locale, langId, weekdayLetters, weekdayAbbr } = useLang();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [days, setDays] = useState({});
  const [selectedDateStr, setSelectedDateStr] = useState(toDateStr(new Date()));
  const [activeGoalFilter, setActiveGoalFilter] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [openMenuTaskId, setOpenMenuTaskId] = useState(null);
  const [newGoalName, setNewGoalName] = useState('');
  const [showAddGoalInManage, setShowAddGoalInManage] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [manageGoalId, setManageGoalId] = useState(null);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [editingGoalName, setEditingGoalName] = useState('');
  const [iconPickerGoalId, setIconPickerGoalId] = useState(null);
  const [newGoalKind, setNewGoalKind] = useState('ongoing');
  const [showAchieved, setShowAchieved] = useState(false);
  const [modal, setModal] = useState(null); // { mode: 'add'|'edit', presetMode, lockRepeats, form: {...} }
  const [presets, setPresets] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }
  const [storageError, setStorageError] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportJson, setExportJson] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [groceries, setGroceries] = useState(emptyGroceries());
  const [showGroceries, setShowGroceries] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const writesLocked = useRef(false);

  const todayStr = toDateStr(new Date());

  // Initial load
  useEffect(() => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    // Read a key, retrying only if it fails. No delay on success. Returns { res, rateLimited }.
    const readKey = async (key, attempts = 6) => {
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await storage.get(key, false);
          return { res, rateLimited: false };
        } catch (e) {
          const isRate = /rate limit/i.test((e && e.message) || '');
          if (i === attempts - 1) return { res: null, rateLimited: isRate, error: e };
          await sleep((isRate ? 2000 : 500) * (i + 1));
        }
      }
      return { res: null, rateLimited: false };
    };

    (async () => {
      let g = [];
      let r = [];
      let p = [];
      let allDays = {};
      let shopping = emptyGroceries();
      let rateLimited = false;

      // Fetch the five core keys together. On a healthy load this is one quick round-trip
      // with no artificial pauses; the retry/backoff only engages if a read actually fails.
      const [gr, rr, pr, dr, sr] = await Promise.all([
        readKey('goals'),
        readKey('recurring-tasks'),
        readKey('presets'),
        readKey('all-days'),
        readKey('groceries'),
      ]);
      if ([gr, rr, pr, dr, sr].some((x) => x.rateLimited)) rateLimited = true;
      if (gr.res && gr.res.value) { try { g = JSON.parse(gr.res.value); } catch (e) {} }
      if (rr.res && rr.res.value) { try { r = JSON.parse(rr.res.value); } catch (e) {} }
      if (pr.res && pr.res.value) { try { p = JSON.parse(pr.res.value); } catch (e) {} }
      if (dr.res && dr.res.value) { try { allDays = JSON.parse(dr.res.value); } catch (e) {} }
      if (sr.res && sr.res.value) { try { shopping = normalizeGroceries(JSON.parse(sr.res.value)); } catch (e) {} }

      // A mirror left behind by the previous session means that key's last write never
      // reached the server — the app was closed or offline before it went out. Prefer it
      // over what the server returned, and re-send it below.
      const takeUnflushed = (key, fromServer, parse) => {
        if (rateLimited) return null;
        const raw = readUnflushed(key, knownUserId());
        if (!raw) return null;
        if (raw === fromServer) { clearUnflushed(key); return null; } // already there
        try { return parse(JSON.parse(raw)); } catch (e) { clearUnflushed(key); return null; }
      };
      const replayDays = takeUnflushed('all-days', dr.res && dr.res.value, (v) => v);
      const replayShopping = takeUnflushed('groceries', sr.res && sr.res.value, normalizeGroceries);
      if (replayDays) allDays = replayDays;
      if (replayShopping) shopping = replayShopping;

      // Show the loaded data immediately — don't make the user wait on migration.
      setGoals(g);
      setRecurring(r);
      setPresets(p);
      setDays(allDays);
      setGroceries(shopping);
      daysBlob.adopt(allDays);
      groceryBlob.adopt(shopping);
      setLoading(false);

      if (rateLimited) {
        writesLocked.current = true;
        setStorageError(t('error.loadFailed'));
        return;
      }
      if (!storage || typeof storage.set !== 'function') {
        setStorageError(t('error.storageUnavailable'));
        return;
      }

      if (replayDays) await daysBlob.flush();
      if (replayShopping) await groceryBlob.flush();
    })();
  }, []);

  const reportStorageError = (label, e) => {
    console.error(`${label} failed`, e);
    setStorageError(t('error.saveFailed', {
      label: t(label),
      detail: e && e.message ? e.message : t('error.writeRejected'),
    }));
  };
  // Resolves true only when the server confirmed the write, which is what lets the
  // caller know whether it is safe to drop its local copy.
  const persist = async (key, value, label) => {
    if (writesLocked.current) {
      // A load failed; refuse to write so we can't overwrite unloaded data with a blank slate.
      return false;
    }
    if (typeof window === 'undefined' || !storage || typeof storage.set !== 'function') {
      reportStorageError(label, new Error(t('error.unavailableOnPage')));
      return false;
    }
    const attempts = 4;
    for (let i = 0; i < attempts; i++) {
      try {
        const result = await storage.set(key, value, false);
        if (result === null || result === undefined) {
          reportStorageError(label, new Error(t('error.noConfirmation')));
          return false;
        }
        setStorageError(null);
        return true;
      } catch (e) {
        const isRate = /rate limit/i.test((e && e.message) || '');
        if (i === attempts - 1) {
          reportStorageError(label, e);
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, (isRate ? 1500 : 500) * (i + 1)));
      }
    }
    return false;
  };

  const saveGoals = async (next) => {
    setGoals(next);
    await persist('goals', JSON.stringify(next), 'error.label.goals');
  };
  const saveRecurring = async (next) => {
    setRecurring(next);
    await persist('recurring-tasks', JSON.stringify(next), 'error.label.recurring');
  };
  const savePresets = async (next) => {
    setPresets(next);
    await persist('presets', JSON.stringify(next), 'error.label.presets');
  };
  // The two blobs that are edited a tap at a time, so both are debounced and both need
  // to survive the app being closed mid-write. See useDurableBlob for why that matters.
  const daysBlob = useDurableBlob({ storageKey: 'all-days', label: 'error.label.days', persist, locked: writesLocked });
  const groceryBlob = useDurableBlob({ storageKey: 'groceries', label: 'error.label.groceries', persist, locked: writesLocked });

  // One write covering however many days changed. Confirming a capture can add tasks to
  // two days and tick something off on a third, and calling saveDay per day would rebuild
  // each update from `days` state that hasn't re-rendered yet — so all but the last would
  // be lost.
  const saveDays = (updates) => {
    const updated = { ...daysBlob.peek(), ...updates };
    setDays(updated);
    daysBlob.save(updated);
  };
  const saveDay = (dateStr, next) => saveDays({ [dateStr]: next });
  const saveGroceries = (next) => {
    setGroceries(next);
    groceryBlob.save(next);
  };

  // The reducers live in groceries.js and are pure, so this layer is only wiring. Adding
  // returns the row to flash — including when the name was already there, which is how a
  // duplicate reads as "already on the list" rather than as nothing happening.
  const addGrocery = (name) => {
    const result = addItem(groceries, name);
    if (!result) return null;
    if (result.next !== groceries) saveGroceries(result.next);
    return result.id;
  };
  const outstandingGroceries = groceries.items.filter((x) => !x.bought).length;

  // ---- Natural-language capture ----

  // What the model is allowed to know: today, and the ids it may refer to. It never sees
  // the ledger itself, and `guardProposal` re-checks every id it hands back against this
  // same data — so an id can only survive if it started here.
  const captureContext = () => {
    const openTasks = [];
    // A week back plus today: "I did the washing up" is about something recent, and a
    // longer window is just more candidates to mismatch against.
    for (let back = 7; back >= 0; back -= 1) {
      const ds = toDateStr(addDays(fromDateStr(todayStr), -back));
      const dayCompleted = getDay(ds).completed;
      // getTasksForDate, so a carried task is offered on the day it is actually shown.
      getTasksForDate(ds).forEach((task) => {
        if (!dayCompleted[task.id]) openTasks.push({ id: task.id, dateStr: ds, name: task.name });
      });
    }
    return {
      today: todayStr,
      weekday: formatter(locale, { weekday: 'long' }).format(fromDateStr(todayStr)),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      lang: langId,
      goals: goals.filter((g) => !goalAchieved(g)).map((g) => ({ id: g.id, name: g.name })),
      presets: presets.map((p) => ({
        id: p.id, name: p.name, time: p.time || null, goalId: p.goalId || null, carryOver: !!p.carryOver,
      })),
      recurring: recurring.map((r) => ({ id: r.id, name: r.name })),
      openTasks,
      groceryRecent: groceries.recent,
    };
  };

  const parseAndGuard = async (text) => {
    const context = captureContext();
    const raw = await requestParse(text, context);
    const guarded = guardProposal(raw, { todayStr, ...context });
    return {
      ...guarded,
      // Resolved here rather than in the guard: the guard's job is to decide whether an
      // id is real, and the panel just needs something to print.
      tasks: guarded.tasks.map((t) => ({ ...t, goalName: (goalById(t.goalId) || {}).name || null })),
    };
  };

  const applyProposal = (approved) => {
    // Group by day first so several additions and tick-offs on one date become one write.
    const dayEdits = {};
    const editDay = (ds) => {
      if (!dayEdits[ds]) {
        const base = daysBlob.peek()[ds] || defaultDay();
        dayEdits[ds] = { ...base, oneOff: [...base.oneOff], completed: { ...base.completed } };
      }
      return dayEdits[ds];
    };

    approved.tasks.filter((t) => !t.repeat).forEach((t) => {
      editDay(t.date).oneOff.push({
        id: genId(), name: t.name, time: t.time, goalId: t.goalId, carryOver: t.carryOver,
      });
    });
    approved.completions.forEach((c) => { editDay(c.dateStr).completed[c.taskId] = true; });
    if (Object.keys(dayEdits).length) saveDays(dayEdits);

    const repeats = approved.tasks.filter((t) => t.repeat);
    if (repeats.length) {
      saveRecurring([...recurring, ...repeats.map((t) => ({
        id: genId(),
        name: t.name,
        time: t.time,
        goalId: t.goalId,
        freq: t.repeat.freq,
        days: t.repeat.freq === 'weekly' ? t.repeat.days : [...ALL_DAYS],
        monthDays: t.repeat.freq === 'monthly' ? t.repeat.monthDays : [],
        createdDate: todayStr,
        endDate: null,
      }))]);
    }

    if (approved.groceries.length) {
      // Through addItem, so the same de-duplication applies as when typing them by hand.
      let list = groceries;
      approved.groceries.forEach((name) => {
        const result = addItem(list, name);
        if (result) list = result.next;
      });
      if (list !== groceries) saveGroceries(list);
    }
  };

  const getDay = (dateStr) => days[dateStr] || defaultDay();

  // Which day a task was ticked off on (if any). Used to give keep-until-complete tasks a
  // single, stable home day.
  const completedDayById = useMemo(() => {
    const map = {};
    Object.keys(days).sort().forEach((ds) => {
      const c = days[ds].completed || {};
      Object.keys(c).forEach((id) => {
        if (c[id] && !map[id]) map[id] = ds;
      });
    });
    return map;
  }, [days]);

  // A keep-until-complete task lives on exactly one day: the day it was completed, or — while
  // it's still unfinished — the later of today and the day it was planned for. That's why it
  // leaves the day it was carried from. Taking the later of the two is what lets you plan
  // ahead: without it, a task you put on next Tuesday would be dragged onto today at once,
  // since "carry forward" has nothing to carry until its day arrives.
  const carryHomeDay = useCallback((taskId, plannedDateStr) => {
    const doneOn = completedDayById[taskId];
    if (doneOn) return doneOn;
    return plannedDateStr && plannedDateStr > todayStr ? plannedDateStr : todayStr;
  }, [completedDayById, todayStr]);

  const getTasksForDate = useCallback((dateStr) => {
    const day = days[dateStr] || defaultDay();
    const dow = fromDateStr(dateStr).getDay();
    const dom = fromDateStr(dateStr).getDate();
    const lastDom = daysInMonth(dateStr);
    const recurringInstances = recurring
      .filter((r) => {
        if (r.createdDate > dateStr) return false;
        if (r.endDate && dateStr > r.endDate) return false;
        if (day.removedRecurring.includes(r.id)) return false;
        if (isMonthly(r)) return monthDaysOf(r).some((n) => (
          // A month with no such date falls back to its last day, so "the 31st" still
          // happens in February instead of being silently skipped that month.
          n === dom || (n > lastDom && dom === lastDom)
        ));
        const activeDays = r.days && r.days.length ? r.days : ALL_DAYS;
        return activeDays.includes(dow);
      })
      .map((r) => ({
        id: r.id, name: r.name, time: r.time, goalId: r.goalId,
        days: r.days || ALL_DAYS, freq: isMonthly(r) ? 'monthly' : 'weekly', monthDays: monthDaysOf(r),
        createdDate: r.createdDate, endDate: r.endDate, isRecurring: true,
      }));

    // Stored tasks for this day, minus any keep-until-complete ones that have moved on.
    const oneOff = day.oneOff
      .filter((t) => !t.carryOver || carryHomeDay(t.id, dateStr) === dateStr)
      .map((t) => ({ ...t, isRecurring: false }));

    // Keep-until-complete tasks stored on other days whose home day is this one.
    const carried = [];
    Object.keys(days).forEach((ds) => {
      if (ds === dateStr) return;
      (days[ds].oneOff || []).forEach((t) => {
        if (!t.carryOver) return;
        if (carryHomeDay(t.id, ds) !== dateStr) return;
        carried.push({ ...t, isRecurring: false, carriedFrom: ds });
      });
    });

    return [...recurringInstances, ...oneOff, ...carried];
  }, [days, recurring, carryHomeDay]);

  const goalById = (id) => goals.find((g) => g.id === id);

  // A goal is auto-marked done when it has no active repeating tasks and every
  // Nothing outstanding under this goal: no repeating task still running, and every
  // one-off ticked. A goal with no tasks at all counts as complete — there is nothing
  // left to do — which is what lets you record something you simply went and did
  // without ever breaking it into steps.
  //
  // This deliberately inverts the old rule, which treated "no tasks" as not-done. It
  // was only ever used to render a transient badge; now it gates a durable action, and
  // "you have nothing left to do" is the honest reading.
  const goalStepsComplete = useCallback((goalId) => {
    const hasActiveRecurring = recurring.some((r) => r.goalId === goalId && (!r.endDate || r.endDate >= todayStr));
    if (hasActiveRecurring) return false;
    return !Object.entries(days).some(([ds, day]) => (
      day.oneOff.some((task) => {
        if (task.goalId !== goalId) return false;
        // A keep-until-complete task is stored on the day it was created but is ticked
        // off on its home day, so its own day's `completed` map never learns about it.
        const homeDs = task.carryOver ? carryHomeDay(task.id) : ds;
        return !(days[homeDs] || defaultDay()).completed[task.id];
      })
    ));
  }, [days, recurring, todayStr, carryHomeDay]);

  // Durable, and the only thing that drives the achieved badge and the Achieved
  // section. Unlike the old computed rule it survives adding new tasks later.
  const goalAchieved = (g) => !!(g && g.achievedDate);
  // An absent kind means 'ongoing', so goals stored before this existed need no
  // migration and simply keep behaving as categories.
  const isProject = (g) => !!g && g.kind === 'project';
  // Only projects can be achieved, and only once nothing is outstanding.
  const canAchieve = (g) => isProject(g) && !goalAchieved(g) && goalStepsComplete(g.id);

  const achieveGoal = (id) => {
    saveGoals(goals.map((g) => (g.id === id ? { ...g, achievedDate: todayStr } : g)));
  };
  const reopenGoal = (id) => {
    saveGoals(goals.map((g) => (g.id === id ? { ...g, achievedDate: null } : g)));
  };
  const setGoalKind = (id, kind) => {
    // Dropping back to a category clears the achievement — a category has nothing
    // to achieve, so leaving the date behind would strand it.
    saveGoals(goals.map((g) => (
      g.id === id ? { ...g, kind, achievedDate: kind === 'project' ? g.achievedDate || null : null } : g
    )));
  };

  // The only way out, now that a device stays signed in indefinitely.
  const signOut = () => {
    setConfirmDialog({
      message: t('account.signOutConfirm'),
      confirmLabel: t('account.signOut'),
      onConfirm: async () => {
        // Day and grocery writes are debounced, so flush anything pending before the
        // session goes away and the write would be rejected.
        if (daysBlob.pending()) await daysBlob.flush();
        if (groceryBlob.pending()) await groceryBlob.flush();
        await supabase.auth.signOut();
      },
    });
  };

  // ---- Actions ----
  const toggleComplete = (dateStr, taskId) => {
    const day = getDay(dateStr);
    const wasComplete = !!day.completed[taskId];
    const apply = () => {
      const completed = { ...day.completed, [taskId]: !wasComplete };
      saveDay(dateStr, { ...day, completed });
    };

    // Unticking under an achieved goal means "actually I didn't do that step", so the
    // goal can't still be achieved. Confirm first — the achieved date is a record, and
    // it should never disappear silently.
    if (wasComplete) {
      const task = getTasksForDate(dateStr).find((x) => x.id === taskId);
      const goal = task && goalById(task.goalId);
      if (goalAchieved(goal)) {
        setConfirmDialog({
          message: t('goal.reopenConfirm', {
            goal: goal.name,
            date: formatShortDate(fromDateStr(goal.achievedDate), locale),
          }),
          confirmLabel: t('goal.reopen'),
          onConfirm: () => { reopenGoal(goal.id); apply(); },
        });
        return;
      }
    }
    apply();
  };

  const skipToday = (dateStr, taskId) => {
    const day = getDay(dateStr);
    saveDay(dateStr, { ...day, removedRecurring: [...day.removedRecurring, taskId] });
    setOpenMenuTaskId(null);
  };

  const stopRepeating = (taskId) => {
    const endDate = toDateStr(addDays(fromDateStr(selectedDateStr), -1));
    saveRecurring(recurring.map((r) => (r.id === taskId ? { ...r, endDate } : r)));
    setOpenMenuTaskId(null);
  };

  const deleteRecurringEntirely = (taskId) => {
    setConfirmDialog({
      message: t('task.deleteRepeatingConfirm'),
      onConfirm: () => saveRecurring(recurring.filter((r) => r.id !== taskId)),
    });
  };

  const deleteOneOff = (dateStr, taskId) => {
    // Carried tasks are shown on today but stored on their origin day — delete at the source.
    const sourceDate = (days[dateStr] && days[dateStr].oneOff.some((t) => t.id === taskId))
      ? dateStr
      : Object.keys(days).find((ds) => (days[ds].oneOff || []).some((t) => t.id === taskId));
    if (!sourceDate) { setOpenMenuTaskId(null); return; }
    const day = getDay(sourceDate);
    const oneOff = day.oneOff.filter((t) => t.id !== taskId);
    const completed = { ...day.completed };
    delete completed[taskId];
    saveDay(sourceDate, { ...day, oneOff, completed });
    setOpenMenuTaskId(null);
  };

  const openAddTask = ({ goalId = null, repeats = false, presetMode = false, lockRepeats = false, dateStr = null } = {}) => {
    const target = dateStr || selectedDateStr;
    setModal({
      mode: 'add', presetMode, lockRepeats, dateStr: target,
      form: {
        id: null, name: '', repeats, hasTime: false, time: '09:00', goalId,
        freq: 'weekly', days: [...ALL_DAYS],
        // Seeded from the day being viewed: switching to monthly while looking at the
        // 1st should already mean "the 1st", not make you hunt for it in the grid.
        monthDays: [Number(target.slice(8, 10))],
        startDate: todayStr, endDate: '', saveAsPreset: false, carryOver: false,
      },
    });
  };
  const openEditTask = (task, { presetMode = false, dateStr = null } = {}) => {
    setModal({
      mode: 'edit',
      presetMode,
      lockRepeats: false,
      dateStr: dateStr || selectedDateStr,
      form: {
        id: task.id,
        name: task.name,
        repeats: task.isRecurring,
        hasTime: !!task.time,
        time: task.time || '09:00',
        goalId: task.goalId || null,
        freq: isMonthly(task) ? 'monthly' : 'weekly',
        days: task.days ? [...task.days] : [...ALL_DAYS],
        monthDays: [...monthDaysOf(task)],
        startDate: task.createdDate || '',
        endDate: task.endDate || '',
        saveAsPreset: false,
        carryOver: !!task.carryOver,
      },
    });
    setOpenMenuTaskId(null);
  };

  // Shared by the weekday chips and the day-of-month grid: both keep at least one
  // selection, since a repeat that matches nothing would just be an invisible task.
  const toggleFormField = (field, value) => {
    setModal((m) => {
      const cur = m.form[field];
      if (cur.includes(value)) {
        if (cur.length === 1) return m;
        return { ...m, form: { ...m.form, [field]: cur.filter((x) => x !== value) } };
      }
      return { ...m, form: { ...m.form, [field]: [...cur, value] } };
    });
  };
  const toggleFormDay = (dow) => toggleFormField('days', dow);
  const toggleFormMonthDay = (n) => toggleFormField('monthDays', n);

  const saveTask = () => {
    const f = modal.form;
    if (!f.name.trim()) return;
    const time = f.hasTime ? f.time : null;

    if (f.repeats) {
      const days = f.days && f.days.length ? f.days : [...ALL_DAYS];
      const startDate = f.startDate || todayStr;
      const endDate = f.endDate || null;
      if (endDate && endDate < startDate) return;
      const freq = f.freq === 'monthly' ? 'monthly' : 'weekly';
      // Fall back to the start date's own day of the month rather than refusing to
      // save, so an empty grid can't leave you with a button that does nothing.
      const monthDays = freq === 'monthly'
        ? [...(f.monthDays && f.monthDays.length ? f.monthDays : [Number(startDate.slice(8, 10))])].sort((a, b) => a - b)
        : [];
      const shape = { name: f.name.trim(), time, goalId: f.goalId, freq, days, monthDays, createdDate: startDate, endDate };
      if (modal.mode === 'add') {
        saveRecurring([...recurring, { id: genId(), ...shape }]);
      } else {
        saveRecurring(recurring.map((r) => (r.id === f.id ? { ...r, ...shape } : r)));
      }
    } else if (modal.presetMode) {
      if (modal.mode === 'add') {
        savePresets([...presets, { id: genId(), name: f.name.trim(), time, goalId: f.goalId, carryOver: f.carryOver }]);
      } else {
        savePresets(presets.map((p) => (p.id === f.id ? { ...p, name: f.name.trim(), time, goalId: f.goalId, carryOver: f.carryOver } : p)));
      }
    } else {
      const targetDateStr = modal.dateStr || selectedDateStr;
      const day = getDay(targetDateStr);
      if (modal.mode === 'add') {
        const newTask = { id: genId(), name: f.name.trim(), time, goalId: f.goalId, carryOver: f.carryOver };
        saveDay(targetDateStr, { ...day, oneOff: [...day.oneOff, newTask] });
      } else {
        const oneOff = day.oneOff.map((t) => (t.id === f.id ? { ...t, name: f.name.trim(), time, goalId: f.goalId, carryOver: f.carryOver } : t));
        saveDay(targetDateStr, { ...day, oneOff });
      }
      if (f.saveAsPreset) {
        savePresets([...presets, { id: genId(), name: f.name.trim(), time, goalId: f.goalId, carryOver: f.carryOver }]);
      }
    }
    setModal(null);
  };

  const deletePreset = (id) => savePresets(presets.filter((p) => p.id !== id));

  const openExportModal = async () => {
    setShowExportModal(true);
    try {
      const backup = { exportedAt: new Date().toISOString(), goals, recurring, presets, days: daysBlob.peek(), groceries };
      setExportJson(JSON.stringify(backup, null, 2));
    } catch (e) {
      setExportJson(t('backup.exportFailed'));
    }
  };

  const downloadExport = () => {
    try {
      const blob = new Blob([exportJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ledger-backup-${todayStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) { /* download not available; the text above can still be copied */ }
  };

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      setCopyStatus(t('backup.copied'));
    } catch (e) {
      setCopyStatus(t('backup.copyManually'));
    }
    setTimeout(() => setCopyStatus(''), 2500);
  };

  const restoreFromBackup = () => {
    let parsed;
    try {
      parsed = JSON.parse(importText);
    } catch (e) {
      setImportStatus(t('backup.invalidJson'));
      return;
    }
    setConfirmDialog({
      message: t('backup.restoreConfirm'),
      confirmLabel: t('common.restore'),
      onConfirm: async () => {
        try {
          if (Array.isArray(parsed.goals)) await saveGoals(parsed.goals);
          if (Array.isArray(parsed.recurring)) await saveRecurring(parsed.recurring);
          if (Array.isArray(parsed.presets)) await savePresets(parsed.presets);
          if (parsed.days && typeof parsed.days === 'object') {
            setDays(parsed.days);
            daysBlob.adopt(parsed.days);
            await daysBlob.flush();
          }
          if (parsed.groceries && typeof parsed.groceries === 'object') {
            const restored = normalizeGroceries(parsed.groceries);
            setGroceries(restored);
            groceryBlob.adopt(restored);
            await groceryBlob.flush();
          }
          setImportStatus('');
          setImportText('');
          setShowImportModal(false);
        } catch (e) {
          setImportStatus(t('backup.restoreFailed'));
        }
      },
    });
  };

  const findMatchingPreset = (task) => presets.find(
    (p) => p.name === task.name && (p.time || null) === (task.time || null) && (p.goalId || null) === (task.goalId || null)
  );
  const togglePresetForTask = (task) => {
    const match = findMatchingPreset(task);
    if (match) {
      savePresets(presets.filter((p) => p.id !== match.id));
    } else {
      savePresets([...presets, { id: genId(), name: task.name, time: task.time || null, goalId: task.goalId || null }]);
    }
  };

  const addGoal = () => {
    if (!newGoalName.trim()) return;
    const color = GOAL_COLORS[goals.length % GOAL_COLORS.length];
    saveGoals([...goals, { id: genId(), name: newGoalName.trim(), color, kind: newGoalKind, achievedDate: null }]);
    setNewGoalName('');
    setNewGoalKind('ongoing');
    setShowAddGoalInManage(false);
  };
  const deleteGoal = (id) => {
    setConfirmDialog({
      message: t('manage.goalDeleteConfirm'),
      onConfirm: () => {
        saveGoals(goals.filter((g) => g.id !== id));
        if (activeGoalFilter === id) setActiveGoalFilter(null);
        if (manageGoalId === id) setManageGoalId(null);
      },
    });
  };
  const cycleGoalColor = (id) => {
    saveGoals(goals.map((g) => (g.id === id ? { ...g, color: GOAL_COLORS[(GOAL_COLORS.indexOf(g.color) + 1) % GOAL_COLORS.length] } : g)));
  };
  // Tapping the same icon again clears it, so a goal can always go back to being
  // just a coloured dot.
  const setGoalIcon = (id, icon) => {
    saveGoals(goals.map((g) => (g.id === id ? { ...g, icon: g.icon === icon ? null : icon } : g)));
  };
  const startEditGoalName = (g) => { setEditingGoalId(g.id); setEditingGoalName(g.name); };
  const commitEditGoalName = () => {
    if (editingGoalName.trim()) {
      saveGoals(goals.map((g) => (g.id === editingGoalId ? { ...g, name: editingGoalName.trim() } : g)));
    }
    setEditingGoalId(null);
  };

  // ---- Derived data ----
  const weekAnchor = startOfWeek(fromDateStr(selectedDateStr));
  const weekDates = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(weekAnchor, i)));

  const rawTasks = getTasksForDate(selectedDateStr);
  const tasks = activeGoalFilter
    ? (activeGoalFilter === NO_GOAL_ID ? rawTasks.filter((t) => !t.goalId) : rawTasks.filter((t) => t.goalId === activeGoalFilter))
    : rawTasks;
  const dayCompleted = getDay(selectedDateStr).completed;
  // The day page reads: everything with a time first in time order, then a group per
  // goal, then anything without a goal. Completed tasks sink to the bottom of their
  // own section rather than leaving it, so sections keep a stable size and the x/y
  // counts on the goal pills stay easy to reconcile with what's on screen.
  //
  // Sort is stable, so tasks that tie keep the order they were added in — nothing
  // reshuffles when you rename something.
  const doneLast = (a, b) => {
    const aDone = !!dayCompleted[a.id];
    const bDone = !!dayCompleted[b.id];
    if (aDone === bDone) return 0;
    return aDone ? 1 : -1;
  };
  const taskSections = [];
  {
    const timed = tasks
      .filter((x) => x.time)
      .sort((a, b) => doneLast(a, b) || a.time.localeCompare(b.time));
    if (timed.length) taskSections.push({ key: '__timed__', label: t('task.timedSection'), tasks: timed });

    const untimed = tasks.filter((x) => !x.time);
    // Goal order follows the pills row, so the page and the filter agree.
    goals.forEach((g) => {
      const items = untimed.filter((x) => x.goalId === g.id).sort(doneLast);
      if (items.length) taskSections.push({ key: g.id, label: g.name, goal: g, tasks: items });
    });

    // Deleting a goal leaves its tasks with a goalId that no longer resolves, so
    // "no goal" has to mean "no goal we can find", not just a missing id.
    const others = untimed.filter((x) => !goalById(x.goalId)).sort(doneLast);
    if (others.length) taskSections.push({ key: NO_GOAL_ID, label: t('common.others'), tasks: others });
  }
  const selDate = fromDateStr(selectedDateStr);
  const dateHeadline = formatHeadline(selDate, locale);

  // Progress for the bar. Counted from `tasks` rather than `rawTasks` so the bar
  // follows the active goal filter — filter to one goal and you see that goal's
  // ratio, which is what you're looking at on screen.
  const doneCount = tasks.filter((t) => dayCompleted[t.id]).length;
  const activeGoalName = activeGoalFilter
    ? (activeGoalFilter === NO_GOAL_ID ? t('common.others') : (goalById(activeGoalFilter) || {}).name)
    : null;

  // The mascot in the header reflects the day: asleep with nothing to do, pleased
  // once everything is ticked off.
  const dayMood = tasks.length === 0 ? 'sleepy' : doneCount === tasks.length ? 'cheer' : 'idle';

  // Per-goal counts for the pills, always from the unfiltered day so every pill
  // keeps showing its own total while one of them is selected.
  const goalProgress = {};
  rawTasks.forEach((t) => {
    const key = t.goalId || NO_GOAL_ID;
    if (!goalProgress[key]) goalProgress[key] = { done: 0, total: 0 };
    goalProgress[key].total += 1;
    if (dayCompleted[t.id]) goalProgress[key].done += 1;
  });

  // Newest first — the most recent achievement is the one you want to see.
  const achievedGoals = goals
    .filter(goalAchieved)
    .sort((a, b) => (b.achievedDate || '').localeCompare(a.achievedDate || ''));

  const manageFilterGoalId = manageGoalId === NO_GOAL_ID ? null : manageGoalId;
  // "Others" means "no goal we can find" — the same rule the day page groups by — so a
  // task whose goal was deleted is reachable here instead of belonging nowhere.
  const belongsToManagedGoal = (item) => (
    manageGoalId === NO_GOAL_ID ? !goalById(item.goalId) : (item.goalId || null) === manageFilterGoalId
  );
  const goalDayTaskRows = [];
  if (manageGoalId) {
    Object.entries(days).forEach(([ds, day]) => {
      day.oneOff.forEach((task) => {
        if (!belongsToManagedGoal(task)) return;
        // A keep-until-complete task is stored on the day it was created but shown, and
        // ticked off, on its home day. Read the date and the tick from there — reading
        // the storage day makes a task you completed on the day page look untouched.
        const homeDs = task.carryOver ? carryHomeDay(task.id) : ds;
        goalDayTaskRows.push({
          ...task,
          dateStr: homeDs,
          sourceDateStr: ds,
          completed: !!(days[homeDs] || defaultDay()).completed[task.id],
        });
      });
    });
    goalDayTaskRows.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }

  const Mascot = theme.Mascot;

  if (loading) {
    return (
      <div className="dt-loading">
        <Mascot size={56} mood="idle" label={t(theme.ariaKey)} />
        <div>{t('auth.loading')}</div>
      </div>
    );
  }

  return (
    <div className="dt-app">
      <div className="dt-container">
        {storageError && (
          <div className="dt-storage-warning">
            <strong>⚠ {t('error.notSaving')}</strong>
            <div style={{ marginTop: 4 }}>{storageError}</div>
            <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85 }}>{t('error.exportFirst')}</div>
          </div>
        )}
        <div className="dt-header">
          <div className="dt-topbar">
            <div className="dt-brand">
              <div className={`dt-header-mascot ${dayMood === 'cheer' ? 'cheer' : ''}`}>
                <Mascot size={38} mood={dayMood} label={t(theme.ariaKey)} />
              </div>
              <div>
                <div className="dt-wordmark">{t('app.name')}</div>
                <div className="dt-tagline">{t('app.tagline')}</div>
              </div>
            </div>
            <div className="dt-topbar-actions">
              <button className="dt-capture-btn" title={t('capture.title')} onClick={() => setShowCapture(true)}>
                <Sparkles size={20} />
              </button>
              {/* The badge is the whole point of putting this in the header rather than
                  inside Manage: you can see there's shopping to do without opening it. */}
              <button className="dt-cart-btn" title={t('grocery.title')} onClick={() => setShowGroceries(true)}>
                <ShoppingCart size={20} />
                {outstandingGroceries > 0 && <span className="dt-cart-badge">{outstandingGroceries}</span>}
              </button>
              <button className="dt-settings-btn" title={t('manage.title')} onClick={() => { setManageGoalId(null); setShowAddGoalInManage(false); setIconPickerGoalId(null); setShowManage(true); }}>
                <Settings size={20} />
              </button>
            </div>
          </div>

          <div className="dt-goals-row">
            {/* Only goals with something on this day, so a pile of long-term projects
                doesn't crowd the row. The active filter stays visible even once its
                count drops to zero, otherwise you'd have no way to switch it off. */}
            {goals.filter((g) => goalProgress[g.id] || activeGoalFilter === g.id).map((g) => {
              const active = activeGoalFilter === g.id;
              const count = goalProgress[g.id];
              return (
                <div
                  key={g.id}
                  className={`dt-goal-pill ${active ? 'active' : ''}`}
                  onClick={() => setActiveGoalFilter(active ? null : g.id)}
                >
                  {hasGoalIcon(g.icon) ? (
                    <span className="dt-goal-icon">
                      <GoalIcon icon={g.icon} size={13} color={active ? 'var(--paper)' : g.color} />
                    </span>
                  ) : (
                    <span className="dt-goal-dot" style={{ background: active ? 'var(--paper)' : g.color }} />
                  )}
                  {g.name}
                  {count && <span className="dt-goal-count">{count.done}/{count.total}</span>}
                </div>
              );
            })}
            <div
              className={`dt-goal-pill ${activeGoalFilter === NO_GOAL_ID ? 'active' : ''}`}
              onClick={() => setActiveGoalFilter(activeGoalFilter === NO_GOAL_ID ? null : NO_GOAL_ID)}
            >
              <span className="dt-goal-dot" style={{ background: activeGoalFilter === NO_GOAL_ID ? 'var(--paper)' : NO_GOAL_COLOR }} />
              {t('common.others')}
              {goalProgress[NO_GOAL_ID] && (
                <span className="dt-goal-count">{goalProgress[NO_GOAL_ID].done}/{goalProgress[NO_GOAL_ID].total}</span>
              )}
            </div>
          </div>

          <div className="dt-date-row">
            <div className="dt-date-headline" onClick={() => setShowCalendar(true)}>{dateHeadline}</div>
            {selectedDateStr !== todayStr && (
              <button className="dt-today-btn" onClick={() => setSelectedDateStr(todayStr)}>
                <CalendarDays size={12} /> {t('common.today')}
              </button>
            )}
          </div>

          <div className="dt-week-strip">
            <button className="dt-week-arrow" onClick={() => setSelectedDateStr(toDateStr(addDays(fromDateStr(selectedDateStr), -7)))}>
              <ChevronLeft size={18} />
            </button>
            {weekDates.map((ds, i) => {
              const dTasks = getTasksForDate(ds);
              const day = getDay(ds);
              const hasTasks = dTasks.length > 0;
              const dDone = dTasks.filter((t) => day.completed[t.id]).length;
              const allComplete = hasTasks && dDone === dTasks.length;
              // --p drives the dot's conic-gradient, turning it into a tiny
              // progress ring: slate when untouched, gold once finished.
              const pct = hasTasks ? Math.round((dDone / dTasks.length) * 100) : 0;
              return (
                <button
                  key={ds}
                  className={`dt-day-tab ${ds === selectedDateStr ? 'selected' : ''} ${ds === todayStr ? 'today' : ''}`}
                  onClick={() => setSelectedDateStr(ds)}
                >
                  <span className="letter">{weekdayLetters[i]}</span>
                  <span className="num">{fromDateStr(ds).getDate()}</span>
                  <span
                    className={`dt-tab-indicator ${allComplete ? 'complete' : hasTasks ? 'has-tasks' : ''}`}
                    style={{ '--p': pct }}
                  />
                </button>
              );
            })}
            <button className="dt-week-arrow" onClick={() => setSelectedDateStr(toDateStr(addDays(fromDateStr(selectedDateStr), 7)))}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <ProgressBar done={doneCount} total={tasks.length} scopeLabel={activeGoalName} />

        <div className="dt-body">
          {tasks.length === 0 && (
            <div className="dt-empty-state">
              <div className="dt-empty-mascot">
                <Mascot size={76} mood="sleepy" label={t(theme.ariaKey)} />
              </div>
              <div className="headline">{t('task.emptyHeadline')}</div>
              <div>{t('task.emptyBody', { date: dateHeadline })}</div>
            </div>
          )}

          {/* `task`, not `t` — `t` is the translate function in this scope. */}
          {taskSections.map((section) => (
            <div key={section.key}>
              <div className="dt-section-label dt-section-label-row">
                {section.goal && (hasGoalIcon(section.goal.icon)
                  ? <GoalIcon icon={section.goal.icon} size={11} color={section.goal.color} />
                  : <span className="dt-goal-dot" style={{ background: section.goal.color, width: 6, height: 6 }} />)}
                {section.key === NO_GOAL_ID && (
                  <span className="dt-goal-dot" style={{ background: NO_GOAL_COLOR, width: 6, height: 6 }} />
                )}
                {section.label}
              </div>
              {section.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  t={t}
                  locale={locale}
                  goal={goalById(task.goalId)}
                  // Inside a goal section the heading already names the goal, so
                  // repeating it on every row is noise. The timed section mixes
                  // goals, so it keeps the chip.
                  hideGoal={!!section.goal}
                  completed={!!dayCompleted[task.id]}
                  menuOpen={openMenuTaskId === task.id}
                  onToggleMenu={() => setOpenMenuTaskId(openMenuTaskId === task.id ? null : task.id)}
                  onCloseMenu={() => setOpenMenuTaskId(null)}
                  onToggleComplete={() => toggleComplete(selectedDateStr, task.id)}
                  onEdit={() => openEditTask(task, task.carriedFrom ? { dateStr: task.carriedFrom } : {})}
                  onSkipToday={() => skipToday(selectedDateStr, task.id)}
                  onStopRepeating={() => stopRepeating(task.id)}
                  onDelete={() => deleteOneOff(selectedDateStr, task.id)}
                />
              ))}
            </div>
          ))}
        </div>

        <button className="dt-fab" onClick={() => openAddTask()}><Plus size={26} /></button>
      </div>

      {showCalendar && (
        <CalendarPicker
          selectedDateStr={selectedDateStr}
          todayStr={todayStr}
          locale={locale}
          t={t}
          weekdayLetters={weekdayLetters}
          onSelect={(ds) => { setSelectedDateStr(ds); setShowCalendar(false); }}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {confirmDialog && (
        <div className="dt-modal-overlay" style={{ zIndex: 70 }} onClick={() => setConfirmDialog(null)}>
          <div className="dt-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, color: 'var(--ink)', marginBottom: 20, lineHeight: 1.4 }}>{confirmDialog.message}</div>
            <div className="dt-modal-actions">
              <button className="dt-btn-secondary" onClick={() => setConfirmDialog(null)}>{t('common.cancel')}</button>
              <button
                className="dt-btn-primary"
                style={{ background: 'var(--brick)' }}
                onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
              >{confirmDialog.confirmLabel || t('common.delete')}</button>
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="dt-modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="dt-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="dt-modal-title">
              {t('backup.exportTitle')}
              <button className="dt-icon-btn" onClick={() => setShowExportModal(false)}><X size={20} /></button>
            </div>
            <div className="dt-hint" style={{ marginTop: 0 }}>{t('backup.exportHint')}</div>
            <textarea
              className="dt-backup-textarea"
              readOnly
              value={exportJson}
              onClick={(e) => e.target.select()}
              style={{ marginBottom: 14 }}
            />
            <div className="dt-modal-actions">
              <button className="dt-btn-secondary" onClick={copyExport}>{copyStatus || t('backup.copyText')}</button>
              <button className="dt-btn-primary" onClick={downloadExport}>{t('backup.downloadFile')}</button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="dt-modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="dt-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="dt-modal-title">
              {t('backup.restoreTitle')}
              <button className="dt-icon-btn" onClick={() => setShowImportModal(false)}><X size={20} /></button>
            </div>
            <div className="dt-hint" style={{ marginTop: 0 }}>{t('backup.restoreHint')}</div>
            <textarea
              className="dt-backup-textarea"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={t('backup.pastePlaceholder')}
              style={{ height: 140, marginBottom: 10 }}
            />
            {importStatus && <div className="dt-hint" style={{ marginTop: 0, color: 'var(--brick)' }}>{importStatus}</div>}
            <div className="dt-modal-actions">
              <button className="dt-btn-secondary" onClick={() => setShowImportModal(false)}>{t('common.cancel')}</button>
              <button className="dt-btn-primary" onClick={restoreFromBackup}>{t('common.restore')}</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="dt-modal-overlay" onClick={() => setModal(null)}>
          <div className="dt-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="dt-modal-title">
              {modal.mode === 'add' ? t('task.new') : t('task.edit')}
              <button className="dt-icon-btn" onClick={() => setModal(null)}><X size={20} /></button>
            </div>

            <div className="dt-field">
              <label className="dt-field-label">{t('task.label')}</label>
              <input
                autoFocus
                className="dt-input"
                placeholder={t('task.placeholder')}
                value={modal.form.name}
                onChange={(e) => setModal({ ...modal, form: { ...modal.form, name: e.target.value } })}
              />
            </div>

            {!(modal.mode === 'add' && modal.lockRepeats) && (
              <div className="dt-field">
                <label className="dt-field-label">{t('task.repeatsLabel')}</label>
                {modal.mode === 'add' ? (
                  <div className="dt-segmented">
                    <button
                      className={`dt-segmented-btn ${!modal.form.repeats ? 'active' : ''}`}
                      onClick={() => setModal({ ...modal, form: { ...modal.form, repeats: false } })}
                    >{modal.presetMode ? t('task.oneOff') : t('task.justToday')}</button>
                    <button
                      className={`dt-segmented-btn ${modal.form.repeats ? 'active' : ''}`}
                      onClick={() => setModal({ ...modal, form: { ...modal.form, repeats: true } })}
                    >{modal.presetMode ? t('task.repeated') : t('task.repeats')}</button>
                  </div>
                ) : (
                  <div className="dt-hint" style={{ marginTop: 0 }}>
                    {modal.form.repeats ? t('task.lockedRepeating') : t('task.lockedOneOff')}
                  </div>
                )}
              </div>
            )}

            {modal.form.repeats && (
              <div className="dt-field">
                <label className="dt-field-label">{t('task.repeatEvery')}</label>
                <div className="dt-segmented" style={{ marginBottom: 10 }}>
                  {['weekly', 'monthly'].map((fq) => (
                    <button
                      key={fq}
                      className={`dt-segmented-btn ${modal.form.freq === fq ? 'active' : ''}`}
                      onClick={() => setModal({ ...modal, form: { ...modal.form, freq: fq } })}
                    >{t(fq === 'weekly' ? 'task.freqWeekly' : 'task.freqMonthly')}</button>
                  ))}
                </div>

                {modal.form.freq === 'monthly' ? (
                  <>
                    <div className="dt-subfield-label">{t('task.whichDates')}</div>
                    <div className="dt-month-chips">
                      {MONTH_DAYS.map((n) => (
                        <button
                          key={n}
                          className={`dt-day-chip ${modal.form.monthDays.includes(n) ? 'active' : ''}`}
                          onClick={() => toggleFormMonthDay(n)}
                        >{n}</button>
                      ))}
                    </div>
                    <div className="dt-hint" style={{ marginTop: 8, marginBottom: 0 }}>{t('task.monthEndHint')}</div>
                  </>
                ) : (
                  <>
                    <div className="dt-preset-row">
                      <button className="dt-preset-btn" onClick={() => setModal({ ...modal, form: { ...modal.form, days: [...ALL_DAYS] } })}>{t('days.everyDay')}</button>
                      <button className="dt-preset-btn" onClick={() => setModal({ ...modal, form: { ...modal.form, days: [1, 2, 3, 4, 5] } })}>{t('days.weekdays')}</button>
                      <button className="dt-preset-btn" onClick={() => setModal({ ...modal, form: { ...modal.form, days: [0, 6] } })}>{t('days.weekends')}</button>
                    </div>
                    <div className="dt-day-chips">
                      {WEEKDAY_ORDER.map((dow, i) => (
                        <button
                          key={dow}
                          className={`dt-day-chip ${modal.form.days.includes(dow) ? 'active' : ''}`}
                          onClick={() => toggleFormDay(dow)}
                        >{weekdayLetters[i]}</button>
                      ))}
                    </div>
                  </>
                )}
                {modal.mode === 'edit' && (
                  <div className="dt-hint" style={{ marginTop: 10 }}>{t('task.editAffectsAll')}</div>
                )}
              </div>
            )}

            {modal.form.repeats && (
              <div className="dt-field">
                <label className="dt-field-label">{t('task.activeDates')}</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div className="dt-subfield-label">{t('task.starts')}</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="date"
                        className="dt-input"
                        style={{ flex: 1 }}
                        value={modal.form.startDate}
                        onChange={(e) => setModal({ ...modal, form: { ...modal.form, startDate: e.target.value } })}
                      />
                      {modal.form.startDate && (
                        <button className="dt-icon-btn" onClick={() => setModal({ ...modal, form: { ...modal.form, startDate: '' } })}><X size={14} /></button>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="dt-subfield-label">{t('task.ends')}</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="date"
                        className="dt-input"
                        style={{ flex: 1 }}
                        value={modal.form.endDate}
                        onChange={(e) => setModal({ ...modal, form: { ...modal.form, endDate: e.target.value } })}
                      />
                      {modal.form.endDate && (
                        <button className="dt-icon-btn" onClick={() => setModal({ ...modal, form: { ...modal.form, endDate: '' } })}><X size={14} /></button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="dt-hint" style={{ marginTop: 8, marginBottom: 0 }}>{t('task.datesHint')}</div>
              </div>
            )}

            <div className="dt-field">
              <label className="dt-field-label">{t('task.time')}</label>
              <div className="dt-segmented" style={{ marginBottom: modal.form.hasTime ? 10 : 0 }}>
                <button
                  className={`dt-segmented-btn ${!modal.form.hasTime ? 'active' : ''}`}
                  onClick={() => setModal({ ...modal, form: { ...modal.form, hasTime: false } })}
                >{t('task.anyTime')}</button>
                <button
                  className={`dt-segmented-btn ${modal.form.hasTime ? 'active' : ''}`}
                  onClick={() => setModal({ ...modal, form: { ...modal.form, hasTime: true } })}
                >{t('task.setTime')}</button>
              </div>
              {modal.form.hasTime && (
                <input
                  type="time"
                  className="dt-input"
                  value={modal.form.time}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, time: e.target.value } })}
                />
              )}
            </div>

            <div className="dt-field">
              <label className="dt-field-label">{t('task.goal')}</label>
              <div className="dt-goal-picker">
                <div
                  className={`dt-goal-option ${modal.form.goalId === null ? 'active' : ''}`}
                  onClick={() => setModal({ ...modal, form: { ...modal.form, goalId: null } })}
                >{t('common.others')}</div>
                {/* An achieved goal takes no new work. It stays selectable only when the
                    task being edited already belongs to it, so editing can't silently
                    strip a task's goal. */}
                {goals.filter((g) => !goalAchieved(g) || modal.form.goalId === g.id).map((g) => {
                  const picked = modal.form.goalId === g.id;
                  return (
                    <div
                      key={g.id}
                      className={`dt-goal-option ${picked ? 'active' : ''}`}
                      onClick={() => setModal({ ...modal, form: { ...modal.form, goalId: g.id } })}
                    >
                      {hasGoalIcon(g.icon) ? (
                        <GoalIcon icon={g.icon} size={12} color={picked ? 'var(--paper)' : g.color} />
                      ) : (
                        <span className="dt-goal-chip-dot" style={{ background: picked ? 'var(--paper)' : g.color, display: 'inline-block' }} />
                      )}
                      {g.name}
                    </div>
                  );
                })}
              </div>
            </div>

            {!modal.presetMode && modal.mode === 'add' && !modal.form.repeats && modal.form.goalId && presets.filter((p) => p.goalId === modal.form.goalId).length > 0 && (
              <div className="dt-field">
                <label className="dt-field-label">{t('task.quickAdd', { goal: goalById(modal.form.goalId)?.name })}</label>
                <div className="dt-goal-picker">
                  {presets.filter((p) => p.goalId === modal.form.goalId).map((p) => (
                    <div
                      key={p.id}
                      className="dt-goal-option"
                      onClick={() => setModal({ ...modal, form: { ...modal.form, name: p.name, hasTime: !!p.time, time: p.time || modal.form.time, carryOver: !!p.carryOver } })}
                    >
                      {p.name}{p.time ? ` · ${p.time}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!modal.form.repeats && (
              <label className="dt-checkbox-row">
                <input
                  type="checkbox"
                  checked={modal.form.carryOver}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, carryOver: e.target.checked } })}
                />
                {t('task.keepUntilComplete')}
              </label>
            )}

            {!modal.presetMode && !modal.form.repeats && (
              <label className="dt-checkbox-row">
                <input
                  type="checkbox"
                  checked={modal.form.saveAsPreset}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, saveAsPreset: e.target.checked } })}
                />
                {t('task.saveAsPreset', { goal: modal.form.goalId ? goalById(modal.form.goalId)?.name : t('common.others') })}
              </label>
            )}

            <div className="dt-modal-actions">
              <button className="dt-btn-secondary" onClick={() => setModal(null)}>{t('common.cancel')}</button>
              <button className="dt-btn-primary" onClick={saveTask}>{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {showCapture && (
        <CapturePanel
          onParse={parseAndGuard}
          onApply={applyProposal}
          onClose={() => setShowCapture(false)}
          formatDate={(ds) => formatShortDate(fromDateStr(ds), locale)}
        />
      )}

      {showGroceries && (
        <GroceryList
          list={groceries}
          onAdd={addGrocery}
          onToggle={(id) => saveGroceries(toggleItem(groceries, id))}
          onRemove={(id) => saveGroceries(removeItem(groceries, id))}
          onClearBought={() => saveGroceries(clearBought(groceries))}
          onClose={() => setShowGroceries(false)}
        />
      )}

      {showManage && (
        <div className="dt-manage-panel" onClick={() => setShowManage(false)}>
          <div className="dt-manage-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="dt-modal-title">
              {t('manage.title')}
              <button className="dt-icon-btn" onClick={() => setShowManage(false)}><X size={20} /></button>
            </div>

            {!manageGoalId && (
              <>
                {goals.length === 0 && <div className="dt-empty-manage">{t('manage.noGoals')}</div>}
                {goals.filter((g) => !goalAchieved(g)).map((g) => {
                  const ready = canAchieve(g);
                  return (
                    <div key={g.id}>
                      <div className="dt-goal-edit-row">
                        <button
                          className="dt-goal-badge-btn"
                          style={{ background: g.color }}
                          onClick={() => cycleGoalColor(g.id)}
                          title={t('manage.changeColour')}
                        >
                          <GoalIcon icon={g.icon} size={13} color="currentColor" />
                        </button>
                        {editingGoalId === g.id ? (
                          <input
                            autoFocus
                            className="dt-goal-name-input"
                            value={editingGoalName}
                            onChange={(e) => setEditingGoalName(e.target.value)}
                            onBlur={commitEditGoalName}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitEditGoalName(); if (e.key === 'Escape') setEditingGoalId(null); }}
                          />
                        ) : (
                          <div className="dt-goal-name-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => setManageGoalId(g.id)}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {g.name}
                              {ready && <span className="dt-ready-chip"><Sparkles size={9} /> {t('goal.ready')}</span>}
                            </span>
                            <ChevronRight size={16} color="var(--muted)" />
                          </div>
                        )}
                        <button
                          className="dt-icon-btn"
                          title={t('manage.pickIcon')}
                          onClick={() => setIconPickerGoalId(iconPickerGoalId === g.id ? null : g.id)}
                        >
                          <Smile size={16} />
                        </button>
                        <button className="dt-icon-btn" title={t('manage.rename')} onClick={() => startEditGoalName(g)}><Pencil size={15} /></button>
                        <button className="dt-icon-btn danger" title={t('common.delete')} onClick={() => deleteGoal(g.id)}><Trash2 size={16} /></button>
                      </div>
                      {iconPickerGoalId === g.id && (
                        <div className="dt-icon-grid" style={{ padding: '10px 0 12px' }}>
                          {GOAL_ICONS.map(({ id, Icon }) => (
                            <button
                              key={id}
                              className={`dt-icon-option ${g.icon === id ? 'active' : ''}`}
                              title={t(`goalIcon.${id}`)}
                              onClick={() => setGoalIcon(g.id, id)}
                            >
                              <Icon size={16} strokeWidth={2.2} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="dt-goal-edit-row" style={{ marginTop: 8 }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: NO_GOAL_COLOR, display: 'inline-block', flexShrink: 0 }} />
                  <div className="dt-goal-name-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => setManageGoalId(NO_GOAL_ID)}>
                    <span>{t('common.others')}</span>
                    <ChevronRight size={16} color="var(--muted)" />
                  </div>
                </div>

                {showAddGoalInManage ? (
                  <div style={{ marginTop: 12 }}>
                    <div className="dt-segmented" style={{ marginBottom: 8 }}>
                      {['ongoing', 'project'].map((k) => (
                        <button
                          key={k}
                          className={`dt-segmented-btn ${newGoalKind === k ? 'active' : ''}`}
                          onClick={() => setNewGoalKind(k)}
                        >{t(k === 'ongoing' ? 'goal.kindOngoing' : 'goal.kindProject')}</button>
                      ))}
                    </div>
                    <div className="dt-kind-hint" style={{ marginBottom: 10 }}>{t('goal.kindHint')}</div>
                    <div className="dt-add-goal-row" style={{ marginTop: 0 }}>
                    <input
                      autoFocus
                      className="dt-input"
                      placeholder={t('manage.newGoalName')}
                      value={newGoalName}
                      onChange={(e) => setNewGoalName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addGoal(); if (e.key === 'Escape') { setShowAddGoalInManage(false); setNewGoalName(''); } }}
                    />
                    <button className="dt-goal-add" onClick={addGoal}><Check size={14} /></button>
                    </div>
                  </div>
                ) : (
                  <button className="dt-preset-btn" style={{ width: '100%', marginTop: 12, padding: '10px' }} onClick={() => setShowAddGoalInManage(true)}>
                    <Plus size={14} /> {t('manage.addGoal')}
                  </button>
                )}

                {achievedGoals.length > 0 && (
                  <>
                    <button className="dt-done-header" onClick={() => setShowAchieved(!showAchieved)}>
                      <span className="rule" />
                      {t('manage.achievedSection', { n: achievedGoals.length })}
                      <ChevronDown size={14} style={{ transform: showAchieved ? 'none' : 'rotate(-90deg)' }} />
                      <span className="rule" />
                    </button>
                    {showAchieved && achievedGoals.map((g) => (
                      <div key={g.id} className="dt-goal-edit-row">
                        <span className="dt-goal-badge-btn" style={{ background: g.color, opacity: 0.55 }}>
                          <GoalIcon icon={g.icon} size={13} color="currentColor" />
                        </span>
                        <div
                          className="dt-goal-name-text"
                          style={{ color: 'var(--muted)' }}
                          onClick={() => setManageGoalId(g.id)}
                        >{g.name}</div>
                        <span className="dt-done-date">{formatShortDate(fromDateStr(g.achievedDate), locale)}</span>
                        <ChevronRight size={16} color="var(--muted)" />
                      </div>
                    ))}
                  </>
                )}

                <div className="dt-manage-section">
                  <div className="dt-field-label" style={{ marginBottom: 10 }}>{t('manage.language')}</div>
                  <LanguagePicker />
                </div>

                <div className="dt-manage-section">
                  <div className="dt-field-label" style={{ marginBottom: 10 }}>{t('manage.appearance')}</div>
                  <div className="dt-theme-grid">
                    {/* `th`, not `t` — `t` is the translate function in this scope. */}
                    {themes.map((th) => {
                      const ThemeMascot = th.Mascot;
                      const active = th.id === themeId;
                      return (
                        <button
                          key={th.id}
                          className={`dt-theme-card ${active ? 'active' : ''}`}
                          onClick={() => setThemeId(th.id)}
                        >
                          <ThemeMascot size={40} mood={active ? 'cheer' : 'idle'} label={t(th.ariaKey)} />
                          <div className="dt-theme-card-body">
                            <div className="dt-theme-name">
                              {t(th.nameKey)}
                              {active && <Check size={12} strokeWidth={3} color="var(--moss)" />}
                            </div>
                            <div className="dt-theme-blurb">{t(th.blurbKey)}</div>
                            <div className="dt-theme-swatches">
                              {th.swatches.map((c) => (
                                <span key={c} className="dt-theme-swatch" style={{ background: c }} />
                              ))}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="dt-manage-section">
                  <div className="dt-field-label" style={{ marginBottom: 10 }}>{t('manage.backup')}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="dt-preset-btn" style={{ flex: 1, padding: '10px' }} onClick={openExportModal}>
                      <Download size={14} /> {t('backup.export')}
                    </button>
                    <button className="dt-preset-btn" style={{ flex: 1, padding: '10px' }} onClick={() => { setImportText(''); setImportStatus(''); setShowImportModal(true); }}>
                      <Upload size={14} /> {t('backup.restore')}
                    </button>
                  </div>
                </div>

                <div className="dt-manage-section">
                  <div className="dt-field-label" style={{ marginBottom: 10 }}>{t('manage.account')}</div>
                  <PasswordSetting />
                  <div className="dt-hint" style={{ margin: '8px 0 12px' }}>
                    {t('password.hint')}
                  </div>
                  <button className="dt-preset-btn danger" style={{ width: '100%', padding: '10px' }} onClick={signOut}>
                    <LogOut size={14} /> {t('account.signOut')}
                  </button>
                  <div className="dt-hint" style={{ margin: '8px 0 0' }}>
                    {t('account.signOutHint')}
                  </div>
                </div>
              </>
            )}

            {manageGoalId && (
              <GoalDetail
                goal={manageGoalId === NO_GOAL_ID ? { id: null, name: t('common.others'), color: NO_GOAL_COLOR } : goalById(manageGoalId)}
                isNoGoal={manageGoalId === NO_GOAL_ID}
                t={t}
                locale={locale}
                weekdayAbbr={weekdayAbbr}
                goalKind={manageGoalId !== NO_GOAL_ID ? (isProject(goalById(manageGoalId)) ? 'project' : 'ongoing') : 'ongoing'}
                achievedDate={manageGoalId !== NO_GOAL_ID ? (goalById(manageGoalId) || {}).achievedDate : null}
                canAchieve={manageGoalId !== NO_GOAL_ID && canAchieve(goalById(manageGoalId))}
                onSetKind={(kind) => setGoalKind(manageGoalId, kind)}
                onAchieve={() => achieveGoal(manageGoalId)}
                onReopen={() => reopenGoal(manageGoalId)}
                todayStr={todayStr}
                recurringTasks={recurring.filter((r) => belongsToManagedGoal(r) && (!r.endDate || r.endDate >= todayStr))}
                dayTaskRows={goalDayTaskRows}
                presetTasks={presets.filter((p) => belongsToManagedGoal(p))}
                findMatchingPreset={findMatchingPreset}
                onTogglePresetForTask={togglePresetForTask}
                onToggleTaskComplete={(row) => toggleComplete(row.dateStr, row.id)}
                openMenuTaskId={openMenuTaskId}
                onToggleRowMenu={(id) => setOpenMenuTaskId(openMenuTaskId === id ? null : id)}
                onCloseRowMenu={() => setOpenMenuTaskId(null)}
                /* Edit and delete act on where the task is stored, which is not where a
                   carried task is shown — hence sourceDateStr rather than dateStr. */
                onEditTaskInstance={(row) => openEditTask({ id: row.id, name: row.name, time: row.time, goalId: row.goalId, carryOver: row.carryOver, isRecurring: false }, { presetMode: false, dateStr: row.sourceDateStr })}
                onDeleteTaskInstance={(row) => { deleteOneOff(row.sourceDateStr, row.id); setOpenMenuTaskId(null); }}
                editingGoalId={editingGoalId}
                editingGoalName={editingGoalName}
                setEditingGoalName={setEditingGoalName}
                onBack={() => setManageGoalId(null)}
                onCycleColor={() => cycleGoalColor(manageGoalId)}
                onStartRename={() => startEditGoalName(goalById(manageGoalId))}
                onCommitRename={commitEditGoalName}
                onCancelRename={() => setEditingGoalId(null)}
                onEditRecurring={(r) => openEditTask({ id: r.id, name: r.name, time: r.time, goalId: r.goalId, freq: r.freq, days: r.days, monthDays: r.monthDays, createdDate: r.createdDate, endDate: r.endDate, isRecurring: true }, { presetMode: true })}
                onDeleteRecurring={deleteRecurringEntirely}
                onEditPreset={(p) => openEditTask({ id: p.id, name: p.name, time: p.time, goalId: p.goalId, isRecurring: false }, { presetMode: true })}
                onDeletePreset={deletePreset}
                onAddPreset={() => openAddTask({
                  goalId: manageFilterGoalId,
                  repeats: false,
                  presetMode: manageGoalId === NO_GOAL_ID,
                  dateStr: todayStr,
                })}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarPicker({ selectedDateStr, todayStr, locale, t, weekdayLetters, onSelect, onClose }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = fromDateStr(selectedDateStr);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const gridStart = startOfWeek(viewMonth);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const shiftMonth = (n) => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + n, 1));

  return (
    <div className="dt-calendar-overlay" onClick={onClose}>
      <div className="dt-calendar-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="dt-cal-header">
          <div className="dt-cal-month">{formatMonthYear(viewMonth, locale)}</div>
          <div className="dt-cal-nav">
            <button className="dt-cal-arrow" onClick={() => shiftMonth(-1)}><ChevronLeft size={20} /></button>
            <button className="dt-cal-arrow" onClick={() => shiftMonth(1)}><ChevronRight size={20} /></button>
            <button className="dt-cal-today-link" onClick={() => onSelect(todayStr)}>{t('common.today')}</button>
          </div>
        </div>
        <div className="dt-cal-weekdays">
          {weekdayLetters.map((l, i) => <div key={i} className="dt-cal-weekday">{l}</div>)}
        </div>
        <div className="dt-cal-grid">
          {cells.map((cell) => {
            const ds = toDateStr(cell);
            const outside = cell.getMonth() !== viewMonth.getMonth();
            const isToday = ds === todayStr;
            const isSelected = ds === selectedDateStr;
            return (
              <button
                key={ds}
                className={`dt-cal-cell ${outside ? 'outside' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelect(ds)}
              >
                {cell.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GoalDetail({
  goal, isNoGoal, goalKind, achievedDate, canAchieve, onSetKind, onAchieve, onReopen,
  todayStr, t, locale, weekdayAbbr, recurringTasks, dayTaskRows, presetTasks, findMatchingPreset, onTogglePresetForTask, onToggleTaskComplete,
  openMenuTaskId, onToggleRowMenu, onCloseRowMenu, onEditTaskInstance, onDeleteTaskInstance,
  editingGoalId, editingGoalName, setEditingGoalName,
  onBack, onCycleColor, onStartRename, onCommitRename, onCancelRename,
  onEditRecurring, onDeleteRecurring,
  onEditPreset, onDeletePreset, onAddPreset,
}) {
  const shortDate = (ds) => formatShortDate(fromDateStr(ds), locale);
  const unlistedPresets = presetTasks.filter(
    (p) => !dayTaskRows.some((row) => row.name === p.name && (row.time || null) === (p.time || null))
  );

  return (
    <div>
      <div className="dt-goal-detail-head">
        <button className="dt-icon-btn" onClick={onBack}><ChevronLeft size={20} /></button>
        {isNoGoal ? (
          <span className="dt-goal-badge-btn" style={{ background: goal.color }} />
        ) : (
          <button className="dt-goal-badge-btn" style={{ background: goal.color }} onClick={onCycleColor} title={t('manage.changeColour')}>
            <GoalIcon icon={goal.icon} size={14} color="currentColor" />
          </button>
        )}
        {!isNoGoal && editingGoalId === goal.id ? (
          <input
            autoFocus
            className="dt-goal-name-input"
            style={{ fontSize: 17, fontFamily: 'var(--font-display)', fontWeight: 600 }}
            value={editingGoalName}
            onChange={(e) => setEditingGoalName(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') onCommitRename(); if (e.key === 'Escape') onCancelRename(); }}
          />
        ) : (
          <div
            className="dt-goal-detail-name"
            style={{ cursor: isNoGoal ? 'default' : 'pointer' }}
            onClick={isNoGoal ? undefined : onStartRename}
          >{goal.name}</div>
        )}
        {achievedDate && <span className="dt-done-badge"><Check size={10} strokeWidth={3} /> {t('goal.achieved')}</span>}
      </div>

      {!isNoGoal && (
        <>
          <div className="dt-segmented">
            {['ongoing', 'project'].map((k) => (
              <button
                key={k}
                className={`dt-segmented-btn ${goalKind === k ? 'active' : ''}`}
                onClick={() => onSetKind(k)}
              >{t(k === 'ongoing' ? 'goal.kindOngoing' : 'goal.kindProject')}</button>
            ))}
          </div>
          <div className="dt-kind-hint">{t('goal.kindHint')}</div>

          {/* Achieving is gated on there being nothing outstanding, so this is an
              offer that appears rather than a button you can press at any time. */}
          {canAchieve && (
            <button className="dt-achieve-prompt" onClick={onAchieve}>
              <Sparkles size={16} color="var(--gold)" />
              {t('goal.stepsDone')}
            </button>
          )}
          {achievedDate && (
            <div className="dt-achieved-banner">
              <Trophy size={16} color="var(--moss)" />
              <span className="when">{t('goal.achievedOn', { date: formatShortDate(fromDateStr(achievedDate), locale) })}</span>
              <button className="dt-preset-btn" style={{ marginLeft: 'auto', flex: 'none', padding: '6px 10px' }} onClick={onReopen}>
                <RotateCcw size={13} /> {t('goal.reopen')}
              </button>
            </div>
          )}
        </>
      )}

      <div className="dt-section-label" style={{ margin: '0 0 8px' }}>{t('manage.repeatedSection')}</div>
      {recurringTasks.length === 0 && <div className="dt-empty-manage" style={{ padding: '8px 0' }}>{t('common.noneYet')}</div>}
      {recurringTasks.map((r) => (
        <div key={r.id} className="dt-recurring-row">
          <div className="dt-recurring-top">
            <div className="dt-recurring-name">{r.name}</div>
            <div className="dt-recurring-actions">
              <button className="dt-icon-btn" onClick={() => onEditRecurring(r)}><Pencil size={15} /></button>
              <button className="dt-icon-btn" onClick={() => onDeleteRecurring(r.id)}><Trash2 size={15} /></button>
            </div>
          </div>
          <div className="dt-recurring-meta">
            <span>{summarizeRepeat(r, t, weekdayAbbr, locale)}</span>
            {r.time && <span className="dt-time-badge">{r.time}</span>}
            {r.createdDate > todayStr && <span>from {shortDate(r.createdDate)}</span>}
            {r.endDate && <span>until {shortDate(r.endDate)}</span>}
          </div>
        </div>
      ))}

      <div className="dt-section-label">{t('manage.oneOffSection')}</div>
      {dayTaskRows.length === 0 && unlistedPresets.length === 0 && <div className="dt-empty-manage" style={{ padding: '8px 0' }}>{t('common.noneYet')}</div>}

      {dayTaskRows.map((row) => {
        const isPreset = !!findMatchingPreset(row);
        const menuKey = `${row.dateStr}-${row.id}`;
        return (
          <div key={menuKey} className="dt-task-instance-row" style={{ position: 'relative' }}>
            <div className={`dt-checkbox ${row.completed ? 'checked' : ''}`} style={{ width: 20, height: 20 }} onClick={() => onToggleTaskComplete(row)}>
              {row.completed && <Check size={12} color="currentColor" strokeWidth={3} />}
            </div>
            <div className="dt-task-instance-main">
              <div className={`dt-task-name ${row.completed ? 'done' : ''}`} style={{ fontSize: 14 }}>{row.name}</div>
              <div className="dt-recurring-meta">
                <span>{shortDate(row.dateStr)}</span>
                {row.time && <span className="dt-time-badge">{row.time}</span>}
              </div>
            </div>
            <label className="dt-preset-toggle">
              <input type="checkbox" checked={isPreset} onChange={() => onTogglePresetForTask(row)} />
              {t('manage.presetToggle')}
            </label>
            <button className="dt-menu-btn" onClick={() => onToggleRowMenu(menuKey)}><MoreVertical size={16} /></button>
            {openMenuTaskId === menuKey && (
              <>
                <div className="dt-menu-overlay" onClick={onCloseRowMenu} />
                <div className="dt-menu">
                  <button className="dt-menu-item" onClick={() => onEditTaskInstance(row)}>{t('common.edit')}</button>
                  <button className="dt-menu-item danger" onClick={() => onDeleteTaskInstance(row)}>{t('common.delete')}</button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {unlistedPresets.map((p) => (
        <div key={p.id} className="dt-goal-edit-row">
          <div className="dt-goal-name-text" style={{ cursor: 'default' }}>
            {p.name}{p.time && <span className="dt-time-badge" style={{ marginLeft: 8 }}>{p.time}</span>}
          </div>
          <button className="dt-icon-btn" onClick={() => onEditPreset(p)}><Pencil size={15} /></button>
          <button className="dt-icon-btn" onClick={() => onDeletePreset(p.id)}><Trash2 size={15} /></button>
        </div>
      ))}

      {achievedDate ? (
        <div className="dt-hint" style={{ margin: '14px 0 0' }}>{t('goal.lockedHint')}</div>
      ) : (
        <button className="dt-preset-btn" style={{ width: '100%', marginTop: 14, padding: '10px' }} onClick={onAddPreset}>
          <Plus size={14} /> {t('manage.addTask')}
        </button>
      )}
    </div>
  );
}

function TaskRow({ task, goal, completed, hideGoal, t, locale, menuOpen, onToggleMenu, onCloseMenu, onToggleComplete, onEdit, onSkipToday, onStopRepeating, onDelete }) {
  return (
    <div className="dt-task-row">
      {/* The tick inherits currentColor from .dt-checkbox so it stays legible on
          whatever the theme uses for a filled control. */}
      <div className={`dt-checkbox ${completed ? 'checked' : ''}`} onClick={onToggleComplete}>
        {completed && <Check size={13} color="currentColor" strokeWidth={3} />}
      </div>
      <div className="dt-task-main" onClick={onToggleComplete}>
        <div className={`dt-task-name ${completed ? 'done' : ''}`}>{task.name}</div>
        <div className="dt-task-meta">
          {task.time && <span className="dt-time-badge">{task.time}</span>}
          {goal && !hideGoal && (
            <span className="dt-goal-chip">
              {hasGoalIcon(goal.icon)
                ? <GoalIcon icon={goal.icon} size={11} color={goal.color} />
                : <span className="dt-goal-chip-dot" style={{ background: goal.color }} />}
              {goal.name}
            </span>
          )}
          {task.isRecurring && <Repeat size={11} className="dt-repeat-icon" />}
          {task.carryOver && <CornerDownRight size={11} className="dt-repeat-icon" />}
          {task.carriedFrom && <span className="dt-meta-note">{t('task.carriedFrom', { date: formatShortDate(fromDateStr(task.carriedFrom), locale) })}</span>}
        </div>
      </div>
      <button className="dt-menu-btn" onClick={onToggleMenu}><MoreVertical size={18} /></button>
      {menuOpen && (
        <>
          <div className="dt-menu-overlay" onClick={onCloseMenu} />
          <div className="dt-menu">
            <button className="dt-menu-item" onClick={onEdit}>{t('common.edit')}</button>
            {task.isRecurring ? (
              <>
                <button className="dt-menu-item" onClick={onSkipToday}>{t('task.skipToday')}</button>
                <button className="dt-menu-item danger" onClick={onStopRepeating}>{t('task.stopRepeating')}</button>
              </>
            ) : (
              <button className="dt-menu-item danger" onClick={onDelete}>{t('common.delete')}</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
