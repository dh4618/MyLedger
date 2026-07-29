import { storage } from './storage';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, MoreVertical, Check, Settings, Trash2, Repeat, Pencil, CornerDownRight } from 'lucide-react';

const GOAL_COLORS = ['#3F5A44', '#3E5C76', '#B8862F', '#9C4430', '#6B5B87', '#3F7A6B'];
const NO_GOAL_ID = '__no_goal__';
const NO_GOAL_COLOR = '#8A8577';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first, values match JS Date.getDay()
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_ABBR = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

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
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const defaultDay = () => ({ oneOff: [], completed: {}, removedRecurring: [] });

const summarizeDays = (days) => {
  const d = days && days.length ? days : ALL_DAYS;
  const set = new Set(d);
  if (set.size === 7) return 'Every day';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((x) => set.has(x))) return 'Weekdays';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Weekends';
  return WEEKDAY_ORDER.filter((x) => set.has(x)).map((x) => WEEKDAY_ABBR[x]).join(', ');
};

export default function Ledger() {
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
  const latestDays = useRef({});
  const daysFlushTimer = useRef(null);
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
      let rateLimited = false;

      // Fetch the four core keys together. On a healthy load this is one quick round-trip
      // with no artificial pauses; the retry/backoff only engages if a read actually fails.
      const [gr, rr, pr, dr] = await Promise.all([
        readKey('goals'),
        readKey('recurring-tasks'),
        readKey('presets'),
        readKey('all-days'),
      ]);
      if (gr.rateLimited || rr.rateLimited || pr.rateLimited || dr.rateLimited) rateLimited = true;
      if (gr.res && gr.res.value) { try { g = JSON.parse(gr.res.value); } catch (e) {} }
      if (rr.res && rr.res.value) { try { r = JSON.parse(rr.res.value); } catch (e) {} }
      if (pr.res && pr.res.value) { try { p = JSON.parse(pr.res.value); } catch (e) {} }
      if (dr.res && dr.res.value) { try { allDays = JSON.parse(dr.res.value); } catch (e) {} }

      // Show the loaded data immediately — don't make the user wait on migration.
      setGoals(g);
      setRecurring(r);
      setPresets(p);
      setDays(allDays);
      setLoading(false);

      if (rateLimited) {
        writesLocked.current = true;
        setStorageError("Couldn't load your data — the connection to the server failed. Your data is safe; it just didn't load. Check your connection and refresh. Don't add anything until this clears, or it could overwrite what didn't load.");
        return;
      }
      if (!storage || typeof storage.set !== 'function') {
        setStorageError('Storage is unavailable — check your Supabase configuration and that you are signed in.');
        return;
      }

    })();
  }, []);

  const reportStorageError = (label, e) => {
    console.error(`${label} failed`, e);
    setStorageError(`Saving isn't working (${label}). Your changes are only held temporarily and will be lost on refresh. ${e && e.message ? e.message : 'The storage backend rejected the write.'}`);
  };
  const persist = async (key, value, label) => {
    if (writesLocked.current) {
      // A load failed; refuse to write so we can't overwrite unloaded data with a blank slate.
      return;
    }
    if (typeof window === 'undefined' || !storage || typeof storage.set !== 'function') {
      reportStorageError(label, new Error('storage is unavailable on this page.'));
      return;
    }
    const attempts = 4;
    for (let i = 0; i < attempts; i++) {
      try {
        const result = await storage.set(key, value, false);
        if (result === null || result === undefined) {
          reportStorageError(label, new Error('The write returned no confirmation — it likely did not save.'));
        } else {
          setStorageError(null);
        }
        return;
      } catch (e) {
        const isRate = /rate limit/i.test((e && e.message) || '');
        if (i === attempts - 1) {
          reportStorageError(label, e);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, (isRate ? 1500 : 500) * (i + 1)));
      }
    }
  };

  const saveGoals = async (next) => {
    setGoals(next);
    await persist('goals', JSON.stringify(next), 'goals');
  };
  const saveRecurring = async (next) => {
    setRecurring(next);
    await persist('recurring-tasks', JSON.stringify(next), 'recurring tasks');
  };
  const savePresets = async (next) => {
    setPresets(next);
    await persist('presets', JSON.stringify(next), 'presets');
  };
  const flushDays = useCallback(async () => {
    if (daysFlushTimer.current) {
      clearTimeout(daysFlushTimer.current);
      daysFlushTimer.current = null;
    }
    const snapshot = latestDays.current;
    await persist('all-days', JSON.stringify(snapshot), 'day data');
  }, []);
  const saveDay = (dateStr, next) => {
    const updated = { ...latestDays.current, [dateStr]: next };
    latestDays.current = updated;
    setDays(updated);
    if (daysFlushTimer.current) clearTimeout(daysFlushTimer.current);
    daysFlushTimer.current = setTimeout(() => { flushDays(); }, 600);
  };

  // Keep the latest-days ref in sync with state (covers the load path setting days directly).
  useEffect(() => { latestDays.current = days; }, [days]);

  // Best-effort flush of any pending day changes before the page unloads.
  useEffect(() => {
    const handler = () => {
      if (daysFlushTimer.current && !writesLocked.current) {
        try { storage.set('all-days', JSON.stringify(latestDays.current), false); } catch (e) { /* nothing we can do at unload */ }
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

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
  // it's still unfinished — today. That's why it leaves the day it was carried from.
  const carryHomeDay = useCallback((taskId) => completedDayById[taskId] || todayStr, [completedDayById, todayStr]);

  const getTasksForDate = useCallback((dateStr) => {
    const day = days[dateStr] || defaultDay();
    const dow = fromDateStr(dateStr).getDay();
    const recurringInstances = recurring
      .filter((r) => {
        if (r.createdDate > dateStr) return false;
        if (r.endDate && dateStr > r.endDate) return false;
        if (day.removedRecurring.includes(r.id)) return false;
        const activeDays = r.days && r.days.length ? r.days : ALL_DAYS;
        return activeDays.includes(dow);
      })
      .map((r) => ({ id: r.id, name: r.name, time: r.time, goalId: r.goalId, days: r.days || ALL_DAYS, createdDate: r.createdDate, endDate: r.endDate, isRecurring: true }));

    // Stored tasks for this day, minus any keep-until-complete ones that have moved on.
    const oneOff = day.oneOff
      .filter((t) => !t.carryOver || carryHomeDay(t.id) === dateStr)
      .map((t) => ({ ...t, isRecurring: false }));

    // Keep-until-complete tasks stored on other days whose home day is this one.
    const carried = [];
    Object.keys(days).forEach((ds) => {
      if (ds === dateStr) return;
      (days[ds].oneOff || []).forEach((t) => {
        if (!t.carryOver) return;
        if (carryHomeDay(t.id) !== dateStr) return;
        carried.push({ ...t, isRecurring: false, carriedFrom: ds });
      });
    });

    return [...recurringInstances, ...oneOff, ...carried];
  }, [days, recurring, carryHomeDay]);

  const goalById = (id) => goals.find((g) => g.id === id);

  // A goal is auto-marked done when it has no active repeating tasks and every
  // one-off task under it (among the days currently loaded) is completed.
  const goalIsDone = useCallback((goalId) => {
    const hasActiveRecurring = recurring.some((r) => r.goalId === goalId && (!r.endDate || r.endDate >= todayStr));
    if (hasActiveRecurring) return false;
    let total = 0;
    let completedCount = 0;
    Object.values(days).forEach((day) => {
      day.oneOff.forEach((t) => {
        if (t.goalId === goalId) {
          total += 1;
          if (day.completed[t.id]) completedCount += 1;
        }
      });
    });
    if (total === 0) return false;
    return completedCount === total;
  }, [days, recurring, todayStr]);

  // ---- Actions ----
  const toggleComplete = (dateStr, taskId) => {
    const day = getDay(dateStr);
    const completed = { ...day.completed, [taskId]: !day.completed[taskId] };
    saveDay(dateStr, { ...day, completed });
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
      message: 'Delete this repeating task? It will disappear from every day, including past history.',
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
    setModal({ mode: 'add', presetMode, lockRepeats, dateStr: dateStr || selectedDateStr, form: { id: null, name: '', repeats, hasTime: false, time: '09:00', goalId, days: [...ALL_DAYS], startDate: todayStr, endDate: '', saveAsPreset: false, carryOver: false } });
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
        days: task.days ? [...task.days] : [...ALL_DAYS],
        startDate: task.createdDate || '',
        endDate: task.endDate || '',
        saveAsPreset: false,
        carryOver: !!task.carryOver,
      },
    });
    setOpenMenuTaskId(null);
  };

  const toggleFormDay = (dow) => {
    setModal((m) => {
      const cur = m.form.days;
      let next;
      if (cur.includes(dow)) {
        if (cur.length === 1) return m; // keep at least one day selected
        next = cur.filter((x) => x !== dow);
      } else {
        next = [...cur, dow];
      }
      return { ...m, form: { ...m.form, days: next } };
    });
  };

  const saveTask = () => {
    const f = modal.form;
    if (!f.name.trim()) return;
    const time = f.hasTime ? f.time : null;

    if (f.repeats) {
      const days = f.days && f.days.length ? f.days : [...ALL_DAYS];
      const startDate = f.startDate || todayStr;
      const endDate = f.endDate || null;
      if (endDate && endDate < startDate) return;
      if (modal.mode === 'add') {
        const newTemplate = { id: genId(), name: f.name.trim(), time, goalId: f.goalId, days, createdDate: startDate, endDate };
        saveRecurring([...recurring, newTemplate]);
      } else {
        saveRecurring(recurring.map((r) => (r.id === f.id ? { ...r, name: f.name.trim(), time, goalId: f.goalId, days, createdDate: startDate, endDate } : r)));
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
      const backup = { exportedAt: new Date().toISOString(), goals, recurring, presets, days: latestDays.current };
      setExportJson(JSON.stringify(backup, null, 2));
    } catch (e) {
      setExportJson('Export failed — try again.');
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
      setCopyStatus('Copied');
    } catch (e) {
      setCopyStatus('Select the text above and copy manually');
    }
    setTimeout(() => setCopyStatus(''), 2500);
  };

  const restoreFromBackup = () => {
    let parsed;
    try {
      parsed = JSON.parse(importText);
    } catch (e) {
      setImportStatus("That doesn't look like valid backup JSON.");
      return;
    }
    setConfirmDialog({
      message: 'Restore this backup? It will overwrite your current goals, tasks, and history.',
      confirmLabel: 'Restore',
      onConfirm: async () => {
        try {
          if (Array.isArray(parsed.goals)) await saveGoals(parsed.goals);
          if (Array.isArray(parsed.recurring)) await saveRecurring(parsed.recurring);
          if (Array.isArray(parsed.presets)) await savePresets(parsed.presets);
          if (parsed.days && typeof parsed.days === 'object') {
            latestDays.current = parsed.days;
            setDays(parsed.days);
            await flushDays();
          }
          setImportStatus('');
          setImportText('');
          setShowImportModal(false);
        } catch (e) {
          setImportStatus('Restore failed partway through — some data may not have been saved.');
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
    saveGoals([...goals, { id: genId(), name: newGoalName.trim(), color }]);
    setNewGoalName('');
    setShowAddGoalInManage(false);
  };
  const deleteGoal = (id) => {
    setConfirmDialog({
      message: 'Delete this goal? Its repeating tasks and presets stay, just without a goal label.',
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
  const sortedTasks = [...tasks].sort((a, b) => {
    const aDone = !!dayCompleted[a.id];
    const bDone = !!dayCompleted[b.id];
    if (aDone !== bDone) return aDone ? 1 : -1;
    return (a.time || '99:99').localeCompare(b.time || '99:99');
  });
  const selDate = fromDateStr(selectedDateStr);
  const dateHeadline = `${WEEKDAY_NAMES[selDate.getDay()]}, ${selDate.getDate()} ${MONTH_NAMES[selDate.getMonth()]}`;

  const manageFilterGoalId = manageGoalId === NO_GOAL_ID ? null : manageGoalId;
  const goalDayTaskRows = [];
  if (manageGoalId && manageGoalId !== NO_GOAL_ID) {
    Object.entries(days).forEach(([ds, day]) => {
      day.oneOff.forEach((t) => {
        if ((t.goalId || null) === manageFilterGoalId) {
          goalDayTaskRows.push({ ...t, dateStr: ds, completed: !!day.completed[t.id] });
        }
      });
    });
    goalDayTaskRows.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EDF0EE', fontFamily: 'Inter, sans-serif', color: '#6E7568' }}>
        Loading your ledger…
      </div>
    );
  }

  return (
    <div className="dt-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');
        :root {
          --paper: #EDF0EE;
          --raised: #FFFFFF;
          --ink: #1B211C;
          --muted: #6E7568;
          --line: #D7DCD4;
          --moss: #3F5A44;
          --slate: #3E5C76;
          --gold: #B8862F;
          --brick: #9C4430;
        }
        * { box-sizing: border-box; }
        .dt-app { min-height: 100vh; background: var(--paper); font-family: 'Inter', sans-serif; color: var(--ink); display: flex; justify-content: center; }
        .dt-container { width: 100%; max-width: 480px; min-height: 100vh; background: var(--paper); position: relative; padding-bottom: 100px; }
        .dt-storage-warning { background: #9C4430; color: #fff; padding: 12px 16px; font-size: 13px; line-height: 1.4; }
        .dt-header { padding: 22px 20px 8px; }
        .dt-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .dt-wordmark { font-family: 'Fraunces', serif; font-weight: 900; font-size: 22px; letter-spacing: -0.02em; }
        .dt-tagline { font-family: 'Fraunces', serif; font-style: italic; font-size: 12px; color: var(--muted); margin-top: -2px; }
        .dt-settings-btn { background: none; border: none; color: var(--muted); cursor: pointer; padding: 6px; display: flex; }
        .dt-settings-btn:hover { color: var(--ink); }
        .dt-goals-row { display: flex; gap: 8px; overflow-x: auto; padding: 4px 0 14px; scrollbar-width: none; }
        .dt-goals-row::-webkit-scrollbar { display: none; }
        .dt-goal-pill { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; border: 1px solid var(--line); background: var(--raised); font-size: 13px; font-weight: 500; white-space: nowrap; cursor: pointer; flex-shrink: 0; transition: all 0.15s; }
        .dt-goal-pill.active { border-color: var(--ink); background: var(--ink); color: var(--paper); }
        .dt-goal-pill.done:not(.active) { color: var(--muted); border-style: dashed; }
        .dt-done-badge { display: inline-flex; align-items: center; gap: 2px; font-size: 10px; font-weight: 700; color: var(--moss); background: rgba(63,90,68,0.1); padding: 2px 6px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
        .dt-goal-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .dt-goal-add { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; border: 1px dashed var(--muted); color: var(--muted); background: none; cursor: pointer; flex-shrink: 0; }
        .dt-date-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
        .dt-date-headline { font-family: 'Fraunces', serif; font-weight: 600; font-size: 26px; cursor: pointer; }
        .dt-today-btn { font-size: 12px; font-weight: 600; color: var(--gold); background: none; border: 1px solid var(--gold); border-radius: 20px; padding: 3px 10px; cursor: pointer; }
        .dt-week-strip { display: flex; align-items: center; gap: 4px; }
        .dt-week-arrow { background: none; border: none; color: var(--muted); cursor: pointer; padding: 4px; flex-shrink: 0; }
        .dt-week-arrow:hover { color: var(--ink); }
        .dt-day-tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 0 6px; border-radius: 10px; cursor: pointer; border: none; background: none; position: relative; }
        .dt-day-tab .letter { font-size: 10px; color: var(--muted); font-weight: 600; letter-spacing: 0.05em; }
        .dt-day-tab .num { font-family: 'IBM Plex Mono', monospace; font-size: 14px; font-weight: 500; }
        .dt-day-tab.selected { background: var(--ink); }
        .dt-day-tab.selected .letter, .dt-day-tab.selected .num { color: var(--paper); }
        .dt-day-tab.today:not(.selected) .num { color: var(--gold); font-weight: 700; }
        .dt-tab-indicator { width: 5px; height: 5px; border-radius: 50%; background: transparent; }
        .dt-tab-indicator.has-tasks { background: var(--slate); }
        .dt-tab-indicator.complete { background: var(--gold); }
        .dt-day-tab.selected .dt-tab-indicator.has-tasks { background: var(--paper); opacity: 0.6; }
        .dt-day-tab.selected .dt-tab-indicator.complete { background: var(--gold); opacity: 1; }
        .dt-body { padding: 6px 20px 0; }
        .dt-section-label { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; color: var(--muted); text-transform: uppercase; margin: 18px 0 8px; }
        .dt-task-row { display: flex; align-items: center; gap: 12px; padding: 12px 4px; border-bottom: 1px solid var(--line); position: relative; }
        .dt-checkbox { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--muted); flex-shrink: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; background: var(--raised); }
        .dt-checkbox.checked { background: var(--moss); border-color: var(--moss); }
        .dt-task-main { flex: 1; min-width: 0; cursor: pointer; }
        .dt-task-name { font-size: 15px; font-weight: 500; line-height: 1.3; }
        .dt-task-name.done { text-decoration: line-through; color: var(--muted); }
        .dt-task-meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
        .dt-time-badge { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--slate); background: rgba(62,92,118,0.08); padding: 2px 6px; border-radius: 4px; }
        .dt-goal-chip { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); }
        .dt-goal-chip-dot { width: 6px; height: 6px; border-radius: 50%; }
        .dt-repeat-icon { color: var(--muted); flex-shrink: 0; }
        .dt-menu-btn { background: none; border: none; color: var(--muted); cursor: pointer; padding: 6px; flex-shrink: 0; }
        .dt-menu { position: absolute; right: 4px; top: 44px; background: var(--raised); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 24px rgba(27,33,28,0.12); z-index: 20; overflow: hidden; min-width: 150px; }
        .dt-menu-item { display: block; width: 100%; text-align: left; padding: 10px 14px; font-size: 13px; background: none; border: none; cursor: pointer; color: var(--ink); }
        .dt-menu-item:hover { background: var(--paper); }
        .dt-menu-item.danger { color: var(--brick); }
        .dt-menu-overlay { position: fixed; inset: 0; z-index: 15; }
        .dt-empty-state { text-align: center; padding: 60px 20px; color: var(--muted); }
        .dt-empty-state .headline { font-family: 'Fraunces', serif; font-size: 17px; color: var(--ink); margin-bottom: 4px; }
        .dt-fab { position: fixed; bottom: 28px; right: calc(50% - 240px + 20px); width: 54px; height: 54px; border-radius: 50%; background: var(--gold); color: var(--raised); border: none; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(184,134,47,0.4); cursor: pointer; z-index: 30; }
        @media (max-width: 480px) { .dt-fab { right: 20px; } }
        .dt-modal-overlay { position: fixed; inset: 0; background: rgba(27,33,28,0.4); display: flex; align-items: flex-end; justify-content: center; z-index: 60; }
        .dt-modal-sheet { width: 100%; max-width: 480px; background: var(--raised); border-radius: 20px 20px 0 0; padding: 22px 20px 28px; max-height: 85vh; overflow-y: auto; }
        .dt-modal-title { font-family: 'Fraunces', serif; font-weight: 600; font-size: 19px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; }
        .dt-field-label { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; display: block; }
        .dt-subfield-label { font-size: 11px; color: var(--muted); margin-bottom: 4px; }
        .dt-field { margin-bottom: 18px; }
        .dt-input { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 11px 12px; font-size: 15px; font-family: 'Inter'; background: var(--paper); color: var(--ink); }
        .dt-input:focus { outline: none; border-color: var(--moss); }
        .dt-segmented { display: flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
        .dt-segmented-btn { flex: 1; padding: 10px; text-align: center; font-size: 13px; font-weight: 500; background: var(--paper); border: none; cursor: pointer; color: var(--muted); }
        .dt-segmented-btn.active { background: var(--moss); color: var(--raised); }
        .dt-goal-picker { display: flex; flex-wrap: wrap; gap: 8px; }
        .dt-goal-option { display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 20px; border: 1px solid var(--line); background: var(--paper); font-size: 13px; cursor: pointer; }
        .dt-goal-option.active { border-color: var(--ink); background: var(--ink); color: var(--paper); }
        .dt-modal-actions { display: flex; gap: 10px; margin-top: 6px; }
        .dt-btn-primary { flex: 1; padding: 13px; background: var(--moss); color: var(--raised); border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; }
        .dt-btn-secondary { padding: 13px 18px; background: none; border: 1px solid var(--line); border-radius: 10px; font-size: 15px; color: var(--muted); cursor: pointer; }
        .dt-hint { font-size: 12px; color: var(--muted); margin-top: -12px; margin-bottom: 16px; }
        .dt-checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); margin-bottom: 18px; cursor: pointer; }
        .dt-checkbox-row input { width: 15px; height: 15px; accent-color: var(--moss); }
        .dt-preset-row { display: flex; gap: 6px; margin-bottom: 10px; }
        .dt-preset-btn { flex: 1; padding: 7px 4px; text-align: center; font-size: 12px; font-weight: 500; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; cursor: pointer; color: var(--muted); }
        .dt-day-chips { display: flex; gap: 5px; }
        .dt-day-chip { flex: 1; aspect-ratio: 1; border-radius: 8px; border: 1px solid var(--line); background: var(--paper); font-size: 12px; font-weight: 600; color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .dt-day-chip.active { background: var(--moss); border-color: var(--moss); color: var(--raised); }
        .dt-manage-panel { position: fixed; inset: 0; background: rgba(27,33,28,0.4); display: flex; align-items: flex-end; justify-content: center; z-index: 50; }
        .dt-manage-sheet { width: 100%; max-width: 480px; background: var(--raised); border-radius: 20px 20px 0 0; padding: 22px 20px 28px; max-height: 85vh; overflow-y: auto; }
        .dt-goal-edit-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
        .dt-color-dot-btn { width: 18px; height: 18px; border-radius: 50%; border: none; cursor: pointer; flex-shrink: 0; }
        .dt-goal-name-text { flex: 1; font-size: 14px; cursor: pointer; padding: 4px 0; }
        .dt-goal-name-input { flex: 1; border: none; border-bottom: 1px solid var(--moss); background: none; font-size: 14px; font-family: 'Inter'; padding: 4px 0; outline: none; }
        .dt-icon-btn { background: none; border: none; color: var(--muted); cursor: pointer; padding: 4px; flex-shrink: 0; }
        .dt-icon-btn:hover { color: var(--brick); }
        .dt-add-goal-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
        .dt-recurring-row { padding: 12px 0; border-bottom: 1px solid var(--line); }
        .dt-recurring-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .dt-recurring-name { font-size: 14px; font-weight: 500; }
        .dt-recurring-actions { display: flex; gap: 2px; flex-shrink: 0; }
        .dt-recurring-meta { display: flex; align-items: center; gap: 8px; margin-top: 5px; flex-wrap: wrap; font-size: 12px; color: var(--muted); }
        .dt-task-instance-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line); }
        .dt-task-instance-main { flex: 1; min-width: 0; }
        .dt-preset-toggle { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted); white-space: nowrap; cursor: pointer; flex-shrink: 0; }
        .dt-preset-toggle input { width: 14px; height: 14px; accent-color: var(--moss); }
        .dt-empty-manage { font-size: 13px; color: var(--muted); padding: 20px 0; text-align: center; }
        .dt-calendar-overlay { position: fixed; inset: 0; background: rgba(27,33,28,0.4); display: flex; align-items: flex-end; justify-content: center; z-index: 50; }
        .dt-calendar-sheet { width: 100%; max-width: 480px; background: var(--raised); border-radius: 20px 20px 0 0; padding: 20px 20px 28px; }
        .dt-cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .dt-cal-month { font-family: 'Fraunces', serif; font-weight: 600; font-size: 17px; }
        .dt-cal-nav { display: flex; align-items: center; gap: 4px; }
        .dt-cal-arrow { background: none; border: none; color: var(--muted); cursor: pointer; padding: 6px; }
        .dt-cal-today-link { font-size: 12px; font-weight: 600; color: var(--gold); background: none; border: 1px solid var(--gold); border-radius: 20px; padding: 3px 10px; cursor: pointer; margin-left: 6px; }
        .dt-cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 4px; }
        .dt-cal-weekday { text-align: center; font-size: 11px; color: var(--muted); font-weight: 600; padding: 4px 0; }
        .dt-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .dt-cal-cell { aspect-ratio: 1; display: flex; align-items: center; justify-content: center; border-radius: 10px; font-size: 14px; font-family: 'IBM Plex Mono', monospace; cursor: pointer; border: none; background: none; color: var(--ink); }
        .dt-cal-cell.outside { color: var(--line); }
        .dt-cal-cell.today { box-shadow: inset 0 0 0 1.5px var(--gold); font-weight: 700; }
        .dt-cal-cell.selected { background: var(--ink); color: var(--paper); font-weight: 700; }
      `}</style>

      <div className="dt-container">
        {storageError && (
          <div className="dt-storage-warning">
            <strong>⚠ Not saving</strong>
            <div style={{ marginTop: 4 }}>{storageError}</div>
            <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85 }}>Use Export in Manage to copy your data out before you lose it.</div>
          </div>
        )}
        <div className="dt-header">
          <div className="dt-topbar">
            <div>
              <div className="dt-wordmark">Ledger</div>
              <div className="dt-tagline">a page for every day</div>
            </div>
            <button className="dt-settings-btn" onClick={() => { setManageGoalId(null); setShowAddGoalInManage(false); setShowManage(true); }}>
              <Settings size={20} />
            </button>
          </div>

          <div className="dt-goals-row">
            {goals.map((g) => {
              const done = goalIsDone(g.id);
              return (
                <div
                  key={g.id}
                  className={`dt-goal-pill ${activeGoalFilter === g.id ? 'active' : ''} ${done ? 'done' : ''}`}
                  onClick={() => setActiveGoalFilter(activeGoalFilter === g.id ? null : g.id)}
                >
                  {done ? <Check size={12} strokeWidth={3} color={activeGoalFilter === g.id ? '#fff' : 'var(--moss)'} /> : <span className="dt-goal-dot" style={{ background: activeGoalFilter === g.id ? '#fff' : g.color }} />}
                  {g.name}
                </div>
              );
            })}
            <div
              className={`dt-goal-pill ${activeGoalFilter === NO_GOAL_ID ? 'active' : ''}`}
              onClick={() => setActiveGoalFilter(activeGoalFilter === NO_GOAL_ID ? null : NO_GOAL_ID)}
            >
              <span className="dt-goal-dot" style={{ background: activeGoalFilter === NO_GOAL_ID ? '#fff' : NO_GOAL_COLOR }} />
              Others
            </div>
          </div>

          <div className="dt-date-row">
            <div className="dt-date-headline" onClick={() => setShowCalendar(true)}>{dateHeadline}</div>
            {selectedDateStr !== todayStr && (
              <button className="dt-today-btn" onClick={() => setSelectedDateStr(todayStr)}>Today</button>
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
              const allComplete = hasTasks && dTasks.every((t) => day.completed[t.id]);
              return (
                <button
                  key={ds}
                  className={`dt-day-tab ${ds === selectedDateStr ? 'selected' : ''} ${ds === todayStr ? 'today' : ''}`}
                  onClick={() => setSelectedDateStr(ds)}
                >
                  <span className="letter">{WEEKDAY_LETTERS[i]}</span>
                  <span className="num">{fromDateStr(ds).getDate()}</span>
                  <span className={`dt-tab-indicator ${allComplete ? 'complete' : hasTasks ? 'has-tasks' : ''}`} />
                </button>
              );
            })}
            <button className="dt-week-arrow" onClick={() => setSelectedDateStr(toDateStr(addDays(fromDateStr(selectedDateStr), 7)))}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="dt-body">
          {tasks.length === 0 && (
            <div className="dt-empty-state">
              <div className="headline">Nothing on the page yet</div>
              <div>Add what needs doing on {dateHeadline}.</div>
            </div>
          )}

          {sortedTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              goal={goalById(t.goalId)}
              completed={!!dayCompleted[t.id]}
              menuOpen={openMenuTaskId === t.id}
              onToggleMenu={() => setOpenMenuTaskId(openMenuTaskId === t.id ? null : t.id)}
              onCloseMenu={() => setOpenMenuTaskId(null)}
              onToggleComplete={() => toggleComplete(selectedDateStr, t.id)}
              onEdit={() => openEditTask(t, t.carriedFrom ? { dateStr: t.carriedFrom } : {})}
              onSkipToday={() => skipToday(selectedDateStr, t.id)}
              onStopRepeating={() => stopRepeating(t.id)}
              onDelete={() => deleteOneOff(selectedDateStr, t.id)}
            />
          ))}
        </div>

        <button className="dt-fab" onClick={() => openAddTask()}><Plus size={26} /></button>
      </div>

      {showCalendar && (
        <CalendarPicker
          selectedDateStr={selectedDateStr}
          todayStr={todayStr}
          onSelect={(ds) => { setSelectedDateStr(ds); setShowCalendar(false); }}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {confirmDialog && (
        <div className="dt-modal-overlay" style={{ zIndex: 70 }} onClick={() => setConfirmDialog(null)}>
          <div className="dt-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, color: 'var(--ink)', marginBottom: 20, lineHeight: 1.4 }}>{confirmDialog.message}</div>
            <div className="dt-modal-actions">
              <button className="dt-btn-secondary" onClick={() => setConfirmDialog(null)}>Cancel</button>
              <button
                className="dt-btn-primary"
                style={{ background: 'var(--brick)' }}
                onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
              >{confirmDialog.confirmLabel || 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="dt-modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="dt-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="dt-modal-title">
              Export backup
              <button className="dt-icon-btn" onClick={() => setShowExportModal(false)}><X size={20} /></button>
            </div>
            <div className="dt-hint" style={{ marginTop: 0 }}>Save this somewhere safe — a notes app, email to yourself, wherever. You can restore it later from here.</div>
            <textarea
              readOnly
              value={exportJson}
              onClick={(e) => e.target.select()}
              style={{ width: '100%', height: 180, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: 10, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--paper)', color: 'var(--ink)', marginBottom: 14, resize: 'none' }}
            />
            <div className="dt-modal-actions">
              <button className="dt-btn-secondary" onClick={copyExport}>{copyStatus || 'Copy text'}</button>
              <button className="dt-btn-primary" onClick={downloadExport}>Download file</button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="dt-modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="dt-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="dt-modal-title">
              Restore from backup
              <button className="dt-icon-btn" onClick={() => setShowImportModal(false)}><X size={20} /></button>
            </div>
            <div className="dt-hint" style={{ marginTop: 0 }}>Paste the contents of a previously exported backup below.</div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste backup JSON here"
              style={{ width: '100%', height: 160, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: 10, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--paper)', color: 'var(--ink)', marginBottom: 10, resize: 'none' }}
            />
            {importStatus && <div className="dt-hint" style={{ marginTop: 0, color: 'var(--brick)' }}>{importStatus}</div>}
            <div className="dt-modal-actions">
              <button className="dt-btn-secondary" onClick={() => setShowImportModal(false)}>Cancel</button>
              <button className="dt-btn-primary" onClick={restoreFromBackup}>Restore</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="dt-modal-overlay" onClick={() => setModal(null)}>
          <div className="dt-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="dt-modal-title">
              {modal.mode === 'add' ? 'New task' : 'Edit task'}
              <button className="dt-icon-btn" onClick={() => setModal(null)}><X size={20} /></button>
            </div>

            <div className="dt-field">
              <label className="dt-field-label">Task</label>
              <input
                autoFocus
                className="dt-input"
                placeholder="What needs doing?"
                value={modal.form.name}
                onChange={(e) => setModal({ ...modal, form: { ...modal.form, name: e.target.value } })}
              />
            </div>

            {!(modal.mode === 'add' && modal.lockRepeats) && (
              <div className="dt-field">
                <label className="dt-field-label">Repeats</label>
                {modal.mode === 'add' ? (
                  <div className="dt-segmented">
                    <button
                      className={`dt-segmented-btn ${!modal.form.repeats ? 'active' : ''}`}
                      onClick={() => setModal({ ...modal, form: { ...modal.form, repeats: false } })}
                    >{modal.presetMode ? 'One-off' : 'Just today'}</button>
                    <button
                      className={`dt-segmented-btn ${modal.form.repeats ? 'active' : ''}`}
                      onClick={() => setModal({ ...modal, form: { ...modal.form, repeats: true } })}
                    >{modal.presetMode ? 'Repeated' : 'Repeats'}</button>
                  </div>
                ) : (
                  <div className="dt-hint" style={{ marginTop: 0 }}>
                    {modal.form.repeats ? 'Repeating task — delete and re-add to change to one-off.' : 'One-off — delete and re-add to change to repeating.'}
                  </div>
                )}
              </div>
            )}

            {modal.form.repeats && (
              <div className="dt-field">
                <label className="dt-field-label">On which days</label>
                <div className="dt-preset-row">
                  <button className="dt-preset-btn" onClick={() => setModal({ ...modal, form: { ...modal.form, days: [...ALL_DAYS] } })}>Every day</button>
                  <button className="dt-preset-btn" onClick={() => setModal({ ...modal, form: { ...modal.form, days: [1, 2, 3, 4, 5] } })}>Weekdays</button>
                  <button className="dt-preset-btn" onClick={() => setModal({ ...modal, form: { ...modal.form, days: [0, 6] } })}>Weekends</button>
                </div>
                <div className="dt-day-chips">
                  {WEEKDAY_ORDER.map((dow, i) => (
                    <button
                      key={dow}
                      className={`dt-day-chip ${modal.form.days.includes(dow) ? 'active' : ''}`}
                      onClick={() => toggleFormDay(dow)}
                    >{WEEKDAY_LETTERS[i]}</button>
                  ))}
                </div>
                {modal.mode === 'edit' && (
                  <div className="dt-hint" style={{ marginTop: 10 }}>Editing this updates it everywhere it appears, including past days.</div>
                )}
              </div>
            )}

            {modal.form.repeats && (
              <div className="dt-field">
                <label className="dt-field-label">Active dates</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div className="dt-subfield-label">Starts</div>
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
                    <div className="dt-subfield-label">Ends</div>
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
                <div className="dt-hint" style={{ marginTop: 8, marginBottom: 0 }}>Leave either blank — starts today, or repeats with no end.</div>
              </div>
            )}

            <div className="dt-field">
              <label className="dt-field-label">Time</label>
              <div className="dt-segmented" style={{ marginBottom: modal.form.hasTime ? 10 : 0 }}>
                <button
                  className={`dt-segmented-btn ${!modal.form.hasTime ? 'active' : ''}`}
                  onClick={() => setModal({ ...modal, form: { ...modal.form, hasTime: false } })}
                >Any time</button>
                <button
                  className={`dt-segmented-btn ${modal.form.hasTime ? 'active' : ''}`}
                  onClick={() => setModal({ ...modal, form: { ...modal.form, hasTime: true } })}
                >Set a time</button>
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
              <label className="dt-field-label">Goal</label>
              <div className="dt-goal-picker">
                <div
                  className={`dt-goal-option ${modal.form.goalId === null ? 'active' : ''}`}
                  onClick={() => setModal({ ...modal, form: { ...modal.form, goalId: null } })}
                >Others</div>
                {goals.map((g) => (
                  <div
                    key={g.id}
                    className={`dt-goal-option ${modal.form.goalId === g.id ? 'active' : ''}`}
                    onClick={() => setModal({ ...modal, form: { ...modal.form, goalId: g.id } })}
                  >
                    <span className="dt-goal-chip-dot" style={{ background: modal.form.goalId === g.id ? '#fff' : g.color, display: 'inline-block', marginRight: 5 }} />
                    {g.name}
                  </div>
                ))}
              </div>
            </div>

            {!modal.presetMode && modal.mode === 'add' && !modal.form.repeats && modal.form.goalId && presets.filter((p) => p.goalId === modal.form.goalId).length > 0 && (
              <div className="dt-field">
                <label className="dt-field-label">Quick add from {goalById(modal.form.goalId)?.name}</label>
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
                Keep until complete
              </label>
            )}

            {!modal.presetMode && !modal.form.repeats && (
              <label className="dt-checkbox-row">
                <input
                  type="checkbox"
                  checked={modal.form.saveAsPreset}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, saveAsPreset: e.target.checked } })}
                />
                Also save as a preset{modal.form.goalId ? ` under ${goalById(modal.form.goalId)?.name}` : ' under Others'}
              </label>
            )}

            <div className="dt-modal-actions">
              <button className="dt-btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="dt-btn-primary" onClick={saveTask}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showManage && (
        <div className="dt-manage-panel" onClick={() => setShowManage(false)}>
          <div className="dt-manage-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="dt-modal-title">
              Manage
              <button className="dt-icon-btn" onClick={() => setShowManage(false)}><X size={20} /></button>
            </div>

            {!manageGoalId && (
              <>
                {goals.length === 0 && <div className="dt-empty-manage">No goals yet.</div>}
                {goals.map((g) => {
                  const done = goalIsDone(g.id);
                  return (
                    <div key={g.id} className="dt-goal-edit-row">
                      <button className="dt-color-dot-btn" style={{ background: g.color }} onClick={() => cycleGoalColor(g.id)} title="Tap to change color" />
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
                            {done && <span className="dt-done-badge"><Check size={10} strokeWidth={3} /> Done</span>}
                          </span>
                          <ChevronRight size={16} color="var(--muted)" />
                        </div>
                      )}
                      <button className="dt-icon-btn" onClick={() => startEditGoalName(g)}><Pencil size={15} /></button>
                      <button className="dt-icon-btn" onClick={() => deleteGoal(g.id)}><Trash2 size={16} /></button>
                    </div>
                  );
                })}

                <div className="dt-goal-edit-row" style={{ marginTop: 8 }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: NO_GOAL_COLOR, display: 'inline-block', flexShrink: 0 }} />
                  <div className="dt-goal-name-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={() => setManageGoalId(NO_GOAL_ID)}>
                    <span>Others</span>
                    <ChevronRight size={16} color="var(--muted)" />
                  </div>
                </div>

                {showAddGoalInManage ? (
                  <div className="dt-add-goal-row">
                    <input
                      autoFocus
                      className="dt-input"
                      placeholder="New goal name"
                      value={newGoalName}
                      onChange={(e) => setNewGoalName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addGoal(); if (e.key === 'Escape') { setShowAddGoalInManage(false); setNewGoalName(''); } }}
                    />
                    <button className="dt-goal-add" onClick={addGoal}><Check size={14} /></button>
                  </div>
                ) : (
                  <button className="dt-preset-btn" style={{ width: '100%', marginTop: 12, padding: '10px' }} onClick={() => setShowAddGoalInManage(true)}>+ Add goal</button>
                )}

                <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                  <div className="dt-field-label" style={{ marginBottom: 10 }}>Backup</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="dt-preset-btn" style={{ flex: 1, padding: '10px' }} onClick={openExportModal}>Export</button>
                    <button className="dt-preset-btn" style={{ flex: 1, padding: '10px' }} onClick={() => { setImportText(''); setImportStatus(''); setShowImportModal(true); }}>Restore</button>
                  </div>
                </div>
              </>
            )}

            {manageGoalId && (
              <GoalDetail
                goal={manageGoalId === NO_GOAL_ID ? { id: null, name: 'Others', color: NO_GOAL_COLOR } : goalById(manageGoalId)}
                isNoGoal={manageGoalId === NO_GOAL_ID}
                done={manageGoalId !== NO_GOAL_ID && goalIsDone(manageGoalId)}
                todayStr={todayStr}
                recurringTasks={recurring.filter((r) => (r.goalId || null) === manageFilterGoalId && (!r.endDate || r.endDate >= todayStr))}
                dayTaskRows={goalDayTaskRows}
                presetTasks={presets.filter((p) => (p.goalId || null) === manageFilterGoalId)}
                findMatchingPreset={findMatchingPreset}
                onTogglePresetForTask={togglePresetForTask}
                onToggleTaskComplete={(row) => toggleComplete(row.dateStr, row.id)}
                openMenuTaskId={openMenuTaskId}
                onToggleRowMenu={(id) => setOpenMenuTaskId(openMenuTaskId === id ? null : id)}
                onCloseRowMenu={() => setOpenMenuTaskId(null)}
                onEditTaskInstance={(row) => openEditTask({ id: row.id, name: row.name, time: row.time, goalId: row.goalId, isRecurring: false }, { presetMode: false, dateStr: row.dateStr })}
                onDeleteTaskInstance={(row) => { deleteOneOff(row.dateStr, row.id); setOpenMenuTaskId(null); }}
                editingGoalId={editingGoalId}
                editingGoalName={editingGoalName}
                setEditingGoalName={setEditingGoalName}
                onBack={() => setManageGoalId(null)}
                onCycleColor={() => cycleGoalColor(manageGoalId)}
                onStartRename={() => startEditGoalName(goalById(manageGoalId))}
                onCommitRename={commitEditGoalName}
                onCancelRename={() => setEditingGoalId(null)}
                onEditRecurring={(r) => openEditTask({ id: r.id, name: r.name, time: r.time, goalId: r.goalId, days: r.days, createdDate: r.createdDate, endDate: r.endDate, isRecurring: true }, { presetMode: true })}
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

function CalendarPicker({ selectedDateStr, todayStr, onSelect, onClose }) {
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
          <div className="dt-cal-month">{MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}</div>
          <div className="dt-cal-nav">
            <button className="dt-cal-arrow" onClick={() => shiftMonth(-1)}><ChevronLeft size={20} /></button>
            <button className="dt-cal-arrow" onClick={() => shiftMonth(1)}><ChevronRight size={20} /></button>
            <button className="dt-cal-today-link" onClick={() => onSelect(todayStr)}>Today</button>
          </div>
        </div>
        <div className="dt-cal-weekdays">
          {WEEKDAY_LETTERS.map((l, i) => <div key={i} className="dt-cal-weekday">{l}</div>)}
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
  goal, isNoGoal, done, todayStr, recurringTasks, dayTaskRows, presetTasks, findMatchingPreset, onTogglePresetForTask, onToggleTaskComplete,
  openMenuTaskId, onToggleRowMenu, onCloseRowMenu, onEditTaskInstance, onDeleteTaskInstance,
  editingGoalId, editingGoalName, setEditingGoalName,
  onBack, onCycleColor, onStartRename, onCommitRename, onCancelRename,
  onEditRecurring, onDeleteRecurring,
  onEditPreset, onDeletePreset, onAddPreset,
}) {
  const shortDate = (ds) => {
    const d = fromDateStr(ds);
    return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
  };
  const unlistedPresets = presetTasks.filter(
    (p) => !dayTaskRows.some((row) => row.name === p.name && (row.time || null) === (p.time || null))
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button className="dt-icon-btn" onClick={onBack}><ChevronLeft size={20} /></button>
        {isNoGoal ? (
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: goal.color, display: 'inline-block', flexShrink: 0 }} />
        ) : (
          <button className="dt-color-dot-btn" style={{ width: 22, height: 22, background: goal.color }} onClick={onCycleColor} title="Tap to change color" />
        )}
        {!isNoGoal && editingGoalId === goal.id ? (
          <input
            autoFocus
            className="dt-goal-name-input"
            style={{ fontSize: 17, fontFamily: "'Fraunces', serif", fontWeight: 600 }}
            value={editingGoalName}
            onChange={(e) => setEditingGoalName(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') onCommitRename(); if (e.key === 'Escape') onCancelRename(); }}
          />
        ) : (
          <div
            style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17, cursor: isNoGoal ? 'default' : 'pointer' }}
            onClick={isNoGoal ? undefined : onStartRename}
          >{goal.name}</div>
        )}
        {done && <span className="dt-done-badge"><Check size={10} strokeWidth={3} /> Done</span>}
      </div>

      <div className="dt-section-label" style={{ margin: '0 0 8px' }}>Repeated</div>
      {recurringTasks.length === 0 && <div className="dt-empty-manage" style={{ padding: '8px 0' }}>None yet.</div>}
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
            <span>{summarizeDays(r.days)}</span>
            {r.time && <span className="dt-time-badge">{r.time}</span>}
            {r.createdDate > todayStr && <span>from {shortDate(r.createdDate)}</span>}
            {r.endDate && <span>until {shortDate(r.endDate)}</span>}
          </div>
        </div>
      ))}

      <div className="dt-section-label">One-off</div>
      {dayTaskRows.length === 0 && unlistedPresets.length === 0 && <div className="dt-empty-manage" style={{ padding: '8px 0' }}>None yet.</div>}

      {!isNoGoal && dayTaskRows.map((row) => {
        const isPreset = !!findMatchingPreset(row);
        const menuKey = `${row.dateStr}-${row.id}`;
        return (
          <div key={menuKey} className="dt-task-instance-row" style={{ position: 'relative' }}>
            <div className={`dt-checkbox ${row.completed ? 'checked' : ''}`} style={{ width: 20, height: 20 }} onClick={() => onToggleTaskComplete(row)}>
              {row.completed && <Check size={12} color="#fff" strokeWidth={3} />}
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
              Preset
            </label>
            <button className="dt-menu-btn" onClick={() => onToggleRowMenu(menuKey)}><MoreVertical size={16} /></button>
            {openMenuTaskId === menuKey && (
              <>
                <div className="dt-menu-overlay" onClick={onCloseRowMenu} />
                <div className="dt-menu">
                  <button className="dt-menu-item" onClick={() => onEditTaskInstance(row)}>Edit</button>
                  <button className="dt-menu-item danger" onClick={() => onDeleteTaskInstance(row)}>Delete</button>
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

      <button className="dt-preset-btn" style={{ width: '100%', marginTop: 14, padding: '10px' }} onClick={onAddPreset}>+ Add task</button>
    </div>
  );
}

function TaskRow({ task, goal, completed, menuOpen, onToggleMenu, onCloseMenu, onToggleComplete, onEdit, onSkipToday, onStopRepeating, onDelete }) {
  return (
    <div className="dt-task-row">
      <div className={`dt-checkbox ${completed ? 'checked' : ''}`} onClick={onToggleComplete}>
        {completed && <Check size={13} color="#fff" strokeWidth={3} />}
      </div>
      <div className="dt-task-main" onClick={onToggleComplete}>
        <div className={`dt-task-name ${completed ? 'done' : ''}`}>{task.name}</div>
        <div className="dt-task-meta">
          {task.time && <span className="dt-time-badge">{task.time}</span>}
          {goal && (
            <span className="dt-goal-chip">
              <span className="dt-goal-chip-dot" style={{ background: goal.color }} />
              {goal.name}
            </span>
          )}
          {task.isRecurring && <Repeat size={11} className="dt-repeat-icon" />}
          {task.carryOver && <CornerDownRight size={11} className="dt-repeat-icon" />}
          {task.carriedFrom && <span style={{ fontSize: 11, color: 'var(--muted)' }}>from {MONTH_NAMES[fromDateStr(task.carriedFrom).getMonth()].slice(0, 3)} {fromDateStr(task.carriedFrom).getDate()}</span>}
        </div>
      </div>
      <button className="dt-menu-btn" onClick={onToggleMenu}><MoreVertical size={18} /></button>
      {menuOpen && (
        <>
          <div className="dt-menu-overlay" onClick={onCloseMenu} />
          <div className="dt-menu">
            <button className="dt-menu-item" onClick={onEdit}>Edit</button>
            {task.isRecurring ? (
              <>
                <button className="dt-menu-item" onClick={onSkipToday}>Skip just today</button>
                <button className="dt-menu-item danger" onClick={onStopRepeating}>Stop repeating</button>
              </>
            ) : (
              <button className="dt-menu-item danger" onClick={onDelete}>Delete</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
