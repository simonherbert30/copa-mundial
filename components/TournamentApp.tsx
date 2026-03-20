"use client";
import { useState, useEffect, useReducer, useCallback, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";

// ============================================================
// COPA MUNDIAL — Tournament Management App
// Branding: kopa-events.be (dark premium, sporty, modern)
// ============================================================

// --- CONFIG ---
const ADMIN_PASSWORD = "kopa2026";
const NUM_FIELDS = 8;
const SLOT_DURATION_MIN = 30;
const REST_SLOTS = 1;
const MIN_MATCHES_PER_TEAM = 3;
const POLL_INTERVAL = 3000;
const START_HOUR = 11;
const START_MIN = 0;

const FIELDS = Array.from({ length: NUM_FIELDS }, (_, i) => ({
  id: i + 1,
  name: `Field ${i + 1}`,
  sponsor: ["Integra", "Break Point", "CAPS", "Jouer.", "McAlson", "BLAGEUR", "Fourchette", "VICAR"][i],
}));

const SPONSORS = [
  "Integra", "Break Point", "CAPS", "true. food agency",
  "ghilles", "VICAR", "Jouer.", "BLAGEUR",
  "Fourchette", "McAlson", "Love Stories", "ByJean",
];

// --- SEED DATA ---
const SEED_WOMEN = ["Brazil W", "Germany W", "Japan W", "France W"];
const SEED_MEN = [
  "Brazil", "Germany", "Argentina", "France", "Spain", "England",
  "Portugal", "Netherlands", "Italy", "Belgium", "Croatia", "Morocco",
  "Japan", "South Korea", "USA", "Mexico", "Uruguay", "Colombia",
  "Denmark", "Switzerland", "Senegal", "Ghana", "Nigeria", "Cameroon",
  "Australia",
];

// --- UTILS ---
const uid = () => Math.random().toString(36).slice(2, 11);
const shuffle = (a) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

function slotToTime(slotIndex) {
  const d = new Date(2026, 3, 6, START_HOUR, START_MIN);
  d.setMinutes(d.getMinutes() + slotIndex * SLOT_DURATION_MIN);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// --- TOURNAMENT LOGIC ---

function buildGroups(teams, maxPerGroup = 4) {
  const s = shuffle(teams);
  const nGroups = Math.ceil(s.length / maxPerGroup);
  const groups = Array.from({ length: nGroups }, (_, i) => ({
    id: uid(),
    name: `Group ${String.fromCharCode(65 + i)}`,
    teamIds: [],
  }));
  s.forEach((t, i) => groups[i % nGroups].teamIds.push(t.id));
  return groups;
}

function buildGroupMatches(groups) {
  const matches = [];
  groups.forEach((g) => {
    const ids = g.teamIds;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        matches.push({
          id: uid(), homeId: ids[i], awayId: ids[j],
          groupId: g.id, phase: "group",
          scoreHome: null, scoreAway: null,
          slotIndex: null, fieldId: null, status: "scheduled",
        });
      }
    }
  });
  return matches;
}

function ensureMinMatches(existingMatches, groups, teams) {
  const matchCount = {};
  teams.forEach((t) => (matchCount[t.id] = 0));
  existingMatches.forEach((m) => {
    if (matchCount[m.homeId] !== undefined) matchCount[m.homeId]++;
    if (matchCount[m.awayId] !== undefined) matchCount[m.awayId]++;
  });

  const extra = [];
  const underTeams = teams.filter((t) => matchCount[t.id] < MIN_MATCHES_PER_TEAM);
  if (underTeams.length === 0) return extra;

  const paired = new Set();
  for (const t of underTeams) {
    while (matchCount[t.id] < MIN_MATCHES_PER_TEAM) {
      let partner = null;
      for (const u of shuffle(teams)) {
        if (u.id === t.id) continue;
        const pairKey = [t.id, u.id].sort().join("-");
        const alreadyExists = [...existingMatches, ...extra].some(
          (m) => (m.homeId === t.id && m.awayId === u.id) || (m.homeId === u.id && m.awayId === t.id)
        );
        if (!alreadyExists && !paired.has(pairKey)) {
          partner = u;
          paired.add(pairKey);
          break;
        }
      }
      if (!partner) break;
      const commonGroup = groups.find(
        (g) => g.teamIds.includes(t.id) && g.teamIds.includes(partner.id)
      );
      extra.push({
        id: uid(), homeId: t.id, awayId: partner.id,
        groupId: commonGroup?.id || null, phase: "group",
        scoreHome: null, scoreAway: null,
        slotIndex: null, fieldId: null, status: "scheduled",
      });
      matchCount[t.id]++;
      matchCount[partner.id]++;
    }
  }
  return extra;
}

// existingMatches = matches from other competitions already occupying slots/fields
function scheduleMatches(matches, startSlot = 0, existingMatches = []) {
  const scheduled = [];
  const unscheduled = shuffle([...matches]);
  let slot = startSlot;
  let maxIter = 600;

  // Pre-index existing matches: slot → set of used fieldIds and teamIds
  const existingBySlot = {};
  existingMatches.forEach((m) => {
    if (m.slotIndex === null) return;
    if (!existingBySlot[m.slotIndex]) existingBySlot[m.slotIndex] = { fields: new Set(), teams: new Set() };
    if (m.fieldId) existingBySlot[m.slotIndex].fields.add(m.fieldId);
    existingBySlot[m.slotIndex].teams.add(m.homeId);
    existingBySlot[m.slotIndex].teams.add(m.awayId);
  });

  while (unscheduled.length > 0 && maxIter-- > 0) {
    // Get already-occupied fields and teams in this slot from other competitions
    const existing = existingBySlot[slot] || { fields: new Set(), teams: new Set() };
    const teamsInSlot = new Set(existing.teams);
    const fieldsUsed = new Set(existing.fields);
    const slotMatches = [];

    for (let i = unscheduled.length - 1; i >= 0; i--) {
      const m = unscheduled[i];
      if (teamsInSlot.has(m.homeId) || teamsInSlot.has(m.awayId)) continue;
      if (fieldsUsed.size >= NUM_FIELDS) break;

      // Check rest constraint against both newly scheduled AND existing matches
      const allScheduled = [...scheduled, ...existingMatches];
      const homeLastSlot = lastSlotOf(allScheduled, m.homeId);
      const awayLastSlot = lastSlotOf(allScheduled, m.awayId);
      const restOk =
        (homeLastSlot === null || slot - homeLastSlot > REST_SLOTS) &&
        (awayLastSlot === null || slot - awayLastSlot > REST_SLOTS);

      if (restOk) {
        const fid = nextField(fieldsUsed);
        m.slotIndex = slot;
        m.fieldId = fid;
        teamsInSlot.add(m.homeId);
        teamsInSlot.add(m.awayId);
        fieldsUsed.add(fid);
        slotMatches.push(m);
        unscheduled.splice(i, 1);
      }
    }

    if (slotMatches.length === 0 && unscheduled.length > 0) {
      // Force-advance to next slot if nothing could fit (all fields occupied or rest needed)
      // Only force-schedule if there's room on this slot
      if (fieldsUsed.size < NUM_FIELDS) {
        const m = unscheduled.pop();
        const fid = nextField(fieldsUsed);
        m.slotIndex = slot;
        m.fieldId = fid;
        slotMatches.push(m);
      }
      // else just advance to next slot — don't exceed 8 fields
    }

    scheduled.push(...slotMatches);
    slot++;
  }
  return scheduled;
}

function lastSlotOf(matches, teamId) {
  let last = null;
  for (const m of matches) {
    if ((m.homeId === teamId || m.awayId === teamId) && m.slotIndex !== null) {
      if (last === null || m.slotIndex > last) last = m.slotIndex;
    }
  }
  return last;
}
function nextField(used) {
  for (let i = 1; i <= NUM_FIELDS; i++) if (!used.has(i)) return i;
  return 1;
}

function computeStandings(group, matches, teams) {
  const table = group.teamIds.map((tid) => {
    const t = teams.find((x) => x.id === tid);
    const tm = matches.filter(
      (m) => m.groupId === group.id && (m.homeId === tid || m.awayId === tid) && m.status === "completed"
    );
    let w = 0, d = 0, l = 0, gf = 0, ga = 0;
    tm.forEach((m) => {
      const isH = m.homeId === tid;
      const s = isH ? m.scoreHome : m.scoreAway;
      const c = isH ? m.scoreAway : m.scoreHome;
      gf += s; ga += c;
      if (s > c) w++; else if (s === c) d++; else l++;
    });
    return { teamId: tid, name: t?.name || "?", p: tm.length, w, d, l, gf, ga, gd: gf - ga, pts: w * 3 + d };
  });
  table.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  return table;
}

function generateKnockout(groups, matches, teams) {
  // Collect top 2 from each group
  const firsts = [];
  const seconds = [];
  const thirds = [];
  groups.forEach((g) => {
    const st = computeStandings(g, matches, teams);
    if (st.length >= 1) firsts.push(st[0]);
    if (st.length >= 2) seconds.push(st[1]);
    if (st.length >= 3) thirds.push(st[2]);
  });

  let qualified = [
    ...firsts.map((r) => r.teamId),
    ...seconds.map((r) => r.teamId),
  ];

  // Determine the target bracket size (next power of 2 that is >= qualified count, min 4)
  let bracketSize = 4;
  while (bracketSize < qualified.length) bracketSize *= 2;

  // If we need more teams to fill the bracket, take best 3rd-placed teams
  if (qualified.length < bracketSize && thirds.length > 0) {
    // Sort 3rd-placed teams by pts, then gd, then gf
    const sortedThirds = [...thirds].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    const needed = bracketSize - qualified.length;
    for (let i = 0; i < Math.min(needed, sortedThirds.length); i++) {
      qualified.push(sortedThirds[i].teamId);
    }
  }

  // If still not enough for bracketSize, shrink bracket to next lower power of 2
  while (bracketSize > 2 && qualified.length < bracketSize) {
    bracketSize /= 2;
  }
  qualified = qualified.slice(0, bracketSize);

  if (qualified.length < 2) return [];

  // Build seeded bracket: 1st-place teams seeded at top, 2nd at bottom, 3rd fill gaps
  // Classic: 1A vs 2-last, 1-last vs 2A, etc.
  const numMatches = bracketSize / 2;
  const pairs = [];
  // Interleave: seed i vs seed (bracketSize - 1 - i)
  for (let i = 0; i < numMatches; i++) {
    const home = qualified[i];
    const away = qualified[bracketSize - 1 - i];
    if (home && away) pairs.push([home, away]);
  }

  const round = pairs.length > 4 ? "R16" : pairs.length > 2 ? "QF" : pairs.length > 1 ? "SF" : "Final";
  return pairs.map(([h, a]) => ({
    id: uid(), homeId: h, awayId: a, groupId: null, phase: round,
    scoreHome: null, scoreAway: null, penHome: null, penAway: null,
    slotIndex: null, fieldId: null, status: "scheduled",
  }));
}

// Determine winner of a completed knockout match (accounts for penalties)
function getMatchWinner(m) {
  if (m.status !== "completed") return null;
  if (m.scoreHome > m.scoreAway) return m.homeId;
  if (m.scoreAway > m.scoreHome) return m.awayId;
  // Draw — penalties decide
  if (m.penHome !== null && m.penAway !== null) {
    if (m.penHome > m.penAway) return m.homeId;
    if (m.penAway > m.penHome) return m.awayId;
  }
  return null; // no winner yet (draw without pens recorded)
}

const KO_ROUND_ORDER = ["R16", "QF", "SF", "Final"];
function nextRoundName(current) {
  const idx = KO_ROUND_ORDER.indexOf(current);
  if (idx >= 0 && idx < KO_ROUND_ORDER.length - 1) return KO_ROUND_ORDER[idx + 1];
  return null;
}

// Auto-generate next knockout round from completed round winners
function generateNextRound(allMatches, completedRound, existingMatches) {
  const roundMatches = allMatches.filter((m) => m.phase === completedRound && m.status === "completed");
  const winners = roundMatches.map(getMatchWinner).filter(Boolean);
  const next = nextRoundName(completedRound);
  if (!next || winners.length < 2) return [];
  const pairs = [];
  for (let i = 0; i < winners.length - 1; i += 2) {
    pairs.push([winners[i], winners[i + 1]]);
  }
  const newMatches = pairs.map(([h, a]) => ({
    id: uid(), homeId: h, awayId: a, groupId: null, phase: next,
    scoreHome: null, scoreAway: null, penHome: null, penAway: null,
    slotIndex: null, fieldId: null, status: "scheduled",
  }));
  const maxSlot = existingMatches.length > 0 ? Math.max(...existingMatches.map((m) => m.slotIndex ?? 0)) + 2 : 0;
  return scheduleMatches(newMatches, maxSlot, existingMatches);
}

// --- REDUCER ---
const INIT = { teams: [], groups: [], matches: [], screenView: "all" };

function reducer(state, action) {
  switch (action.type) {
    case "SEED": {
      const men = SEED_MEN.map((n) => ({ id: uid(), name: n, competition: "men" }));
      const women = SEED_WOMEN.map((n) => ({ id: uid(), name: n, competition: "women" }));
      return { ...state, teams: [...men, ...women], groups: [], matches: [] };
    }
    case "ADD_TEAM":
      return { ...state, teams: [...state.teams, { id: uid(), ...action.payload }] };
    case "REMOVE_TEAM":
      return {
        ...state,
        teams: state.teams.filter((t) => t.id !== action.payload),
        groups: state.groups.map((g) => ({ ...g, teamIds: g.teamIds.filter((id) => id !== action.payload) })).filter((g) => g.teamIds.length > 0),
        matches: state.matches.filter((m) => m.homeId !== action.payload && m.awayId !== action.payload),
      };
    case "GENERATE": {
      const comp = action.payload;
      const compTeams = state.teams.filter((t) => t.competition === comp);
      const otherGroups = state.groups.filter((g) => {
        const t = state.teams.find((x) => x.id === g.teamIds[0]);
        return t?.competition !== comp;
      });
      const otherMatches = state.matches.filter((m) => {
        const t = state.teams.find((x) => x.id === m.homeId);
        return t?.competition !== comp;
      });
      const maxPerGroup = comp === "women" ? compTeams.length : 4;
      const newGroups = buildGroups(compTeams, maxPerGroup);
      let groupMatches = buildGroupMatches(newGroups);
      const extraMatches = ensureMinMatches(groupMatches, newGroups, compTeams);
      groupMatches = [...groupMatches, ...extraMatches];
      // Schedule aware of other competition's matches to respect 6-field cap
      const scheduled = scheduleMatches(groupMatches, 0, otherMatches);
      return { ...state, groups: [...otherGroups, ...newGroups], matches: [...otherMatches, ...scheduled] };
    }
    case "GEN_KNOCKOUT": {
      const comp = action.payload;
      const compGroups = state.groups.filter((g) => {
        const t = state.teams.find((x) => x.id === g.teamIds[0]);
        return t?.competition === comp;
      });
      const ko = generateKnockout(compGroups, state.matches, state.teams);
      const maxSlot = state.matches.length > 0 ? Math.max(...state.matches.map((m) => m.slotIndex ?? 0)) + 2 : 0;
      const scheduled = scheduleMatches(ko, maxSlot, state.matches);
      return { ...state, matches: [...state.matches, ...scheduled] };
    }
    case "SCORE": {
      const { id, scoreHome, scoreAway, status, penHome, penAway } = action.payload;
      let newMatches = state.matches.map((m) => {
        if (m.id !== id) return m;
        const updated = { ...m, scoreHome, scoreAway, status };
        if (penHome !== undefined) updated.penHome = penHome;
        if (penAway !== undefined) updated.penAway = penAway;
        return updated;
      });

      // Auto-generate next knockout round if a round just completed
      if (status === "completed") {
        const justCompleted = newMatches.find((m) => m.id === id);
        if (justCompleted && justCompleted.phase !== "group" && justCompleted.phase !== "Final") {
          const round = justCompleted.phase;
          const roundMatches = newMatches.filter((m) => m.phase === round);
          const allDone = roundMatches.every((m) => m.status === "completed");
          const allHaveWinners = roundMatches.every((m) => getMatchWinner(m) !== null);
          // Check next round doesn't already exist
          const next = nextRoundName(round);
          const nextExists = next && newMatches.some((m) => m.phase === next);
          if (allDone && allHaveWinners && next && !nextExists) {
            const nextRoundMatches = generateNextRound(newMatches, round, newMatches);
            newMatches = [...newMatches, ...nextRoundMatches];
          }
        }
      }
      return { ...state, matches: newMatches };
    }
    case "SCREEN_VIEW":
      return { ...state, screenView: action.payload };
    default:
      return state;
  }
}

// --- PERSISTENCE ---
function save(s) { try { localStorage.setItem("copa_mundial", JSON.stringify(s)); } catch {} }
function load() { try { const d = localStorage.getItem("copa_mundial"); return d ? JSON.parse(d) : null; } catch { return null; } }

// ============================================================
// DESIGN SYSTEM — Kopa Events branding
// ============================================================
const C = {
  bg: "#000000",
  card: "#0d0d0d",
  input: "#161616",
  border: "#1e1e1e",
  border2: "#2a2a2a",
  accent: "#c9a227",
  accentLight: "#ddbf4a",
  accentBg: "rgba(201,162,39,0.07)",
  white: "#fff",
  text: "#e8e8e8",
  text2: "#888",
  text3: "#4a4a4a",
  live: "#00e676",
  red: "#ff5252",
  blue: "#448aff",
  orange: "#ffab40",
};

const FONT_DISPLAY = "'Syne', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:${C.bg};color:${C.text};font-family:${FONT_BODY};-webkit-font-smoothing:antialiased}
input,button,select,textarea{font-family:inherit}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.border2};border-radius:3px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
::selection{background:${C.accent};color:#000}
`;

// ============================================================
// UI COMPONENTS
// ============================================================

function Logo({ size = "md" }) {
  const fs = { sm: 18, md: 28, lg: 48, xl: 72 }[size] || 28;
  return (
    <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: fs, color: C.white, letterSpacing: "-0.04em", lineHeight: 1 }}>
      Kopa<span style={{ color: C.accent }}>.</span>
    </span>
  );
}

function EventTitle({ size = "lg" }) {
  const fs = { xl: 64, lg: 38, md: 24, sm: 18 }[size] || 38;
  return (
    <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: fs, color: C.white, letterSpacing: "-0.04em", lineHeight: 1.05, margin: 0 }}>
      Copa <span style={{ color: C.accent }}>Mundial</span>
    </h1>
  );
}

function Badge({ children, color = C.accent }) {
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
      letterSpacing: "0.07em", textTransform: "uppercase", color, background: `${color}14`, border: `1px solid ${color}22`,
    }}>{children}</span>
  );
}

function Btn({ children, onClick, v = "primary", sz = "md", disabled, style: sx }) {
  const base = { border: "none", borderRadius: 8, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", transition: "all .15s", fontFamily: FONT_BODY, letterSpacing: "0.01em", display: "inline-flex", alignItems: "center", gap: 8, opacity: disabled ? .35 : 1 };
  const szs = { sm: { padding: "6px 14px", fontSize: 12 }, md: { padding: "10px 22px", fontSize: 14 }, lg: { padding: "14px 32px", fontSize: 16 } };
  const vs = {
    primary: { background: C.accent, color: "#000" },
    secondary: { background: C.input, color: C.text, border: `1px solid ${C.border2}` },
    danger: { background: "#ff525212", color: C.red, border: `1px solid ${C.red}22` },
    ghost: { background: "transparent", color: C.text2 },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...szs[sz], ...vs[v], ...sx }}>{children}</button>;
}

function Input({ value, onChange, placeholder, type = "text", style: sx }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    style={{ background: C.input, border: `1px solid ${C.border2}`, borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 14, outline: "none", width: "100%", ...sx }} />;
}

function Card({ children, style: sx, onClick }) {
  return <div onClick={onClick} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, cursor: onClick ? "pointer" : "default", transition: "border-color .15s", ...sx }}>{children}</div>;
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, background: C.input, borderRadius: 10, padding: 3, overflow: "auto" }}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          flex: "0 0 auto", padding: "8px 14px", borderRadius: 8, border: "none",
          background: active === t.id ? C.accent : "transparent",
          color: active === t.id ? "#000" : C.text2,
          fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FONT_BODY, transition: "all .15s", whiteSpace: "nowrap",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function Section({ title, sub, right, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.white, fontFamily: FONT_DISPLAY, letterSpacing: "-0.02em" }}>{title}</h2>
          {sub && <p style={{ margin: "2px 0 0", fontSize: 12, color: C.text2 }}>{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Footer() {
  return <div style={{ textAlign: "center", padding: "24px 0 14px", fontSize: 11, color: C.text3, borderTop: `1px solid ${C.border}`, marginTop: 40 }}>Developed by <span style={{ color: C.accent, fontWeight: 700 }}>Clavert Consulting</span></div>;
}

function SponsorBar({ compact }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: compact ? 6 : 12, flexWrap: "wrap", padding: compact ? "10px 0" : "14px 0" }}>
      {SPONSORS.map((s) => (
        <span key={s} style={{ fontSize: compact ? 9 : 11, color: C.text3, fontWeight: 600, padding: compact ? "2px 6px" : "3px 10px", borderRadius: 4, background: C.input, border: `1px solid ${C.border}` }}>{s}</span>
      ))}
    </div>
  );
}

function StatusDot({ status }) {
  const col = status === "live" ? C.live : status === "completed" ? C.accent : C.text3;
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: col, display: "inline-block", marginRight: 5, animation: status === "live" ? "pulse 1.5s infinite" : "none" }} />;
}

function MatchCard({ match, teams, compact, onScore, showField = true }) {
  const home = teams.find((t) => t.id === match.homeId);
  const away = teams.find((t) => t.id === match.awayId);
  const field = FIELDS.find((f) => f.id === match.fieldId);
  const isLive = match.status === "live";
  const isDone = match.status === "completed";

  return (
    <Card style={{ padding: compact ? 12 : 16, borderLeft: isLive ? `3px solid ${C.live}` : isDone ? `3px solid ${C.accent}` : `3px solid transparent` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <StatusDot status={match.status} />
          <span style={{ fontSize: 10, color: C.text3, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>
            {match.phase === "group" ? "Group" : match.phase}{isLive && <span style={{ color: C.live }}> · LIVE</span>}
          </span>
        </div>
        {showField && field && <span style={{ fontSize: 10, color: C.text2, fontWeight: 600 }}>{field.sponsor}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ flex: 1, textAlign: "right", fontSize: compact ? 13 : 15, fontWeight: 700, color: C.text }}>{home?.name || "TBD"}</span>
        <div style={{ padding: "3px 12px", margin: "0 8px", borderRadius: 8, minWidth: 52, textAlign: "center", background: isLive ? `${C.live}0d` : C.input }}>
          {match.scoreHome !== null
            ? <div>
                <span style={{ fontSize: compact ? 16 : 20, fontWeight: 900, color: C.white, fontVariantNumeric: "tabular-nums" }}>{match.scoreHome} – {match.scoreAway}</span>
                {match.penHome !== null && match.penHome !== undefined && match.penAway !== null && (
                  <div style={{ fontSize: 10, color: C.orange, fontWeight: 700, marginTop: 1 }}>
                    ({match.penHome} – {match.penAway} pen)
                  </div>
                )}
              </div>
            : <span style={{ fontSize: 12, color: C.text3, fontWeight: 600 }}>vs</span>
          }
        </div>
        <span style={{ flex: 1, fontSize: compact ? 13 : 15, fontWeight: 700, color: C.text }}>{away?.name || "TBD"}</span>
      </div>
      {onScore && !isDone && <ScoreEditor match={match} onScore={onScore} />}
    </Card>
  );
}

function ScoreEditor({ match, onScore }) {
  const [sh, setSh] = useState(match.scoreHome !== null ? String(match.scoreHome) : "");
  const [sa, setSa] = useState(match.scoreAway !== null ? String(match.scoreAway) : "");
  const [ph, setPh] = useState(match.penHome !== null && match.penHome !== undefined ? String(match.penHome) : "");
  const [pa, setPa] = useState(match.penAway !== null && match.penAway !== undefined ? String(match.penAway) : "");
  const isKO = match.phase !== "group";
  const isDraw = sh !== "" && sa !== "" && +sh === +sa;
  const needsPens = isKO && isDraw;

  const submit = (status) => {
    if (sh === "" || sa === "") return;
    const payload = { id: match.id, scoreHome: +sh, scoreAway: +sa, status };
    if (isKO && +sh === +sa && ph !== "" && pa !== "" && +ph !== +pa) {
      payload.penHome = +ph;
      payload.penAway = +pa;
    } else if (isKO && +sh === +sa) {
      // Draw in KO without valid pens — can save as live but not FT
      if (status === "completed") return;
    }
    onScore(payload);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Input value={sh} onChange={setSh} placeholder="H" type="number" style={{ width: 46, textAlign: "center", padding: "6px" }} />
        <span style={{ color: C.text3, fontSize: 12 }}>–</span>
        <Input value={sa} onChange={setSa} placeholder="A" type="number" style={{ width: 46, textAlign: "center", padding: "6px" }} />
        <Btn sz="sm" onClick={() => submit("live")}>Live</Btn>
        <Btn sz="sm" v="secondary" onClick={() => submit("completed")}
          disabled={needsPens && (ph === "" || pa === "" || +ph === +pa)}
        >FT</Btn>
      </div>
      {needsPens && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: 10, color: C.orange, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", minWidth: 42 }}>Pens</span>
          <Input value={ph} onChange={setPh} placeholder="H" type="number" style={{ width: 46, textAlign: "center", padding: "6px", borderColor: C.orange + "40" }} />
          <span style={{ color: C.text3, fontSize: 12 }}>–</span>
          <Input value={pa} onChange={setPa} placeholder="A" type="number" style={{ width: 46, textAlign: "center", padding: "6px", borderColor: C.orange + "40" }} />
          {ph !== "" && pa !== "" && +ph === +pa && (
            <span style={{ fontSize: 10, color: C.red, fontWeight: 600 }}>Can't be equal</span>
          )}
        </div>
      )}
    </div>
  );
}

function StandingsTable({ group, matches, teams, compact }) {
  const table = computeStandings(group, matches, teams);
  const cp = compact ? "5px 5px" : "7px 8px";
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "9px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 13, color: C.accent }}>{group.name}</span>
        <span style={{ fontSize: 10, color: C.text3 }}>{group.teamIds.length} teams</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: compact ? 11 : 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["#", "Team", "P", "W", "D", "L", ...(compact ? [] : ["GD"]), "Pts"].map((h, i) => (
                <th key={h} style={{ padding: cp, textAlign: i < 2 ? "left" : "center", color: C.text3, fontWeight: 600, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((r, idx) => (
              <tr key={r.teamId} style={{ borderBottom: `1px solid ${C.border}`, background: idx < 2 ? C.accentBg : "transparent" }}>
                <td style={{ padding: cp, color: idx < 2 ? C.accent : C.text3, fontWeight: 700 }}>{idx + 1}</td>
                <td style={{ padding: cp, color: C.text, fontWeight: 600, whiteSpace: "nowrap" }}>{r.name}</td>
                <td style={{ padding: cp, textAlign: "center", color: C.text2 }}>{r.p}</td>
                <td style={{ padding: cp, textAlign: "center", color: C.text2 }}>{r.w}</td>
                <td style={{ padding: cp, textAlign: "center", color: C.text2 }}>{r.d}</td>
                <td style={{ padding: cp, textAlign: "center", color: C.text2 }}>{r.l}</td>
                {!compact && <td style={{ padding: cp, textAlign: "center", color: r.gd > 0 ? C.live : r.gd < 0 ? C.red : C.text2 }}>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>}
                <td style={{ padding: cp, textAlign: "center", color: C.accent, fontWeight: 800, fontSize: compact ? 12 : 14 }}>{r.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Notification({ msg, type = "info" }) {
  const col = type === "warning" ? C.orange : type === "success" ? C.live : C.blue;
  return (
    <div style={{ padding: "9px 14px", borderRadius: 8, background: `${col}10`, border: `1px solid ${col}20`, color: col, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 7, animation: "slideUp .3s ease" }}>
      🔔 {msg}
    </div>
  );
}

// ============================================================
// VIEW 1: ADMIN
// ============================================================
function AdminView({ state, dispatch }) {
  const [tab, setTab] = useState("teams");
  const [comp, setComp] = useState("men");
  const [newTeam, setNewTeam] = useState("");
  const isW = comp === "women";

  const teams = state.teams.filter((t) => t.competition === comp);
  const groups = state.groups.filter((g) => { const t = state.teams.find((x) => x.id === g.teamIds[0]); return t?.competition === comp; });
  const matches = state.matches.filter((m) => { const t = state.teams.find((x) => x.id === m.homeId); return t?.competition === comp; });
  const maxSlot = matches.length > 0 ? Math.max(...matches.map((m) => m.slotIndex ?? 0)) : -1;

  const tabList = isW
    ? [{ id: "teams", label: "Teams" }, { id: "schedule", label: "Schedule" }, { id: "standings", label: "Standings" }, { id: "display", label: "Screen" }]
    : [{ id: "teams", label: "Teams" }, { id: "schedule", label: "Schedule" }, { id: "standings", label: "Standings" }, { id: "knockout", label: "Knockout" }, { id: "display", label: "Screen" }];

  return (
    <div>
      <div style={{ marginBottom: 14 }}><Tabs tabs={tabList} active={tab} onChange={setTab} /></div>
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={[
          { id: "men", label: `Men (${state.teams.filter((t) => t.competition === "men").length})` },
          { id: "women", label: `Women (${state.teams.filter((t) => t.competition === "women").length})` },
        ]} active={comp} onChange={(c) => { setComp(c); if (c === "women" && tab === "knockout") setTab("standings"); }} />
      </div>

      {tab === "teams" && (
        <Section title="Teams" sub={`${comp} · min ${MIN_MATCHES_PER_TEAM} matches per team · 30 min matches${isW ? " · no knockout" : ""}`}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Input value={newTeam} onChange={setNewTeam} placeholder="Team name..." />
            <Btn onClick={() => { if (newTeam.trim()) { dispatch({ type: "ADD_TEAM", payload: { name: newTeam.trim(), competition: comp } }); setNewTeam(""); } }}>Add</Btn>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Btn v="secondary" onClick={() => dispatch({ type: "GENERATE", payload: comp })}>🔄 Generate Groups + Schedule</Btn>
            {!isW && groups.length > 0 && <Btn v="secondary" onClick={() => dispatch({ type: "GEN_KNOCKOUT", payload: comp })}>🏆 Generate Knockout</Btn>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 6 }}>
            {teams.map((t) => (
              <Card key={t.id} style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{t.name}</span>
                <button onClick={() => dispatch({ type: "REMOVE_TEAM", payload: t.id })} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 13 }}>✕</button>
              </Card>
            ))}
          </div>
          {teams.length === 0 && (
            <div style={{ textAlign: "center", padding: 36, color: C.text3 }}>
              <p style={{ marginBottom: 10 }}>No teams yet.</p>
              <Btn v="secondary" onClick={() => dispatch({ type: "SEED" })}>Load Seed Data (25M + 4W)</Btn>
            </div>
          )}
        </Section>
      )}

      {tab === "schedule" && (
        <Section title="Schedule" sub={`${matches.length} matches · ${maxSlot + 1} slots · 30 min · starts ${slotToTime(0)}`}>
          {Array.from({ length: maxSlot + 1 }, (_, si) => {
            const sm = matches.filter((m) => m.slotIndex === si);
            if (!sm.length) return null;
            return (
              <div key={si} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Badge>{`Slot ${si + 1}`}</Badge>
                  <span style={{ fontSize: 13, color: C.text2, fontWeight: 600 }}>{slotToTime(si)}</span>
                  <span style={{ fontSize: 10, color: C.text3 }}>{sm.length} match{sm.length > 1 ? "es" : ""}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 6 }}>
                  {sm.map((m) => <MatchCard key={m.id} match={m} teams={state.teams} compact onScore={(payload) => dispatch({ type: "SCORE", payload })} />)}
                </div>
              </div>
            );
          })}
          {matches.length === 0 && <div style={{ textAlign: "center", padding: 36, color: C.text3 }}>Generate tournament first.</div>}
        </Section>
      )}

      {tab === "standings" && (
        <Section title="Standings">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
            {groups.map((g) => <StandingsTable key={g.id} group={g} matches={state.matches} teams={state.teams} />)}
          </div>
          {groups.length === 0 && <div style={{ textAlign: "center", padding: 36, color: C.text3 }}>No groups yet.</div>}
        </Section>
      )}

      {tab === "knockout" && !isW && (
        <Section title="Knockout Stage" sub="Next round auto-generates when all matches in a round are completed">
          <Btn onClick={() => dispatch({ type: "GEN_KNOCKOUT", payload: comp })} style={{ marginBottom: 14 }}>🏆 Generate from Standings</Btn>
          {(() => {
            const ko = matches.filter((m) => m.phase !== "group");
            if (!ko.length) return <div style={{ textAlign: "center", padding: 36, color: C.text3 }}>Complete group stage first.</div>;
            const phaseOrder = ["R16", "QF", "SF", "Final"];
            const phaseLabels = { R16: "Round of 16", QF: "Quarter-Finals", SF: "Semi-Finals", Final: "Final" };
            const phases = phaseOrder.filter((p) => ko.some((m) => m.phase === p));
            return phases.map((ph) => {
              const roundMatches = ko.filter((m) => m.phase === ph);
              const allDone = roundMatches.every((m) => m.status === "completed");
              const allHaveWinners = roundMatches.every((m) => getMatchWinner(m) !== null);
              return (
                <div key={ph} style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Badge color={C.orange}>{phaseLabels[ph] || ph}</Badge>
                    {allDone && allHaveWinners && <Badge color={C.live}>✓ Complete</Badge>}
                    {allDone && !allHaveWinners && <Badge color={C.red}>⚠ Needs penalties</Badge>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 6 }}>
                    {roundMatches.map((m) => <MatchCard key={m.id} match={m} teams={state.teams} compact onScore={(payload) => dispatch({ type: "SCORE", payload })} />)}
                  </div>
                </div>
              );
            });
          })()}
        </Section>
      )}

      {tab === "display" && (
        <Section title="Big Screen Control" sub="Choose what to display">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 6 }}>
            {[{ id: "all", label: "All Matches" }, { id: "men-groups", label: "Men Groups" }, { id: "women-groups", label: "Women Groups" }, { id: "men-knockout", label: "Men Knockout" }, { id: "standings", label: "Standings" }, { id: "finals", label: "Finals" }].map((v) => (
              <Card key={v.id} onClick={() => dispatch({ type: "SCREEN_VIEW", payload: v.id })}
                style={{ cursor: "pointer", textAlign: "center", padding: 14, border: state.screenView === v.id ? `2px solid ${C.accent}` : `1px solid ${C.border}`, background: state.screenView === v.id ? C.accentBg : C.card }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: state.screenView === v.id ? C.accent : C.text }}>{v.label}</span>
              </Card>
            ))}
          </div>
          <Card style={{ marginTop: 14, textAlign: "center" }}>
            <p style={{ color: C.text2, fontSize: 12 }}>Open <strong style={{ color: C.accent }}>#screen</strong> in another tab for the display.</p>
          </Card>
        </Section>
      )}
    </div>
  );
}

// ============================================================
// VIEW 2: PLAYER (Mobile)
// ============================================================
function PlayerView({ state }) {
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [comp, setComp] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!selectedTeam) return;
    const notes = [];
    const upcoming = state.matches.find((m) => (m.homeId === selectedTeam || m.awayId === selectedTeam) && m.status === "scheduled");
    if (upcoming) {
      const opp = state.teams.find((t) => t.id === (upcoming.homeId === selectedTeam ? upcoming.awayId : upcoming.homeId));
      const field = FIELDS.find((f) => f.id === upcoming.fieldId);
      notes.push({ msg: `Next: vs ${opp?.name} on ${field?.sponsor} at ${slotToTime(upcoming.slotIndex ?? 0)}`, type: "info" });
    }
    const live = state.matches.find((m) => (m.homeId === selectedTeam || m.awayId === selectedTeam) && m.status === "live");
    if (live) notes.unshift({ msg: `🔴 LIVE — ${live.scoreHome} : ${live.scoreAway}`, type: "warning" });
    setNotifications(notes);
  }, [selectedTeam, state.matches, state.teams]);

  if (!comp) {
    return (
      <div style={{ padding: 20, maxWidth: 440, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 28, paddingTop: 12 }}>
          <Logo size="lg" />
          <div style={{ marginTop: 6 }}><EventTitle size="md" /></div>
          <p style={{ color: C.text2, fontSize: 12, marginTop: 5 }}>6 April 2026 · Gent</p>
          <p style={{ color: C.accent, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 3 }}>We play for more</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[{ id: "men", label: "Men's Competition", n: state.teams.filter((t) => t.competition === "men").length },
            { id: "women", label: "Women's Competition", n: state.teams.filter((t) => t.competition === "women").length }].map((c) => (
            <Card key={c.id} onClick={() => setComp(c.id)} style={{ cursor: "pointer", textAlign: "center", padding: 18 }}>
              <div style={{ fontSize: 26 }}>⚽</div>
              <h3 style={{ color: C.white, margin: "5px 0 2px", fontSize: 16, fontFamily: FONT_DISPLAY, fontWeight: 700 }}>{c.label}</h3>
              <p style={{ color: C.text2, margin: 0, fontSize: 11 }}>{c.n} teams</p>
            </Card>
          ))}
        </div>
        <SponsorBar compact />
        <Footer />
      </div>
    );
  }

  if (!selectedTeam) {
    const t = state.teams.filter((t) => t.competition === comp);
    return (
      <div style={{ padding: 20, maxWidth: 440, margin: "0 auto" }}>
        <button onClick={() => setComp(null)} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12, fontWeight: 700, marginBottom: 10, fontFamily: FONT_BODY }}>← Back</button>
        <Section title="Select Your Team" sub={`${comp} competition`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {t.map((tm) => (
              <Card key={tm.id} onClick={() => setSelectedTeam(tm.id)} style={{ cursor: "pointer", padding: 13 }}>
                <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{tm.name}</span>
              </Card>
            ))}
          </div>
        </Section>
        <Footer />
      </div>
    );
  }

  const team = state.teams.find((t) => t.id === selectedTeam);
  const teamMatches = state.matches.filter((m) => m.homeId === selectedTeam || m.awayId === selectedTeam).sort((a, b) => (a.slotIndex ?? 999) - (b.slotIndex ?? 999));
  const teamGroup = state.groups.find((g) => g.teamIds.includes(selectedTeam));

  return (
    <div style={{ padding: 14, maxWidth: 440, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button onClick={() => setSelectedTeam(null)} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: FONT_BODY }}>← Teams</button>
        <Badge>{comp}</Badge>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: C.white, fontFamily: FONT_DISPLAY, letterSpacing: "-0.02em", margin: "0 0 2px" }}>{team?.name}</h1>
      {teamGroup && <p style={{ margin: "0 0 14px", color: C.accent, fontSize: 12, fontWeight: 700 }}>{teamGroup.name}</p>}
      {notifications.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>{notifications.map((n, i) => <Notification key={i} msg={n.msg} type={n.type} />)}</div>}
      <Section title="Matches" sub={`${teamMatches.length} scheduled`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {teamMatches.map((m) => (
            <div key={m.id}>
              <div style={{ fontSize: 10, color: C.text3, marginBottom: 2, fontWeight: 600 }}>🕐 {slotToTime(m.slotIndex ?? 0)} · Slot {(m.slotIndex ?? 0) + 1}</div>
              <MatchCard match={m} teams={state.teams} compact />
            </div>
          ))}
          {teamMatches.length === 0 && <div style={{ textAlign: "center", padding: 20, color: C.text3 }}>No matches yet.</div>}
        </div>
      </Section>
      {teamGroup && <Section title="Standings"><StandingsTable group={teamGroup} matches={state.matches} teams={state.teams} compact /></Section>}
      <SponsorBar compact />
      <Footer />
    </div>
  );
}

// ============================================================
// VIEW 3: BIG SCREEN
// ============================================================
function ScreenView({ state }) {
  const [, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), POLL_INTERVAL); return () => clearInterval(iv); }, []);

  const view = state.screenView || "all";
  const all = state.matches;
  const getM = () => {
    switch (view) {
      case "men-groups": return all.filter((m) => state.teams.find((t) => t.id === m.homeId)?.competition === "men" && m.phase === "group");
      case "women-groups": return all.filter((m) => state.teams.find((t) => t.id === m.homeId)?.competition === "women");
      case "men-knockout": return all.filter((m) => state.teams.find((t) => t.id === m.homeId)?.competition === "men" && m.phase !== "group");
      case "finals": return all.filter((m) => m.phase === "Final" || m.phase === "SF");
      case "standings": return [];
      default: return all;
    }
  };
  const filtered = getM();
  const live = filtered.filter((m) => m.status === "live");
  const upcoming = filtered.filter((m) => m.status === "scheduled").slice(0, 12);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "24px 28px", fontFamily: FONT_BODY }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Logo size="lg" />
          <div><EventTitle size="lg" /><p style={{ margin: "2px 0 0", fontSize: 14, color: C.text2 }}>6 April 2026 · Gent</p></div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SPONSORS.slice(0, 6).map((s) => <div key={s} style={{ padding: "5px 12px", borderRadius: 6, background: C.card, border: `1px solid ${C.border}`, fontSize: 11, color: C.text2, fontWeight: 700 }}>{s}</div>)}
        </div>
      </div>

      {live.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.live, animation: "pulse 1.5s infinite" }} />
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.live, fontFamily: FONT_DISPLAY }}>LIVE</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(live.length, 3)}, 1fr)`, gap: 12 }}>
            {live.map((m) => {
              const home = state.teams.find((t) => t.id === m.homeId);
              const away = state.teams.find((t) => t.id === m.awayId);
              const field = FIELDS.find((f) => f.id === m.fieldId);
              return (
                <div key={m.id} style={{ background: `linear-gradient(135deg, ${C.card}, ${C.live}05)`, border: `2px solid ${C.live}30`, borderRadius: 14, padding: 20, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.live, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>{field?.sponsor} · {m.phase === "group" ? "Group" : m.phase}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
                    <div style={{ flex: 1, textAlign: "right" }}><div style={{ fontSize: 20, fontWeight: 800, color: C.white, fontFamily: FONT_DISPLAY }}>{home?.name}</div></div>
                    <div>
                      <div style={{ fontSize: 40, fontWeight: 900, color: C.white, fontVariantNumeric: "tabular-nums", minWidth: 100, fontFamily: FONT_DISPLAY }}>{m.scoreHome ?? 0} – {m.scoreAway ?? 0}</div>
                      {m.penHome !== null && m.penHome !== undefined && m.penAway !== null && (
                        <div style={{ fontSize: 14, color: C.orange, fontWeight: 700, marginTop: 2 }}>({m.penHome} – {m.penAway} pen)</div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 20, fontWeight: 800, color: C.white, fontFamily: FONT_DISPLAY }}>{away?.name}</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view !== "standings" && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: FONT_DISPLAY }}>Fields</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 7 }}>
            {FIELDS.map((f) => {
              const fm = live.find((m) => m.fieldId === f.id) || upcoming.find((m) => m.fieldId === f.id);
              const home = fm ? state.teams.find((t) => t.id === fm.homeId) : null;
              const away = fm ? state.teams.find((t) => t.id === fm.awayId) : null;
              const isL = fm?.status === "live";
              return (
                <div key={f.id} style={{ background: isL ? `${C.live}06` : C.card, border: `1px solid ${isL ? C.live + "28" : C.border}`, borderRadius: 10, padding: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, textTransform: "uppercase", marginBottom: 5, letterSpacing: "0.08em" }}>{f.sponsor}</div>
                  {fm ? (<><div style={{ fontSize: 11, fontWeight: 700, color: C.white }}>{home?.name}</div><div style={{ fontSize: 15, fontWeight: 900, color: isL ? C.live : C.text3, margin: "2px 0" }}>{isL ? `${fm.scoreHome} – ${fm.scoreAway}` : "vs"}</div><div style={{ fontSize: 11, fontWeight: 700, color: C.white }}>{away?.name}</div></>) : (<div style={{ fontSize: 10, color: C.text3, padding: "6px 0" }}>—</div>)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(view === "standings" || view === "all") && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: FONT_DISPLAY }}>Standings</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8 }}>
            {state.groups.slice(0, 8).map((g) => <StandingsTable key={g.id} group={g} matches={state.matches} teams={state.teams} compact />)}
          </div>
        </div>
      )}

      {upcoming.length > 0 && view !== "standings" && (
        <div>
          <h2 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: FONT_DISPLAY }}>Upcoming</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 6 }}>
            {upcoming.slice(0, 6).map((m) => <MatchCard key={m.id} match={m} teams={state.teams} compact />)}
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 28, padding: "12px 0", borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 11, color: C.text3 }}>Developed by <span style={{ color: C.accent, fontWeight: 700 }}>Clavert Consulting</span></span>
      </div>
    </div>
  );
}

// ============================================================
// LOGIN
// ============================================================
function LoginScreen({ onLogin }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: C.bg, padding: 20 }}>
      <style>{GLOBAL_CSS}</style>
      <Card style={{ maxWidth: 320, width: "100%", textAlign: "center", padding: 28 }}>
        <Logo size="md" />
        <h2 style={{ color: C.white, margin: "10px 0 3px", fontSize: 18, fontWeight: 800, fontFamily: FONT_DISPLAY }}>Admin Access</h2>
        <p style={{ color: C.text2, fontSize: 11, margin: "0 0 18px" }}>Enter tournament password</p>
        <Input value={pw} onChange={(v) => { setPw(v); setErr(false); }} placeholder="Password" type="password" style={{ marginBottom: 10 }} />
        {err && <p style={{ color: C.red, fontSize: 11, margin: "0 0 8px" }}>Incorrect password</p>}
        <Btn onClick={() => { if (pw === ADMIN_PASSWORD) onLogin(); else setErr(true); }} style={{ width: "100%" }}>Enter</Btn>
      </Card>
    </div>
  );
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const [state, dispatch] = useReducer(reducer, INIT, (init) => load() || init);
  const [view, setView] = useState(() => window.location.hash.replace("#", "") || "home");
  const [adminAuth, setAdminAuth] = useState(false);

  useEffect(() => { save(state); }, [state]);
  useEffect(() => { const h = () => setView(window.location.hash.replace("#", "") || "home"); window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);

  const playerUrl = `${window.location.origin}${window.location.pathname}#player`;

  if (view === "screen") return <ScreenView state={state} />;

  if (view === "admin") {
    if (!adminAuth) return <LoginScreen onLogin={() => setAdminAuth(true)} />;
    return (
      <div style={{ background: C.bg, minHeight: "100vh", fontFamily: FONT_BODY }}>
        <style>{GLOBAL_CSS}</style>
        <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Logo size="sm" /><Badge color={C.live}>Admin</Badge></div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn sz="sm" v="ghost" onClick={() => (window.location.hash = "home")}>Home</Btn>
            <Btn sz="sm" v="secondary" onClick={() => setAdminAuth(false)}>🔒 Logout</Btn>
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: 18 }}><AdminView state={state} dispatch={dispatch} /></div>
      </div>
    );
  }

  if (view === "player") return <div style={{ background: C.bg, minHeight: "100vh", fontFamily: FONT_BODY }}><style>{GLOBAL_CSS}</style><PlayerView state={state} /></div>;

  // HOME
  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: FONT_BODY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ animation: "slideUp .6s ease" }}>
        <Logo size="xl" />
        <div style={{ marginTop: 10 }}><EventTitle size="xl" /></div>
        <p style={{ color: C.text2, fontSize: 15, marginTop: 8 }}>6 April 2026 · Gent</p>
        <p style={{ color: C.accent, fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", marginTop: 4, marginBottom: 32 }}>We play for more</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 300, animation: "slideUp .6s ease .15s both" }}>
        <Btn onClick={() => (window.location.hash = "player")} sz="lg" style={{ width: "100%", justifyContent: "center" }}>⚽ Player / Supporter</Btn>
        <Btn onClick={() => (window.location.hash = "admin")} sz="lg" v="secondary" style={{ width: "100%", justifyContent: "center" }}>🔒 Admin</Btn>
        <Btn onClick={() => (window.location.hash = "screen")} sz="lg" v="secondary" style={{ width: "100%", justifyContent: "center" }}>🖥️ Big Screen</Btn>
      </div>
      <div style={{ marginTop: 24, animation: "slideUp .6s ease .3s both" }}>
        <div style={{ display: "inline-block", padding: 12, background: "#fff", borderRadius: 12 }}>
          <QRCodeSVG value={playerUrl} size={130} bgColor="#ffffff" fgColor="#000000" />
        </div>
        <p style={{ color: C.text2, fontSize: 11, marginTop: 6 }}>Scan for player view</p>
      </div>
      <SponsorBar />
      <Footer />
    </div>
  );
}
