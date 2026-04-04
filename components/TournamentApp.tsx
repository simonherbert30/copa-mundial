// @ts-nocheck
"use client";
import { useState, useEffect, useLayoutEffect, useRef, useReducer, useCallback, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";

// ============================================================
// COPA MUNDIAL — Tournament Management App
// Branding: kopa-events.be (dark premium, sporty, modern)
// ============================================================

// --- CONFIG ---
const ADMIN_PASSWORD = "kopa2026";
const RESET_PASSWORD = "kopa_reset";
const NUM_FIELDS = 8;
const SLOT_DURATION_MIN = 30;
// Ideaal: minstens 1 vrije slot (30 min pauze) tussen twee wedstrijden van hetzelfde team (slot - last > REST_SLOTS)
const REST_SLOTS = 1;
const MEN_FINALS_SLOT = 13;   // slot 13 = 11:00 + 13×30min = 17:30
const WOMEN_START_SLOT = 4;   // slot 4  = 11:00 + 4×30min  = 13:00
const WOMEN_FINALS_SLOT = 10; // slot 10 = 11:00 + 10×30min = 16:00
const MIN_MATCHES_PER_TEAM = 3;
const POLL_INTERVAL = 3000;
const START_HOUR = 11;
const START_MIN = 0;

const FIELDS = Array.from({ length: NUM_FIELDS }, (_, i) => ({
  id: i + 1,
  name: `Veld ${i + 1}`,
  sponsor: ["Monsieur Hotels", "AGO", "Jati Kebon", "Vicar", "NestBorn", "CVC", "ByJean", "Caps"][i],
}));

// Enige sponsors = logos in public/sponsors/ (tekstbalk = zelfde namen als SPONSOR_LOGOS)
const SPONSOR_LOGOS = [
  { name: "Vicar", src: "/sponsors/vicar.jpeg" },
  { name: "CVC", src: "/sponsors/cvc.jpeg" },
  { name: "AGO", src: "/sponsors/ago.jpeg" },
  { name: "ByJean", src: "/sponsors/byjean.jpeg" },
  { name: "Clavert", src: "/sponsors/clavert.jpeg" },
  { name: "Jati Kebon", src: "/sponsors/jati-kebon.jpeg" },
  { name: "Monsieur Hotels", src: "/sponsors/monsieur-hotels.jpeg" },
  { name: "Nestborn", src: "/sponsors/nestborn.jpeg" },
];
const SPONSORS = SPONSOR_LOGOS.map((s) => s.name);

// --- SEED DATA ---
const SEED_WOMEN = ["Italië", "België", "Nederland", "Peru"];
const SEED_MEN = [
  "Argentinië",
  "België",
  "Brazilië",
  "Columbia",
  "Curaçao",
  "De Verenigde Staten",
  "Engeland",
  "Frankrijk",
  "Italië",
  "Japan",
  "Marokko",
  "Mexico",
  "Portugal",
  "Senegal",
  "Spanje",
  "Uruguay",
  "Zuid-Afrika",
  "Burkina Faso",
  "Congo",
];

// Demo scheidsrechters (2 per mannenteam, cyclisch)
const DEMO_REF_NAME_POOL = [
  "Jan Peeters", "Tom Verstraeten", "Lucas Desmet", "Max Baeten", "Seppe Willems", "Niels Maes", "Pieter Claes", "Stijn Hendrickx",
  "Bram Goossens", "Koen Lemmens", "Jens Coppens", "Wout Ruelens", "Arno Segers", "Dries Thijs", "Felix Noë", "Jeroen Aerts",
  "Simon Hermans", "Vincent Fransen", "Thibo Martens", "Michiel Penders", "Sander Verbeeck", "Robin De Bruyne", "Nick Bogaerts",
  "Tim Willekens", "Dylan Jacobs", "Lars Janssens", "Quinten Heylen", "Mathijs Geerts", "Louis Coppens", "Bas Raeymaekers",
  "Daan Sterckx", "Finn Mertens", "Mauro Lenaerts", "Olivier Nijs", "Ruben Engels", "Victor Franckx", "Xavier Mol", "Yannick Peeters",
  "Zeno Verdonck", "Alex Vandenbulcke", "Ben Oosterlinck", "Chris De Wilde", "Dirk Fontaine", "Eric Masschelein",
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

let _globalTimeOffset = 0;

function slotToTime(slotIndex) {
  const d = new Date(2026, 3, 6, START_HOUR, START_MIN + _globalTimeOffset);
  d.setMinutes(d.getMinutes() + slotIndex * SLOT_DURATION_MIN);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// Returns the current "active" slot index based on real clock time.
// Slot i is displayed from (slotStart - 5min) to (slotStart + 25min).
// This covers the full 30-min block: enter 5 min before, clear 5 min after.
function getCurrentActiveSlot() {
  const now = new Date();
  const minutesSinceStart =
    (now.getHours() - START_HOUR) * 60 + (now.getMinutes() - START_MIN);
  return Math.floor((minutesSinceStart + 5) / SLOT_DURATION_MIN);
}

// --- TOURNAMENT LOGIC ---

function buildGroups(teams, maxPerGroup = 4) {
  const s = shuffle(teams);
  const nGroups = Math.ceil(s.length / maxPerGroup);
  const groups = Array.from({ length: nGroups }, (_, i) => ({
    id: uid(),
    name: `Groep ${String.fromCharCode(65 + i)}`,
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
          slotIndex: null, fieldId: null, status: "scheduled", refTeamId: null,
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
        slotIndex: null, fieldId: null, status: "scheduled", refTeamId: null,
      });
      matchCount[t.id]++;
      matchCount[partner.id]++;
    }
  }
  return extra;
}

// Aantal opeenvolgende halfuur-slots per team (bijv. slot 3 en 4 → +1 voor dat team).
function countTeamBackToBackSlots(matches) {
  const byTeam = new Map();
  for (const m of matches) {
    if (m.slotIndex === null || m.slotIndex === undefined) continue;
    for (const tid of [m.homeId, m.awayId]) {
      if (!byTeam.has(tid)) byTeam.set(tid, []);
      byTeam.get(tid).push(m.slotIndex);
    }
  }
  let n = 0;
  for (const slots of byTeam.values()) {
    slots.sort((a, b) => a - b);
    for (let i = 1; i < slots.length; i++) if (slots[i] === slots[i - 1] + 1) n++;
  }
  return n;
}

function cloneForScheduling(matches) {
  return matches.map((m) => ({ ...m, slotIndex: null, fieldId: null }));
}

// Lager score = beter: minste "twee half uren op rij"; onvolledige planning zwaar gestraft.
function scheduleMatchesBest(matches, startSlot = 0, existingMatches = [], tries = 40) {
  let bestTrial = null;
  let bestScore = Infinity;
  for (let t = 0; t < tries; t++) {
    const trial = cloneForScheduling(matches);
    scheduleMatches(trial, startSlot, existingMatches);
    const pending = trial.filter((m) => m.slotIndex === null).length;
    const placed = trial.filter((m) => m.slotIndex !== null);
    const back = countTeamBackToBackSlots([...existingMatches, ...placed]);
    const score = back * 10 + pending * 10000;
    if (score < bestScore) {
      bestScore = score;
      bestTrial = trial;
    }
  }
  return bestTrial.filter((m) => m.slotIndex !== null);
}

// existingMatches = matches from other competitions already occupying slots/fields
// Niet alle velden hoeven gebruikt: voorkeur = geen twee half uren op rij; anders max 2 op rij (niet 3).
function scheduleMatches(matches, startSlot = 0, existingMatches = []) {
  const scheduled = [];
  const unscheduled = shuffle([...matches]);
  let slot = startSlot;
  let maxIter = 2500;

  const existingBySlot = {};
  existingMatches.forEach((m) => {
    if (m.slotIndex === null) return;
    if (!existingBySlot[m.slotIndex]) existingBySlot[m.slotIndex] = { fields: new Set(), teams: new Set() };
    if (m.fieldId) existingBySlot[m.slotIndex].fields.add(m.fieldId);
    existingBySlot[m.slotIndex].teams.add(m.homeId);
    existingBySlot[m.slotIndex].teams.add(m.awayId);
  });

  const maxTwoOk = (baseMatches, m, s) =>
    consecutiveBefore(baseMatches, m.homeId, s) < 2 &&
    consecutiveBefore(baseMatches, m.awayId, s) < 2;

  const idealRestOk = (baseMatches, m, s) => {
    const h = lastSlotOf(baseMatches, m.homeId);
    const a = lastSlotOf(baseMatches, m.awayId);
    return (h === null || s - h > REST_SLOTS) && (a === null || s - a > REST_SLOTS);
  };

  /** Geen dubbele booking; mag max 2 opeenvolgende slots; geen 3e opeenvolgende. */
  const relaxedOk = (baseMatches, m, s) => {
    const h = lastSlotOf(baseMatches, m.homeId);
    const a = lastSlotOf(baseMatches, m.awayId);
    if (h !== null && s <= h) return false;
    if (a !== null && s <= a) return false;
    return maxTwoOk(baseMatches, m, s);
  };

  /** Liever wedstrijden waar beide teams de grootste rust (slot-afstand) hebben. */
  const idealScore = (baseMatches, m, s) => {
    const h = lastSlotOf(baseMatches, m.homeId);
    const a = lastSlotOf(baseMatches, m.awayId);
    const gh = h === null ? 1000 : s - h;
    const ga = a === null ? 1000 : s - a;
    return -Math.min(gh, ga);
  };

  /** Bij gedwongen back-to-back: liever teams met kortste reeks net vóór dit slot. */
  const relaxedScore = (baseMatches, m, s) =>
    consecutiveBefore(baseMatches, m.homeId, s) + consecutiveBefore(baseMatches, m.awayId, s);

  const tryPlace = (teamsInSlot, fieldsUsed, slotMatches, predicate, scoreFn) => {
    let progress = true;
    while (progress && fieldsUsed.size < NUM_FIELDS) {
      progress = false;
      let bestIdx = null;
      let bestSc = null;
      let bestTie = null;
      for (let i = unscheduled.length - 1; i >= 0; i--) {
        const m = unscheduled[i];
        if (teamsInSlot.has(m.homeId) || teamsInSlot.has(m.awayId)) continue;
        const baseForPred = [...scheduled, ...existingMatches, ...slotMatches];
        if (!predicate(baseForPred, m, slot)) continue;
        const sc = scoreFn(baseForPred, m, slot);
        const tie = String(m.id);
        if (
          bestIdx == null ||
          sc < bestSc ||
          (sc === bestSc && tie.localeCompare(bestTie) < 0)
        ) {
          bestIdx = i;
          bestSc = sc;
          bestTie = tie;
        }
      }
      if (bestIdx == null) break;
      const m = unscheduled[bestIdx];
      const fid = nextField(fieldsUsed);
      m.slotIndex = slot;
      m.fieldId = fid;
      teamsInSlot.add(m.homeId);
      teamsInSlot.add(m.awayId);
      fieldsUsed.add(fid);
      slotMatches.push(m);
      unscheduled.splice(bestIdx, 1);
      progress = true;
    }
  };

  while (unscheduled.length > 0 && maxIter-- > 0) {
    const existing = existingBySlot[slot] || { fields: new Set(), teams: new Set() };
    const teamsInSlot = new Set(existing.teams);
    const fieldsUsed = new Set(existing.fields);
    const slotMatches = [];

    tryPlace(
      teamsInSlot,
      fieldsUsed,
      slotMatches,
      (base, m, s) => idealRestOk(base, m, s) && maxTwoOk(base, m, s),
      idealScore,
    );
    tryPlace(
      teamsInSlot,
      fieldsUsed,
      slotMatches,
      (base, m, s) => relaxedOk(base, m, s) && !idealRestOk(base, m, s),
      relaxedScore,
    );

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

// Count how many consecutive matches a team has ending at (slot - 1).
// e.g. if team played slots 3 and 4, and we're asking about slot 5 → returns 2.
function consecutiveBefore(matches, teamId, slot) {
  let count = 0;
  let s = slot - 1;
  while (s >= 0 && matches.some((m) => (m.homeId === teamId || m.awayId === teamId) && m.slotIndex === s)) {
    count++;
    s--;
  }
  return count;
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

function generateKnockout(groups, matches, teams, comp?) {
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

  // For men, cap at QF (8 teams max)
  const maxBracket = comp === "men" ? 8 : 16;
  while (bracketSize > maxBracket) bracketSize /= 2;

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
    slotIndex: null, fieldId: null, status: "scheduled", refTeamId: null,
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
function generateNextRound(allMatches, completedRound, existingMatches, comp = "men") {
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
    slotIndex: null, fieldId: null, status: "scheduled", refTeamId: null, refPersonName: null,
  }));
  const prevRoundMaxSlot = existingMatches
    .filter((m) => m.phase === completedRound)
    .reduce((mx, m) => Math.max(mx, m.slotIndex ?? 0), 0);
  const startFrom = prevRoundMaxSlot + 2;
  let result = scheduleMatchesBest(newMatches, startFrom, existingMatches);
  if (next === "Final") {
    const targetSlot = comp === "women" ? WOMEN_FINALS_SLOT : MEN_FINALS_SLOT;
    const scheduledSlot = result.length > 0 ? Math.max(...result.map((m) => m.slotIndex ?? 0)) : startFrom;
    const finalSlot = Math.max(targetSlot, prevRoundMaxSlot + 1, scheduledSlot);
    result = result.map((m) => m.phase === "Final" ? { ...m, slotIndex: finalSlot } : m);
  }
  return result;
}

// Build flat list of referee persons from men's teams that have names entered.
// Each men's team can provide up to 2 referee names.
function buildRefPersons(teams) {
  const persons = [];
  teams.filter((t) => t.competition === "men").forEach((t) => {
    (t.referees || []).forEach((name, i) => {
      if (name && name.trim()) persons.push({ id: `${t.id}_${i}`, name: name.trim(), teamId: t.id });
    });
  });
  return persons;
}

// Assign referees to matches.
// Uses individual referee persons (from men's teams' referee lists) when available,
// falls back to assigning the free team name when no persons are registered.
function assignReferees(state) {
  const persons = buildRefPersons(state.teams);
  const usePersons = persons.length > 0;

  // Build slot → playing team ids map
  const slotTeams = {};
  state.matches.forEach((m) => {
    if (m.slotIndex === null) return;
    if (!slotTeams[m.slotIndex]) slotTeams[m.slotIndex] = new Set();
    slotTeams[m.slotIndex].add(m.homeId);
    slotTeams[m.slotIndex].add(m.awayId);
  });

  const allTeamIds = state.teams.map((t) => t.id);
  const refCounts = {};
  if (usePersons) {
    persons.forEach((p) => (refCounts[p.id] = 0));
  } else {
    allTeamIds.forEach((id) => (refCounts[id] = 0));
  }

  const updated = state.matches.map((m) => {
    if (m.slotIndex === null) return m;
    const playing = slotTeams[m.slotIndex] || new Set();

    if (usePersons) {
      // Pick the referee person whose team is NOT playing this slot,
      // with fewest assignments so far (round-robin balance)
      const available = persons.filter((p) => !playing.has(p.teamId));
      if (available.length === 0) return { ...m, refTeamId: null, refPersonName: null };
      available.sort((a, b) => (refCounts[a.id] || 0) - (refCounts[b.id] || 0));
      const chosen = available[0];
      refCounts[chosen.id] = (refCounts[chosen.id] || 0) + 1;
      return { ...m, refTeamId: chosen.teamId, refPersonName: chosen.name };
    } else {
      // Fallback: assign a free team (old behavior)
      const free = allTeamIds.filter((id) => !playing.has(id));
      if (free.length === 0) return { ...m, refTeamId: null, refPersonName: null };
      free.sort((a, b) => (refCounts[a] || 0) - (refCounts[b] || 0));
      const chosen = free[0];
      refCounts[chosen] = (refCounts[chosen] || 0) + 1;
      return { ...m, refTeamId: chosen, refPersonName: null };
    }
  });
  return updated;
}

// --- REDUCER ---
const INIT = { teams: [], groups: [], matches: [], screenView: ["all"], timing: { offsetMin: 0 } };

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
      const maxPerGroup = comp === "women" ? compTeams.length : 5;
      const newGroups = buildGroups(compTeams, maxPerGroup);
      let groupMatches = buildGroupMatches(newGroups);
      const extraMatches = ensureMinMatches(groupMatches, newGroups, compTeams);
      groupMatches = [...groupMatches, ...extraMatches];
      // Schedule naast andere competitie (max. NUM_FIELDS velden per slot; rust heeft voorrang)
      // Women's group matches start at WOMEN_START_SLOT (13:00)
      const startSlot = comp === "women" ? WOMEN_START_SLOT : 0;
      const scheduled = scheduleMatchesBest(groupMatches, startSlot, otherMatches);
      return { ...state, groups: [...otherGroups, ...newGroups], matches: [...otherMatches, ...scheduled] };
    }
    case "GEN_KNOCKOUT": {
      const comp = action.payload;
      const alreadyHasKO = state.matches.some((m) => {
        if (m.phase === "group") return false;
        const t = state.teams.find((x) => x.id === m.homeId);
        return t?.competition === comp;
      });
      if (alreadyHasKO) return state;
      const compGroups = state.groups.filter((g) => {
        const t = state.teams.find((x) => x.id === g.teamIds[0]);
        return t?.competition === comp;
      });
      const ko = generateKnockout(compGroups, state.matches, state.teams, comp);
      const maxSlot = state.matches.length > 0 ? Math.max(...state.matches.map((m) => m.slotIndex ?? 0)) + 2 : 0;
      let scheduled = scheduleMatchesBest(ko, maxSlot, state.matches);
      // Force Final to competition-specific finals slot, never before preceding round
      const targetFinalSlot = comp === "women" ? WOMEN_FINALS_SLOT : MEN_FINALS_SLOT;
      const sfMaxSlot = scheduled.filter((m) => m.phase !== "Final").reduce((mx, m) => Math.max(mx, m.slotIndex ?? 0), maxSlot - 2);
      const finalSlot = Math.max(targetFinalSlot, sfMaxSlot + 1);
      scheduled = scheduled.map((m) => m.phase === "Final" ? { ...m, slotIndex: finalSlot } : m);
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

      // Auto-generate next knockout round if a round just completed (filter by competition)
      if (status === "completed") {
        const justCompleted = newMatches.find((m) => m.id === id);
        if (justCompleted && justCompleted.phase !== "group" && justCompleted.phase !== "Final") {
          const matchComp = state.teams.find((t) => t.id === justCompleted.homeId)?.competition || "men";
          const round = justCompleted.phase;
          const roundMatches = newMatches.filter((m) => {
            if (m.phase !== round) return false;
            const t = state.teams.find((x) => x.id === m.homeId);
            return t?.competition === matchComp;
          });
          const allDone = roundMatches.every((m) => m.status === "completed");
          const allHaveWinners = roundMatches.every((m) => getMatchWinner(m) !== null);
          const next = nextRoundName(round);
          const nextExists = next && newMatches.some((m) => {
            if (m.phase !== next) return false;
            const t = state.teams.find((x) => x.id === m.homeId);
            return t?.competition === matchComp;
          });
          if (allDone && allHaveWinners && next && !nextExists) {
            const nextRoundMatches = generateNextRound(newMatches, round, newMatches, matchComp);
            newMatches = [...newMatches, ...nextRoundMatches];
          }
        }
      }
      return { ...state, matches: newMatches };
    }
    case "ASSIGN_REFS":
      return { ...state, matches: assignReferees(state) };
    case "SET_REF_NAME": {
      // payload: { teamId, index (0 or 1), name }
      const { teamId, index, name } = action.payload;
      return {
        ...state,
        teams: state.teams.map((t) => {
          if (t.id !== teamId) return t;
          const refs = [...(t.referees || ["", ""])];
          refs[index] = name;
          return { ...t, referees: refs };
        }),
      };
    }
    case "SEED_DEMO_REF_NAMES": {
      let i = 0;
      return {
        ...state,
        teams: state.teams.map((t) => {
          if (t.competition !== "men") return t;
          const n0 = DEMO_REF_NAME_POOL[i % DEMO_REF_NAME_POOL.length];
          const n1 = DEMO_REF_NAME_POOL[(i + 1) % DEMO_REF_NAME_POOL.length];
          i += 2;
          return { ...t, referees: [n0, n1] };
        }),
      };
    }
    case "SET_TIMING":
      return { ...state, timing: { ...(state.timing || {}), ...action.payload } };
    case "SCREEN_VIEW":
      return { ...state, screenView: action.payload };
    case "TOGGLE_SCREEN_VIEW": {
      const cur = Array.isArray(state.screenView) ? state.screenView : [state.screenView];
      const vid = action.payload;
      const nv = cur.includes(vid) ? cur.filter((v) => v !== vid) : [...cur, vid];
      return { ...state, screenView: nv.length === 0 ? ["all"] : nv };
    }
    case "LOAD":
      return { ...action.payload, timing: { offsetMin: 0, ...(action.payload.timing || {}) }, screenView: action.payload.screenView || ["all"] };
    case "RESET":
      return { ...INIT };
    case "FILL_SCORES": {
      const { phase, comp: fillComp } = action.payload;
      let newMatches = state.matches.map((m) => {
        const t = state.teams.find((x) => x.id === m.homeId);
        if (t?.competition !== fillComp) return m;
        if (m.phase !== phase) return m;
        if (m.status === "completed") return m;
        let sh = Math.floor(Math.random() * 4);
        let sa = Math.floor(Math.random() * 4);
        if (phase !== "group" && sh === sa) { sh > 0 ? sa-- : sh++; }
        return { ...m, scoreHome: sh, scoreAway: sa, status: "completed" };
      });
      if (phase !== "group") {
        const next = nextRoundName(phase);
        if (next) {
          const nextExists = newMatches.some((m) => {
            const t = state.teams.find((x) => x.id === m.homeId);
            return m.phase === next && t?.competition === fillComp;
          });
          const roundComplete = newMatches.filter((m) => {
            const t = state.teams.find((x) => x.id === m.homeId);
            return m.phase === phase && t?.competition === fillComp;
          }).every((m) => m.status === "completed");
          if (roundComplete && !nextExists) {
            const nextRoundMatches = generateNextRound(newMatches, phase, newMatches, fillComp);
            newMatches = [...newMatches, ...nextRoundMatches];
          }
        }
      }
      return { ...state, matches: newMatches };
    }
    default:
      return state;
  }
}

// --- PERSISTENCE ---
function save(s) { try { localStorage.setItem("copa_mundial", JSON.stringify(s)); } catch {} }
function load() { try { const d = localStorage.getItem("copa_mundial"); return d ? JSON.parse(d) : null; } catch { return null; } }

// --- URL STATE ENCODING (for QR cross-device sharing) ---
const PHASES_LIST = ["group", "R16", "QF", "SF", "Final"];
const STATUS_LIST = ["scheduled", "live", "completed"];

function encodeStateForUrl(state) {
  try {
    const teamIdx: Record<string, number> = {};
    state.teams.forEach((t, i) => { teamIdx[t.id] = i; });
    const groupIdx: Record<string, number> = {};
    state.groups.forEach((g, i) => { groupIdx[g.id] = i; });
    const compact = {
      t: state.teams.map((t) => [t.name, t.competition === "men" ? 0 : 1, ...(t.referees || [])]),
      g: state.groups.map((g) => [g.name, g.teamIds.map((id) => teamIdx[id] ?? -1)]),
      m: state.matches.map((m) => [
        teamIdx[m.homeId] ?? -1, teamIdx[m.awayId] ?? -1,
        groupIdx[m.groupId] ?? -1,
        PHASES_LIST.indexOf(m.phase),
        m.slotIndex ?? -1, m.fieldId ?? 0,
        STATUS_LIST.indexOf(m.status),
        m.scoreHome ?? -1, m.scoreAway ?? -1,
        m.penHome ?? -1, m.penAway ?? -1,
        m.refTeamId ? teamIdx[m.refTeamId] ?? -1 : -1,
      ]),
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
  } catch { return ""; }
}

function decodeStateFromUrl(encoded: string) {
  try {
    const compact = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    const teams = (compact.t || []).map((t, i) => ({
      id: String(i), name: t[0], competition: t[1] === 0 ? "men" : "women",
    }));
    const groups = (compact.g || []).map((g, i) => ({
      id: String(i + 10000), name: g[0] || `Groep ${String.fromCharCode(65 + i)}`,
      teamIds: (g[1] || []).map(String),
    }));
    const matches = (compact.m || []).map((m, i) => ({
      id: String(i + 20000),
      homeId: String(m[0]), awayId: String(m[1]),
      groupId: m[2] >= 0 ? String(m[2] + 10000) : null,
      phase: PHASES_LIST[m[3]] || "group",
      slotIndex: m[4] >= 0 ? m[4] : null,
      fieldId: m[5] || null,
      status: STATUS_LIST[m[6]] || "scheduled",
      scoreHome: m[7] >= 0 ? m[7] : null,
      scoreAway: m[8] >= 0 ? m[8] : null,
      penHome: m[9] >= 0 ? m[9] : null,
      penAway: m[10] >= 0 ? m[10] : null,
      refTeamId: m[11] >= 0 ? String(m[11]) : null,
    }));
    return { teams, groups, matches, screenView: "all" };
  } catch { return null; }
}

function getUrlStateParam() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("d") || "";
  } catch { return ""; }
}

// Lightweight encoding for QR codes — teams only (keeps URL short enough for QR)
function encodeTeamsForUrl(state) {
  try {
    const compact = { t: state.teams.map((t) => [t.name, t.competition === "men" ? 0 : 1]) };
    return btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
  } catch { return ""; }
}

// ============================================================
// DESIGN SYSTEM — Kopa Events branding
// ============================================================
const C = {
  bg: "#111e39",          // Kopa navy — main background
  card: "#1a2d52",        // Lighter navy for cards
  input: "#0d1728",       // Very dark navy for inputs
  border: "rgba(255,255,255,0.10)",  // Subtle white border
  border2: "rgba(255,255,255,0.20)", // More visible white border
  accent: "#d81212",      // Kopa red — primary accent/CTA
  accentLight: "#f03030",
  accentBg: "rgba(216,18,18,0.15)",
  gold: "#e8c465",        // Kopa yellow — scores, highlights
  goldLight: "#f0d080",
  goldBg: "rgba(232,196,101,0.18)",
  red: "#d81212",         // Kopa red
  darkRed: "#911a28",     // Secondary dark red
  redBg: "rgba(216,18,18,0.15)",
  blue: "#1363d6",        // Kopa blue
  green: "#3a9b3a",       // Kopa green
  cream: "#f4f0ea",       // Kopa cream
  white: "#fff",
  text: "#ffffff",
  text2: "rgba(255,255,255,0.75)",
  text3: "rgba(255,255,255,0.45)",
  live: "#3a9b3a",        // Kopa green for live/active
  orange: "#e8c465",      // map to Kopa yellow
};

const FONT_DISPLAY = "'Cubano', sans-serif";
const FONT_BODY = "'Avenir Next LT Pro', 'Avenir Next', 'Avenir', -apple-system, 'Segoe UI', sans-serif";

const GLOBAL_CSS = `
@font-face{font-family:'Cubano';src:url('/fonts/Cubano.ttf') format('truetype');font-weight:400;font-style:normal;font-display:swap}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:${C.bg};color:${C.text};font-family:${FONT_BODY};-webkit-font-smoothing:antialiased}
input,button,select,textarea{font-family:inherit}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.border2};border-radius:3px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
::selection{background:${C.gold};color:#000}
`;

// Big screen (ultrabreed ±384×192 cm, beeld 2:1): vult viewport, sponsorlogos schalen mee met vh
const BIG_SCREEN_CSS = `
.bs-root{box-sizing:border-box;width:100dvw;max-width:100dvw;height:100dvh;max-height:100dvh;overflow:hidden;display:flex;flex-direction:column;background:${C.bg};font-family:${FONT_BODY}}
.bs-main{flex:1;min-height:0;min-width:0;overflow:hidden;display:flex;flex-direction:column}
.bs-sponsor-bar{flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:clamp(4px,0.65vh,12px) clamp(10px,1.2vw,36px);gap:clamp(6px,1.2vw,20px)}
.bs-sponsor-logo{height:clamp(110px,15vh,320px);width:auto;max-width:min(46vw,640px);object-fit:contain;border-radius:8px}
.bs-welcome{flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:clamp(6px,1vh,16px) clamp(12px,1.5vw,32px);overflow:hidden}
.bs-welcome-inner{max-width:min(96vw,2600px);width:100%;text-align:center;flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;overflow:hidden}
.bs-welcome-sponsors{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:clamp(10px,1.2vw,28px);flex-shrink:0;padding-top:clamp(8px,1vh,16px)}
.bs-welcome-sponsors img{height:clamp(72px,9vh,180px);width:auto;max-width:min(20vw,220px);object-fit:contain;border-radius:8px;opacity:.9}
.bs-grid-matches{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,max(220px,10.5vw)),1fr));gap:clamp(6px,0.7vh,12px);align-content:start;min-height:0;overflow-y:auto}
.bs-standings-zone{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding-right:clamp(4px,0.5vw,12px)}
`;

// ============================================================
// UI COMPONENTS
// ============================================================

function Logo({ size = "md" }) {
  const h = { sm: 24, md: 36, lg: 56, xl: 88, xxl: 128 }[size] || 36;
  return (
    <img
      src="/branding/Kopa Events/Logos/PNG/Logo kopa white.png"
      alt="Kopa Events"
      style={{ height: h, width: "auto", display: "block", objectFit: "contain" }}
    />
  );
}

function EventTitle({ size = "lg" }) {
  const fs = { xl: 64, lg: 38, md: 24, sm: 18, xxl: 96 }[size] || 38;
  return (
    <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: fs, color: C.white, letterSpacing: "0.02em", lineHeight: 1.05, margin: 0, textTransform: "uppercase" }}>
      Copa <span style={{ color: C.gold }}>Mundial</span>
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
    primary: { background: C.accent, color: C.white },
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
          color: active === t.id ? C.white : C.text2,
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
  return <div style={{ textAlign: "center", padding: "24px 0 14px", fontSize: 11, color: C.text3, borderTop: `1px solid ${C.border}`, marginTop: 40 }}>Ontwikkeld door <span style={{ color: C.gold, fontWeight: 700 }}>Clavert Consulting</span></div>;
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
  const col = status === "live" ? C.live : status === "completed" ? C.gold : C.text3;
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: col, display: "inline-block", marginRight: 5, animation: status === "live" ? "pulse 1.5s infinite" : "none" }} />;
}

function MatchCard({ match, teams, compact, onScore, showField = true }) {
  const home = teams.find((t) => t.id === match.homeId);
  const away = teams.find((t) => t.id === match.awayId);
  const field = FIELDS.find((f) => f.id === match.fieldId);
  const ref = match.refTeamId ? teams.find((t) => t.id === match.refTeamId) : null;
  const isLive = match.status === "live";
  const isDone = match.status === "completed";

  return (
    <Card style={{ padding: compact ? 12 : 16, borderLeft: isLive ? `3px solid ${C.live}` : isDone ? `3px solid ${C.gold}` : `3px solid transparent` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <StatusDot status={match.status} />
          <span style={{ fontSize: 10, color: C.text3, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }}>
            {match.phase === "group" ? "Groep" : match.phase}{isLive && <span style={{ color: C.live }}> · LIVE</span>}
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
      {ref && <div style={{ fontSize: 10, color: C.text3, marginTop: 4, fontWeight: 600 }}>👔 Sch: {match.refPersonName ? `${match.refPersonName} (${ref.name})` : ref.name}</div>}
      {onScore && <ScoreEditor match={match} onScore={onScore} />}
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
        <Btn sz="sm" onClick={() => submit("live")}>Bezig</Btn>
        <Btn sz="sm" v="secondary" onClick={() => submit("completed")}
          disabled={needsPens && (ph === "" || pa === "" || +ph === +pa)}
        >FT</Btn>
      </div>
      {needsPens && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: 10, color: C.orange, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", minWidth: 42 }}>Strafsch.</span>
          <Input value={ph} onChange={setPh} placeholder="H" type="number" style={{ width: 46, textAlign: "center", padding: "6px", borderColor: C.orange + "40" }} />
          <span style={{ color: C.text3, fontSize: 12 }}>–</span>
          <Input value={pa} onChange={setPa} placeholder="A" type="number" style={{ width: 46, textAlign: "center", padding: "6px", borderColor: C.orange + "40" }} />
          {ph !== "" && pa !== "" && +ph === +pa && (
            <span style={{ fontSize: 10, color: C.red, fontWeight: 600 }}>Mag niet gelijk zijn</span>
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
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 13, color: C.gold }}>{group.name}</span>
        <span style={{ fontSize: 10, color: C.text3 }}>{group.teamIds.length} teams</span>{/* teams is same in Dutch */}
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
              <tr key={r.teamId} style={{ borderBottom: `1px solid ${C.border}`, background: idx < 2 ? C.goldBg : "transparent" }}>
                <td style={{ padding: cp, color: idx < 2 ? C.gold : C.text3, fontWeight: 700 }}>{idx + 1}</td>
                <td style={{ padding: cp, color: C.text, fontWeight: 600, whiteSpace: "nowrap" }}>{r.name}</td>
                <td style={{ padding: cp, textAlign: "center", color: C.text2 }}>{r.p}</td>
                <td style={{ padding: cp, textAlign: "center", color: C.text2 }}>{r.w}</td>
                <td style={{ padding: cp, textAlign: "center", color: C.text2 }}>{r.d}</td>
                <td style={{ padding: cp, textAlign: "center", color: C.text2 }}>{r.l}</td>
                {!compact && <td style={{ padding: cp, textAlign: "center", color: r.gd > 0 ? C.live : r.gd < 0 ? C.red : C.text2 }}>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>}
                <td style={{ padding: cp, textAlign: "center", color: C.gold, fontWeight: 800, fontSize: compact ? 12 : 14 }}>{r.pts}</td>
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
// KNOCKOUT BRACKET
// ============================================================
function KnockoutBracket({ matches, teams, dispatch, showField = false, bigScreen = false }) {
  const phases = KO_ROUND_ORDER.filter((p) => matches.some((m) => m.phase === p));
  if (!phases.length) {
    return <div style={{ textAlign: "center", padding: 36, color: C.text3 }}>Voltooi eerst de groepsfase.</div>;
  }

  const CARD_W = bigScreen ? 400 : 196;
  const CARD_H = bigScreen ? 130 : 62;
  const V_GAP = bigScreen ? 28 : 16;
  const H_GAP = bigScreen ? 70 : 40;
  const LABEL_H = bigScreen ? 52 : 26;
  const PHASE_LABELS = { R16: "Ronde van 16", QF: "Kwartfinales", SF: "Halve finales", Final: "Finale" };

  const byPhase = {};
  phases.forEach((p) => { byPhase[p] = matches.filter((m) => m.phase === p); });

  const unit = CARD_H + V_GAP;
  const firstRoundCount = byPhase[phases[0]].length;
  const totalH = firstRoundCount * unit;
  const totalW = phases.length * (CARD_W + H_GAP) - H_GAP;

  // Top Y of card at (roundIndex, matchIndex)
  const matchY = (ri, mi) => {
    const factor = Math.pow(2, ri);
    return (mi * factor + (factor - 1) / 2) * unit;
  };

  return (
    <div style={{ overflowX: "auto", paddingBottom: 8 }}>
      <div style={{ position: "relative", width: totalW, height: totalH + LABEL_H }}>
        {/* SVG bracket connector lines */}
        <svg
          style={{ position: "absolute", top: LABEL_H, left: 0, pointerEvents: "none" }}
          width={totalW} height={totalH}
          viewBox={`0 0 ${totalW} ${totalH}`}
        >
          {phases.map((phase, pi) => {
            if (pi === 0) return null;
            return byPhase[phase].map((_, mi) => {
              const prevRight = (pi - 1) * (CARD_W + H_GAP) + CARD_W;
              const curLeft = pi * (CARD_W + H_GAP);
              const midX = prevRight + H_GAP / 2;
              const c1Y = matchY(pi - 1, mi * 2) + CARD_H / 2;
              const c2Y = matchY(pi - 1, mi * 2 + 1) + CARD_H / 2;
              const pY = matchY(pi, mi) + CARD_H / 2;
              return (
                <g key={`${phase}-${mi}`}>
                  <line x1={prevRight} y1={c1Y} x2={midX} y2={c1Y} stroke={C.border2} strokeWidth="1.5" />
                  <line x1={prevRight} y1={c2Y} x2={midX} y2={c2Y} stroke={C.border2} strokeWidth="1.5" />
                  <line x1={midX} y1={c1Y} x2={midX} y2={c2Y} stroke={C.border2} strokeWidth="1.5" />
                  <line x1={midX} y1={pY} x2={curLeft} y2={pY} stroke={C.accent} strokeWidth="1.5" strokeOpacity="0.35" />
                </g>
              );
            });
          })}
        </svg>

        {/* Round columns */}
        {phases.map((phase, pi) => {
          const phaseMatches = byPhase[phase];
          const colX = pi * (CARD_W + H_GAP);
          return (
            <div key={phase}>
              <div style={{ position: "absolute", left: colX, top: 0, width: CARD_W, textAlign: "center", fontSize: bigScreen ? 22 : 9, fontWeight: 700, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {PHASE_LABELS[phase] || phase}
              </div>
              {phaseMatches.map((m, mi) => {
                const topY = matchY(pi, mi) + LABEL_H;
                const home = teams.find((t) => t.id === m.homeId);
                const away = teams.find((t) => t.id === m.awayId);
                const isDone = m.status === "completed";
                const isLiveM = m.status === "live";
                const winner = getMatchWinner(m);
                return (
                  <div key={m.id} style={{ position: "absolute", left: colX, top: topY, width: CARD_W }}>
                    <div style={{
                      background: C.card,
                      border: `1px solid ${isLiveM ? C.live + "55" : isDone ? C.gold + "44" : C.border}`,
                      borderRadius: bigScreen ? 12 : 8, overflow: "hidden",
                    }}>
                      {[{ tid: m.homeId, score: m.scoreHome, name: home?.name }, { tid: m.awayId, score: m.scoreAway, name: away?.name }].map((side, si) => (
                        <div key={si} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: bigScreen ? "12px 14px" : "7px 9px",
                          borderBottom: si === 0 ? `1px solid ${C.border}` : "none",
                          background: winner === side.tid ? C.goldBg : "transparent",
                        }}>
                          <span style={{ fontSize: bigScreen ? 28 : 11, fontWeight: 700, color: winner === side.tid ? C.gold : C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {side.name || "TBD"}
                          </span>
                          <span style={{ fontSize: bigScreen ? 34 : 13, fontWeight: 900, color: isDone ? C.white : C.text3, minWidth: bigScreen ? 36 : 18, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                            {isDone || isLiveM ? (side.score ?? 0) : "–"}
                          </span>
                        </div>
                      ))}
                      {m.penHome !== null && m.penHome !== undefined && m.penAway !== null && (
                        <div style={{ fontSize: bigScreen ? 18 : 9, color: C.orange, textAlign: "center", padding: "2px 0" }}>({m.penHome}–{m.penAway} strafsch.)</div>
                      )}
                      {showField && m.fieldId && (() => { const f = FIELDS.find((fi) => fi.id === m.fieldId); return f ? <div style={{ fontSize: bigScreen ? 13 : 8, color: C.text3, textAlign: "center", padding: "2px 4px", borderTop: `1px solid ${C.border}` }}>{f.sponsor} · {f.name} · {slotToTime(m.slotIndex ?? 0)}</div> : null; })()}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// MIRRORED KNOCKOUT BRACKET (Big Screen)
// ============================================================
const KO_PHASE_LABELS = { R16: "Ronde van 16", QF: "Kwartfinales", SF: "Halve finales", Final: "Finale" };

function MirroredKnockoutBracket({ matches, teams, showField = false }) {
  const outerRef = useRef(null);
  const [scale, setScale] = useState(1);

  const layout = useMemo(() => {
    const phases = KO_ROUND_ORDER.filter((p) => matches.some((m) => m.phase === p));
    if (!phases.length) return null;

    const CARD_W = 360;
    const CARD_H = 110;
    const V_GAP = 20;
    const H_GAP = 50;
    const LABEL_H = 44;

    const byPhase = {};
    phases.forEach((p) => { byPhase[p] = matches.filter((m) => m.phase === p); });

    const hasFinal = phases.includes("Final");
    const preFinalPhases = phases.filter((p) => p !== "Final");
    const unit = CARD_H + V_GAP;

    const leftByPhase = {};
    const rightByPhase = {};
    preFinalPhases.forEach((p) => {
      const m = byPhase[p];
      const half = Math.ceil(m.length / 2);
      leftByPhase[p] = m.slice(0, half);
      rightByPhase[p] = m.slice(half);
    });

    const firstPhase = preFinalPhases[0];
    const firstCount = leftByPhase[firstPhase]?.length || 1;
    const totalH = firstCount * unit;
    const nPreCols = preFinalPhases.length;
    const nCols = hasFinal ? 2 * nPreCols + 1 : 2 * nPreCols;
    const colW = CARD_W + H_GAP;
    const totalW = nCols * colW - H_GAP;

    const matchY = (ri, mi) => {
      const factor = Math.pow(2, ri);
      return (mi * factor + (factor - 1) / 2) * unit;
    };

    const renderCard = (m, x, y) => {
      const home = teams.find((t) => t.id === m.homeId);
      const away = teams.find((t) => t.id === m.awayId);
      const isDone = m.status === "completed";
      const isLiveM = m.status === "live";
      const winner = getMatchWinner(m);
      return (
        <div key={m.id} style={{ position: "absolute", left: x, top: y, width: CARD_W }}>
          <div style={{ background: C.card, border: `1px solid ${isLiveM ? C.live + "55" : isDone ? C.gold + "44" : C.border}`, borderRadius: 12, overflow: "hidden" }}>
            {[{ tid: m.homeId, score: m.scoreHome, name: home?.name }, { tid: m.awayId, score: m.scoreAway, name: away?.name }].map((side, si) => (
              <div key={si} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: si === 0 ? `1px solid ${C.border}` : "none", background: winner === side.tid ? C.goldBg : "transparent" }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: winner === side.tid ? C.gold : C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{side.name || "TBD"}</span>
                <span style={{ fontSize: 28, fontWeight: 900, color: isDone ? C.white : C.text3, minWidth: 30, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{isDone || isLiveM ? (side.score ?? 0) : "–"}</span>
              </div>
            ))}
            {m.penHome !== null && m.penHome !== undefined && m.penAway !== null && (
              <div style={{ fontSize: 14, color: C.orange, textAlign: "center", padding: "2px 0" }}>({m.penHome}–{m.penAway} strafsch.)</div>
            )}
            {showField && m.fieldId && (() => { const f = FIELDS.find((fi) => fi.id === m.fieldId); return f ? <div style={{ fontSize: 11, color: C.text3, textAlign: "center", padding: "2px 4px", borderTop: `1px solid ${C.border}` }}>{f.sponsor} · {slotToTime(m.slotIndex ?? 0)}</div> : null; })()}
          </div>
        </div>
      );
    };

    const cards = [];
    const lines = [];

    preFinalPhases.forEach((phase, pi) => {
      const leftX = pi * colW;
      const rightX = (nCols - 1 - pi) * colW;
      const leftMatches = leftByPhase[phase] || [];
      const rightMatches = rightByPhase[phase] || [];

      leftMatches.forEach((m, mi) => cards.push(renderCard(m, leftX, matchY(pi, mi) + LABEL_H)));
      rightMatches.forEach((m, mi) => cards.push(renderCard(m, rightX, matchY(pi, mi) + LABEL_H)));

      if (pi > 0) {
        const prevLeftX = (pi - 1) * colW + CARD_W;
        const curLeftX = pi * colW;
        leftMatches.forEach((_, mi) => {
          const c1Y = matchY(pi - 1, mi * 2) + CARD_H / 2;
          const c2Y = matchY(pi - 1, mi * 2 + 1) + CARD_H / 2;
          const pY = matchY(pi, mi) + CARD_H / 2;
          const midX = prevLeftX + H_GAP / 2;
          lines.push(<g key={`l-${phase}-${mi}`}><line x1={prevLeftX} y1={c1Y} x2={midX} y2={c1Y} stroke={C.border2} strokeWidth="1.5" /><line x1={prevLeftX} y1={c2Y} x2={midX} y2={c2Y} stroke={C.border2} strokeWidth="1.5" /><line x1={midX} y1={c1Y} x2={midX} y2={c2Y} stroke={C.border2} strokeWidth="1.5" /><line x1={midX} y1={pY} x2={curLeftX} y2={pY} stroke={C.accent} strokeWidth="1.5" strokeOpacity="0.35" /></g>);
        });
        const prevRightX = (nCols - pi) * colW;
        const curRightX = (nCols - 1 - pi) * colW + CARD_W;
        rightMatches.forEach((_, mi) => {
          const c1Y = matchY(pi - 1, mi * 2) + CARD_H / 2;
          const c2Y = matchY(pi - 1, mi * 2 + 1) + CARD_H / 2;
          const pY = matchY(pi, mi) + CARD_H / 2;
          const midX = curRightX + H_GAP / 2;
          lines.push(<g key={`r-${phase}-${mi}`}><line x1={prevRightX} y1={c1Y} x2={midX} y2={c1Y} stroke={C.border2} strokeWidth="1.5" /><line x1={prevRightX} y1={c2Y} x2={midX} y2={c2Y} stroke={C.border2} strokeWidth="1.5" /><line x1={midX} y1={c1Y} x2={midX} y2={c2Y} stroke={C.border2} strokeWidth="1.5" /><line x1={midX} y1={pY} x2={curRightX} y2={pY} stroke={C.accent} strokeWidth="1.5" strokeOpacity="0.35" /></g>);
        });
      }
    });

    if (hasFinal) {
      const finalX = nPreCols * colW;
      const finalY = totalH / 2 - CARD_H / 2;
      const fm = byPhase["Final"][0];
      if (fm) cards.push(renderCard(fm, finalX, finalY + LABEL_H));

      if (preFinalPhases.length > 0) {
        const lastLeftX = (nPreCols - 1) * colW + CARD_W;
        const lastRightX = (nPreCols + 1) * colW;
        const fy = finalY + CARD_H / 2;
        const lastPi = preFinalPhases.length - 1;
        const leftSFY = matchY(lastPi, 0) + CARD_H / 2;
        lines.push(<g key="final-l"><line x1={lastLeftX} y1={leftSFY} x2={finalX} y2={fy} stroke={C.accent} strokeWidth="2" strokeOpacity="0.4" /></g>);
        lines.push(<g key="final-r"><line x1={lastRightX} y1={leftSFY} x2={finalX + CARD_W} y2={fy} stroke={C.accent} strokeWidth="2" strokeOpacity="0.4" /></g>);
      }
    }

    return { totalW, totalH, LABEL_H, nCols, nPreCols, preFinalPhases, hasFinal, CARD_W, colW, lines, cards };
  }, [matches, teams, showField]);

  useLayoutEffect(() => {
    if (!layout) return;
    const el = outerRef.current;
    const contentH = layout.totalH + layout.LABEL_H;
    const contentW = layout.totalW;
    const update = () => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const mh = Math.max(100, r.height - 8);
      const mw = Math.max(100, r.width - 8);
      setScale(Math.min(1, mh / contentH, mw / contentW));
    };
    update();
    const ro = new ResizeObserver(update);
    if (el) ro.observe(el);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, [layout]);

  if (!layout) {
    return <div style={{ textAlign: "center", padding: 36, color: C.text3 }}>Voltooi eerst de groepsfase.</div>;
  }

  const { totalW, totalH, LABEL_H, nCols, nPreCols, preFinalPhases, hasFinal, CARD_W, colW, lines, cards } = layout;
  const contentH = totalH + LABEL_H;

  return (
    <div ref={outerRef} style={{ flex: 1, minHeight: 0, minWidth: 0, width: "100%", display: "flex", justifyContent: "center", alignItems: "flex-start", overflow: "hidden" }}>
      <div style={{ width: totalW * scale, height: contentH * scale, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: totalW, height: contentH }}>
          <div style={{ position: "relative", width: totalW, height: contentH, margin: "0 auto" }}>
            <svg style={{ position: "absolute", top: LABEL_H, left: 0, pointerEvents: "none" }} width={totalW} height={totalH} viewBox={`0 0 ${totalW} ${totalH}`}>{lines}</svg>
            {preFinalPhases.map((phase, pi) => (
              <div key={`label-${phase}`}>
                <div style={{ position: "absolute", left: pi * colW, top: 0, width: CARD_W, textAlign: "center", fontSize: 18, fontWeight: 700, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase" }}>{KO_PHASE_LABELS[phase] || phase}</div>
                <div style={{ position: "absolute", left: (nCols - 1 - pi) * colW, top: 0, width: CARD_W, textAlign: "center", fontSize: 18, fontWeight: 700, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase" }}>{KO_PHASE_LABELS[phase] || phase}</div>
              </div>
            ))}
            {hasFinal && <div style={{ position: "absolute", left: nPreCols * colW, top: 0, width: CARD_W, textAlign: "center", fontSize: 22, fontWeight: 700, color: C.gold, letterSpacing: "0.1em", textTransform: "uppercase" }}>Finale</div>}
            {cards}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// RESET PANEL
// ============================================================
function ResetPanel({ dispatch }) {
  const [confirm, setConfirm] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  if (!confirm) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Btn v="danger" onClick={() => setConfirm(true)}>🗑 Volledig Herstel</Btn>
        <span style={{ fontSize: 11, color: C.text3 }}>Verwijdert alle teams, wedstrijden en groepen</span>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: C.orange, marginBottom: 8, fontWeight: 600 }}>Voer het herstelwachtwoord in ter bevestiging:</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Input value={pw} onChange={(v) => { setPw(v); setErr(false); }} placeholder="Herstelwachtwoord" type="password" style={{ maxWidth: 200 }} />
        <Btn v="danger" onClick={() => {
          if (pw === RESET_PASSWORD) {
            dispatch({ type: "RESET" });
            setConfirm(false);
            setPw("");
          } else {
            setErr(true);
          }
        }}>Bevestig Herstel</Btn>
        <Btn v="ghost" onClick={() => { setConfirm(false); setPw(""); setErr(false); }}>Annuleer</Btn>
      </div>
      {err && <p style={{ color: C.red, fontSize: 11, marginTop: 6 }}>Ongeldig wachtwoord</p>}
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
  const hasKO = matches.some((m) => m.phase !== "group");
  const groupMatchesPending = matches.some((m) => m.phase === "group" && m.status !== "completed");
  const isLocked = groups.length > 0;
  const allGroupsDone = isLocked && matches.filter((m) => m.phase === "group").every((m) => m.status === "completed");

  const tabList = [
    { id: "teams", label: "Teams" },
    { id: "schedule", label: "Schema" },
    { id: "standings", label: "Stand" },
    ...(hasKO ? [{ id: "knockout", label: isW ? "Finale" : "Knockout" }] : []),
    { id: "display", label: "Scherm" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 14 }}><Tabs tabs={tabList} active={tab} onChange={setTab} /></div>
      <div style={{ marginBottom: 14 }}>
        <Tabs tabs={[
          { id: "men", label: `Mannen (${state.teams.filter((t) => t.competition === "men").length})` },
          { id: "women", label: `Vrouwen (${state.teams.filter((t) => t.competition === "women").length})` },
        ]} active={comp} onChange={(c) => { setComp(c); if (c === "women" && tab === "knockout") setTab("standings"); }} />
      </div>

      {tab === "teams" && (
        <Section title="Teams" sub={`${comp === "men" ? "mannen" : "vrouwen"} · min ${MIN_MATCHES_PER_TEAM} wedstrijden per team · 30 min per wedstrijd`}>
          {isLocked && (
            <div style={{ padding: "8px 14px", borderRadius: 8, background: C.accentBg, border: `1px solid ${C.accent}22`, color: C.accent, fontSize: 11, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              🔒 Toernooi gegenereerd — teams zijn vergrendeld
            </div>
          )}
          {!isLocked && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <Input value={newTeam} onChange={setNewTeam} placeholder="Teamnaam..." />
              <Btn onClick={() => { if (newTeam.trim()) { dispatch({ type: "ADD_TEAM", payload: { name: newTeam.trim(), competition: comp } }); setNewTeam(""); } }}>Toevoegen</Btn>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Btn v="secondary" disabled={isLocked} onClick={() => dispatch({ type: "GENERATE", payload: comp })}>🔄 Genereer Groepen + Schema</Btn>
            {!isW && groups.length > 0 && <Btn v="secondary" disabled={hasKO} onClick={() => dispatch({ type: "GEN_KNOCKOUT", payload: comp })}>🏆 Genereer Knockout</Btn>}
            {isW && groups.length > 0 && !hasKO && allGroupsDone && <Btn v="secondary" onClick={() => dispatch({ type: "GEN_KNOCKOUT", payload: "women" })}>🏆 Genereer Vrouwen Finale</Btn>}
            {groups.length > 0 && (() => { const hasRefs = state.matches.some((m) => m.refTeamId); return <Btn v={hasRefs ? "ghost" : "secondary"} onClick={() => dispatch({ type: "ASSIGN_REFS" })}>{hasRefs ? "👔 Scheidsrechters Toegewezen ✓" : "👔 Wijs Scheidsrechters Toe"}</Btn>; })()}
            {groupMatchesPending && <Btn v="ghost" sz="sm" onClick={() => dispatch({ type: "FILL_SCORES", payload: { phase: "group", comp } })} style={{ color: C.orange }}>🎲 Vul Groepsscores in (Demo)</Btn>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 6 }}>
            {teams.map((t) => (
              <Card key={t.id} style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{t.name}</span>
                {!isLocked && <button onClick={() => dispatch({ type: "REMOVE_TEAM", payload: t.id })} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 13 }}>✕</button>}
              </Card>
            ))}
          </div>
          {teams.length === 0 && (
            <div style={{ textAlign: "center", padding: 36, color: C.text3 }}>
              <p style={{ marginBottom: 10 }}>Nog geen teams.</p>
              <Btn v="secondary" onClick={() => dispatch({ type: "SEED" })}>Laad Testdata (19M + 4V)</Btn>
            </div>
          )}
          {comp === "men" && teams.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.gold, margin: 0, fontFamily: FONT_DISPLAY }}>👔 Scheidsrechters per team</h3>
                <Btn sz="sm" v="secondary" onClick={() => dispatch({ type: "SEED_DEMO_REF_NAMES" })}>Laad testdata scheidsrechters</Btn>
              </div>
              <p style={{ fontSize: 11, color: C.text2, marginBottom: 10 }}>Geef twee scheidsrechternamen per mannenteam in. Zij fluiten ook vrouwenwedstrijden.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
                {teams.map((t) => (
                  <Card key={t.id} style={{ padding: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: C.text, marginBottom: 6 }}>{t.name}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Input value={(t.referees || ["", ""])[0]} onChange={(v) => dispatch({ type: "SET_REF_NAME", payload: { teamId: t.id, index: 0, name: v } })} placeholder="Scheidsrechter 1" style={{ fontSize: 11, padding: "6px 8px" }} />
                      <Input value={(t.referees || ["", ""])[1]} onChange={(v) => dispatch({ type: "SET_REF_NAME", payload: { teamId: t.id, index: 1, name: v } })} placeholder="Scheidsrechter 2" style={{ fontSize: 11, padding: "6px 8px" }} />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {tab === "schedule" && (
        <Section title="Schema" sub={`${matches.length} wedstrijden · ${maxSlot + 1} rondes · 30 min · start ${slotToTime(0)}`}>
          {Array.from({ length: maxSlot + 1 }, (_, si) => {
            const sm = matches.filter((m) => m.slotIndex === si);
            if (!sm.length) return null;
            return (
              <div key={si} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Badge>{`Ronde ${si + 1}`}</Badge>
                  <span style={{ fontSize: 13, color: C.text2, fontWeight: 600 }}>{slotToTime(si)}</span>
                  <span style={{ fontSize: 10, color: C.text3 }}>{sm.length} wedstrijd{sm.length > 1 ? "en" : ""}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 6 }}>
                  {sm.map((m) => <MatchCard key={m.id} match={m} teams={state.teams} compact onScore={(payload) => dispatch({ type: "SCORE", payload })} />)}
                </div>
              </div>
            );
          })}
          {matches.length === 0 && <div style={{ textAlign: "center", padding: 36, color: C.text3 }}>Genereer eerst het toernooi.</div>}
        </Section>
      )}

      {tab === "standings" && (
        <Section title="Stand">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
            {groups.map((g) => <StandingsTable key={g.id} group={g} matches={state.matches} teams={state.teams} />)}
          </div>
          {groups.length === 0 && <div style={{ textAlign: "center", padding: 36, color: C.text3 }}>Nog geen groepen.</div>}
        </Section>
      )}

      {tab === "knockout" && (
        <Section title={isW ? "Vrouwen Finale" : "Knockoutfase"} sub={isW ? "Top 2 teams uit de groepsfase" : "Volgende ronde genereert automatisch als alle wedstrijden van een ronde voltooid zijn"}>
          {!isW && <Btn onClick={() => dispatch({ type: "GEN_KNOCKOUT", payload: comp })} disabled={hasKO} style={{ marginBottom: 14 }}>🏆 Genereer vanuit Stand</Btn>}
          {(() => {
            const ko = matches.filter((m) => m.phase !== "group");
            if (!ko.length) return <div style={{ textAlign: "center", padding: 36, color: C.text3 }}>Voltooi eerst de groepsfase.</div>;
            const phaseOrder = ["R16", "QF", "SF", "Final"];
            const phaseLabels = { R16: "Ronde van 16", QF: "Kwartfinales", SF: "Halve finales", Final: "Finale" };
            const phases = phaseOrder.filter((p) => ko.some((m) => m.phase === p));
            return (
              <div>
                <KnockoutBracket matches={ko} teams={state.teams} />
                <div style={{ marginTop: 28, borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: FONT_DISPLAY }}>Scores Invoeren</h3>
                  {phases.map((ph) => {
                    const roundMatches = ko.filter((m) => m.phase === ph);
                    const allDone = roundMatches.every((m) => m.status === "completed");
                    const allHaveWinners = roundMatches.every((m) => getMatchWinner(m) !== null);
                    return (
                      <div key={ph} style={{ marginBottom: 18 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                          <Badge color={C.orange}>{phaseLabels[ph] || ph}</Badge>
                          {allDone && allHaveWinners && <Badge color={C.live}>✓ Voltooid</Badge>}
                          {allDone && !allHaveWinners && <Badge color={C.red}>⚠ Strafschoppen vereist</Badge>}
                          {!allDone && <Btn v="ghost" sz="sm" onClick={() => dispatch({ type: "FILL_SCORES", payload: { phase: ph, comp } })} style={{ color: C.orange }}>🎲 Vul in (Demo)</Btn>}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 6 }}>
                          {roundMatches.map((m) => <MatchCard key={m.id} match={m} teams={state.teams} compact onScore={(payload) => dispatch({ type: "SCORE", payload })} />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </Section>
      )}

      {tab === "display" && (() => {
        const selectedViews = Array.isArray(state.screenView) ? state.screenView : [state.screenView || "all"];
        return (
        <Section title="Groot Scherm Beheer" sub="Selecteer één of meerdere weergaven — bij meerdere wisselen ze elke 8 seconden">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 6 }}>
            {[{ id: "welcome", label: "Welkomstscherm" }, { id: "all", label: "Alle Wedstrijden" }, { id: "next-matches", label: "Volgende Wedstrijden" }, { id: "men-groups", label: "Mannen Groepen" }, { id: "women-groups", label: "Vrouwen Groepen" }, { id: "men-knockout", label: "Mannen Knockout" }, { id: "standings", label: "Stand" }, { id: "finals", label: "Finales" }].map((v) => {
              const isSel = selectedViews.includes(v.id);
              return (
              <Card key={v.id} onClick={() => dispatch({ type: "TOGGLE_SCREEN_VIEW", payload: v.id })}
                style={{ cursor: "pointer", textAlign: "center", padding: 14, border: isSel ? `2px solid ${C.accent}` : `1px solid ${C.border}`, background: isSel ? C.accentBg : C.card }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: isSel ? C.accent : C.text }}>{v.label}</span>
                {isSel && <div style={{ fontSize: 10, color: C.accent, marginTop: 2 }}>✓ Actief</div>}
              </Card>
              );
            })}
          </div>
          {selectedViews.length > 1 && <div style={{ marginTop: 8, padding: "6px 12px", borderRadius: 8, background: C.goldBg, fontSize: 11, color: C.gold, fontWeight: 600 }}>⏱ {selectedViews.length} weergaven geselecteerd — wisselt elke 8 seconden</div>}
          <Card style={{ marginTop: 14, textAlign: "center" }}>
            <p style={{ color: C.text2, fontSize: 12 }}>Open <strong style={{ color: C.accent }}>#screen</strong> in een ander tabblad of op een apart apparaat voor de weergave.</p>
          </Card>
          {state.teams.length > 0 && (() => {
            const shareUrl = typeof window !== "undefined"
              ? `${window.location.origin}${window.location.pathname}?d=${encodeStateForUrl(state)}#player`
              : "";
            const screenUrl = typeof window !== "undefined"
              ? `${window.location.origin}${window.location.pathname}?d=${encodeStateForUrl(state)}#screen`
              : "";
            return (
              <>
                <Card style={{ marginTop: 10 }}>
                  <p style={{ color: C.text2, fontSize: 12, marginBottom: 8 }}>
                    🖥️ Groot scherm op apart apparaat — kopieer deze link en open op de schermcomputer:
                  </p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input readOnly value={screenUrl} style={{ flex: 1, background: C.input, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "6px 10px", color: C.text3, fontSize: 10, minWidth: 0 }} />
                    <Btn sz="sm" v="secondary" onClick={() => { navigator.clipboard?.writeText(screenUrl); }}>Kopieer</Btn>
                  </div>
                  <p style={{ color: C.text3, fontSize: 10, marginTop: 6 }}>⚠ Kopieer opnieuw en herlaad op het scherm elke keer als scores worden bijgewerkt.</p>
                </Card>
                <Card style={{ marginTop: 10 }}>
                  <p style={{ color: C.text2, fontSize: 12, marginBottom: 8 }}>
                    📱 Deel met spelers/supporters — kopieer deze link en stuur via WhatsApp:
                  </p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input readOnly value={shareUrl} style={{ flex: 1, background: C.input, border: `1px solid ${C.border2}`, borderRadius: 6, padding: "6px 10px", color: C.text3, fontSize: 10, minWidth: 0 }} />
                    <Btn sz="sm" v="secondary" onClick={() => { navigator.clipboard?.writeText(shareUrl); }}>Kopieer</Btn>
                  </div>
                  <p style={{ color: C.text3, fontSize: 10, marginTop: 6 }}>⚠ Kopieer de link opnieuw elke keer als scores worden bijgewerkt zodat spelers het laatste schema zien.</p>
                </Card>
              </>
            );
          })()}
          <Card style={{ marginTop: 14 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: C.gold, fontFamily: FONT_DISPLAY }}>⏱ Tijdsaanpassing</h3>
            <p style={{ fontSize: 11, color: C.text2, marginBottom: 10 }}>Als het toernooi uitloopt, verschuif de weergegeven tijden.</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Btn sz="sm" v="secondary" onClick={() => dispatch({ type: "SET_TIMING", payload: { offsetMin: (state.timing?.offsetMin || 0) - 15 } })}>-15 min</Btn>
              <Btn sz="sm" v="secondary" onClick={() => dispatch({ type: "SET_TIMING", payload: { offsetMin: (state.timing?.offsetMin || 0) - 5 } })}>-5 min</Btn>
              <span style={{ fontSize: 16, fontWeight: 800, color: state.timing?.offsetMin ? C.orange : C.text, minWidth: 80, textAlign: "center", fontFamily: FONT_DISPLAY }}>
                {(state.timing?.offsetMin || 0) === 0 ? "Op schema" : `${state.timing.offsetMin > 0 ? "+" : ""}${state.timing.offsetMin} min`}
              </span>
              <Btn sz="sm" v="secondary" onClick={() => dispatch({ type: "SET_TIMING", payload: { offsetMin: (state.timing?.offsetMin || 0) + 5 } })}>+5 min</Btn>
              <Btn sz="sm" v="secondary" onClick={() => dispatch({ type: "SET_TIMING", payload: { offsetMin: (state.timing?.offsetMin || 0) + 15 } })}>+15 min</Btn>
              {(state.timing?.offsetMin || 0) !== 0 && <Btn sz="sm" v="ghost" onClick={() => dispatch({ type: "SET_TIMING", payload: { offsetMin: 0 } })}>Reset</Btn>}
            </div>
          </Card>
          <div style={{ marginTop: 22, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: C.red, textTransform: "uppercase", letterSpacing: "0.08em" }}>Gevaarzone</h3>
            <ResetPanel dispatch={dispatch} />
          </div>
        </Section>
        );
      })()}
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
      notes.push({ msg: `Volgende: vs ${opp?.name} op ${field?.sponsor} om ${slotToTime(upcoming.slotIndex ?? 0)}`, type: "info" });
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
          <p style={{ color: C.text2, fontSize: 12, marginTop: 5 }}>6 april 2026 · Gent</p>
          <p style={{ color: C.gold, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 3 }}>We spelen voor meer</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[{ id: "men", label: "Mannen competitie", n: state.teams.filter((t) => t.competition === "men").length },
            { id: "women", label: "Vrouwen competitie", n: state.teams.filter((t) => t.competition === "women").length }].map((c) => (
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
        <button onClick={() => setComp(null)} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12, fontWeight: 700, marginBottom: 10, fontFamily: FONT_BODY }}>← Terug</button>
        <Section title="Kies Jouw Team" sub={`${comp === "men" ? "mannen" : "vrouwen"} competitie`}>
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
        <button onClick={() => setSelectedTeam(null)} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: FONT_BODY }}>← Teams</button>{/* Teams is same in Dutch */}
        <Badge>{comp}</Badge>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: C.white, fontFamily: FONT_DISPLAY, letterSpacing: "-0.02em", margin: "0 0 2px" }}>{team?.name}</h1>
      {teamGroup && <p style={{ margin: "0 0 14px", color: C.gold, fontSize: 12, fontWeight: 700 }}>{teamGroup.name}</p>}
      {notifications.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>{notifications.map((n, i) => <Notification key={i} msg={n.msg} type={n.type} />)}</div>}
      <Section title="Wedstrijden" sub={`${teamMatches.length} gepland`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {teamMatches.map((m) => (
            <div key={m.id}>
              <div style={{ fontSize: 10, color: C.text3, marginBottom: 2, fontWeight: 600 }}>🕐 {slotToTime(m.slotIndex ?? 0)} · Ronde {(m.slotIndex ?? 0) + 1}</div>
              <MatchCard match={m} teams={state.teams} compact />
            </div>
          ))}
          {teamMatches.length === 0 && <div style={{ textAlign: "center", padding: 20, color: C.text3 }}>Nog geen wedstrijden.</div>}
        </div>
      </Section>
      {teamGroup && <Section title="Stand"><StandingsTable group={teamGroup} matches={state.matches} teams={state.teams} compact /></Section>}
      <SponsorBar compact />
      <Footer />
    </div>
  );
}

// ============================================================
// WELCOME SCREEN
// ============================================================
function WelcomeScreenDisplay() {
  return (
    <div style={{ background: C.bg, height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 48px", fontFamily: FONT_BODY }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ maxWidth: 1400, width: "100%", textAlign: "center" }}>
        <div style={{ animation: "slideUp .6s ease", marginBottom: 20 }}>
          <Logo size="xl" />
          <div style={{ marginTop: 10, marginBottom: 6 }}><EventTitle size="xl" /></div>
          <p style={{ color: C.text2, fontSize: 28, margin: "4px 0" }}>6 april 2026 · Gent</p>
          <p style={{ color: C.gold, fontSize: 18, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 24 }}>We spelen voor meer</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20, animation: "slideUp .6s ease .2s both" }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, textAlign: "left" }}>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 42, color: C.gold, marginBottom: 22, letterSpacing: "-0.02em" }}>⏱ Wedstrijdformat</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {[
                { icon: "⚽", title: "10 min — Spel", sub: "Eerste helft" },
                { icon: "⏸", title: "5 min — Pauze", sub: "Rust" },
                { icon: "⚽", title: "10 min — Spel", sub: "Tweede helft" },
              ].map((item) => (
                <div key={item.title} style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 14, background: item.icon === "⏸" ? "#33333380" : C.accentBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, flexShrink: 0 }}>{item.icon}</div>
                  <div>
                    <p style={{ color: C.white, fontWeight: 700, fontSize: 28, margin: 0 }}>{item.title}</p>
                    <p style={{ color: C.text2, fontSize: 22, margin: 0 }}>{item.sub}</p>
                  </div>
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, marginTop: 6 }}>
                <p style={{ color: C.gold, fontWeight: 700, fontSize: 26, margin: "0 0 6px" }}>Totaal blok: 30 min</p>
                <p style={{ color: C.text2, fontSize: 22, margin: 0 }}>Volgende wedstrijd start 5 min na het blok</p>
              </div>
            </div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, textAlign: "left" }}>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 42, color: C.gold, marginBottom: 22, letterSpacing: "-0.02em" }}>🏆 Toernooiformat</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Badge color={C.blue}>Vrouwen competitie</Badge>
                </div>
                <p style={{ color: C.text, fontSize: 26, margin: "0 0 6px" }}>Iedereen speelt één keer tegen elkaar</p>
                <p style={{ color: C.text2, fontSize: 22, margin: 0 }}>De beste 2 teams spelen de finale</p>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Badge color={C.orange}>Mannen competitie</Badge>
                </div>
                <p style={{ color: C.text, fontSize: 26, margin: "0 0 10px" }}>Groepsfase — elk team speelt minimaal 3 wedstrijden</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["Kwartfinales", "Halve finales", "Finale"].map((r) => (
                    <span key={r} style={{ fontSize: 22, color: C.gold, background: C.goldBg, padding: "6px 16px", borderRadius: 8, fontWeight: 700 }}>{r}</span>
                  ))}
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                <p style={{ color: C.live, fontWeight: 800, fontSize: 36, margin: "0 0 6px", fontFamily: FONT_DISPLAY }}>⚡ Eerste aftrap om 11:00</p>
                <p style={{ color: C.text2, fontSize: 24, margin: 0 }}>8 velden · tot 8 gelijktijdige wedstrijden</p>
              </div>
            </div>
          </div>
        </div>
        <div style={{ animation: "slideUp .6s ease .4s both", display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
          {SPONSOR_LOGOS.map((s) => (
            <img key={s.name} src={s.src} alt={s.name} style={{ height: 56, objectFit: "contain", borderRadius: 8, opacity: 0.85 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Helper: find the next slot index after the last match with a score entered
function getNextMatchesSlot(matches) {
  const scored = matches.filter((m) => m.scoreHome !== null || m.scoreAway !== null);
  if (scored.length === 0) return matches.length > 0 ? Math.min(...matches.map((m) => m.slotIndex ?? 0)) : 0;
  const lastScoredSlot = Math.max(...scored.map((m) => m.slotIndex ?? 0));
  return lastScoredSlot + 1;
}

// ============================================================
// VIEW 3: BIG SCREEN
// ============================================================
function ScreenView({ state }) {
  const [, setTick] = useState(0);
  const [viewIndex, setViewIndex] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), POLL_INTERVAL); return () => clearInterval(iv); }, []);

  const views = Array.isArray(state.screenView) ? state.screenView : [state.screenView || "all"];
  useEffect(() => {
    if (views.length <= 1) return;
    const iv = setInterval(() => setViewIndex((p) => (p + 1) % views.length), 8000);
    return () => clearInterval(iv);
  }, [views.length]);

  const view = views[viewIndex % views.length];
  if (view === "welcome") return <WelcomeScreenDisplay />;
  const all = state.matches;

  const SponsorLogos = () => {
    const idx = Math.floor(Date.now() / 30000) % SPONSOR_LOGOS.length;
    const l1 = SPONSOR_LOGOS[idx];
    const l2 = SPONSOR_LOGOS[(idx + 4) % SPONSOR_LOGOS.length];
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 24px", flexShrink: 0 }}>
        <img src={l1.src} alt={l1.name} style={{ height: 50, objectFit: "contain", borderRadius: 6 }} />
        <img src={l2.src} alt={l2.name} style={{ height: 50, objectFit: "contain", borderRadius: 6 }} />
      </div>
    );
  };


  // ---- "ALL MATCHES" view — shows current active slot + next slot (fits on screen) ----
  if (view === "all") {
    const live = all.filter((m) => m.status === "live");
    const scheduledSlotNums = [...new Set(all.filter((m) => m.status === "scheduled").map((m) => m.slotIndex ?? 0))].sort((a, b) => a - b);
    const liveSlotNums = [...new Set(live.map((m) => m.slotIndex ?? 0))];
    const activeSlot = liveSlotNums.length > 0 ? Math.min(...liveSlotNums) : (scheduledSlotNums[0] ?? -1);
    const nextSlot = scheduledSlotNums.find((s) => s > activeSlot) ?? (activeSlot >= 0 ? -1 : -1);
    const activeMatches = activeSlot >= 0 ? all.filter((m) => m.slotIndex === activeSlot) : [];
    const nextMatches = nextSlot >= 0 ? all.filter((m) => m.slotIndex === nextSlot) : [];

    return (
      <div style={{ background: C.bg, height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT_BODY, overflow: "hidden" }}>
        <style>{GLOBAL_CSS}</style>
        <SponsorLogos />
        <div style={{ flex: 1, overflow: "hidden", padding: "14px 36px", display: "flex", flexDirection: "column", gap: 16 }}>
          {activeMatches.length > 0 && (
            <div style={{ flex: 1, minHeight: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                <span style={{ fontSize: 38, fontWeight: 700, color: C.gold, fontFamily: FONT_DISPLAY, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {live.length > 0 ? "Huidige Ronde" : "Nu Bezig"} — {slotToTime(activeSlot)}
                </span>
                <span style={{ fontSize: 24, color: C.text3 }}>{activeMatches.length} wedstrijden</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: 10 }}>
                {activeMatches.map((m) => {
                  const home = state.teams.find((t) => t.id === m.homeId);
                  const away = state.teams.find((t) => t.id === m.awayId);
                  const field = FIELDS.find((f) => f.id === m.fieldId);
                  const ref = m.refTeamId ? state.teams.find((t) => t.id === m.refTeamId) : null;
                  const isL = m.status === "live";
                  const isDone = m.status === "completed";
                  return (
                    <div key={m.id} style={{ background: isL ? `${C.live}0d` : C.card, border: `1px solid ${isL ? C.live + "50" : C.border}`, borderRadius: 12, padding: "12px 18px" }}>
                      <div style={{ fontSize: 24, color: isL ? C.live : C.text3, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>{field?.sponsor} · {slotToTime(m.slotIndex ?? 0)} · {m.phase === "group" ? "Groep" : m.phase}</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ flex: 1, textAlign: "right", fontSize: 48, fontWeight: 800, color: C.white, fontFamily: FONT_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{home?.name || "TBD"}</span>
                        <span style={{ fontSize: isDone || isL ? 72 : 36, fontWeight: 900, color: isDone || isL ? C.white : C.text3, padding: "0 14px", fontVariantNumeric: "tabular-nums", fontFamily: FONT_DISPLAY, minWidth: 130, textAlign: "center", flexShrink: 0 }}>
                          {isDone || isL ? `${m.scoreHome ?? 0}–${m.scoreAway ?? 0}` : "vs"}
                        </span>
                        <span style={{ flex: 1, fontSize: 48, fontWeight: 800, color: C.white, fontFamily: FONT_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{away?.name || "TBD"}</span>
                      </div>
                      {ref && <div style={{ fontSize: 20, color: C.text3, marginTop: 6, fontWeight: 600, textAlign: "center" }}>👔 Sch: {m.refPersonName ? `${m.refPersonName} (${ref.name})` : ref.name}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {nextMatches.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                <span style={{ fontSize: 34, fontWeight: 700, color: C.text2, fontFamily: FONT_DISPLAY, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Volgende — {slotToTime(nextSlot)}
                </span>
                <span style={{ fontSize: 22, color: C.text3 }}>{nextMatches.length} wedstrijden</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: 10 }}>
                {nextMatches.map((m) => {
                  const home = state.teams.find((t) => t.id === m.homeId);
                  const away = state.teams.find((t) => t.id === m.awayId);
                  const field = FIELDS.find((f) => f.id === m.fieldId);
                  const ref = m.refTeamId ? state.teams.find((t) => t.id === m.refTeamId) : null;
                  return (
                    <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 18px" }}>
                      <div style={{ fontSize: 24, color: C.text3, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>{field?.sponsor} · {slotToTime(m.slotIndex ?? 0)} · {m.phase === "group" ? "Groep" : m.phase}</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ flex: 1, textAlign: "right", fontSize: 44, fontWeight: 800, color: C.white, fontFamily: FONT_DISPLAY }}>{home?.name || "TBD"}</span>
                        <span style={{ fontSize: 32, fontWeight: 700, color: C.text3, padding: "0 14px", minWidth: 120, textAlign: "center", fontFamily: FONT_DISPLAY }}>vs</span>
                        <span style={{ flex: 1, fontSize: 44, fontWeight: 800, color: C.white, fontFamily: FONT_DISPLAY }}>{away?.name || "TBD"}</span>
                      </div>
                      {ref && <div style={{ fontSize: 18, color: C.text3, marginTop: 6, fontWeight: 600, textAlign: "center" }}>👔 Sch: {m.refPersonName ? `${m.refPersonName} (${ref.name})` : ref.name}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {all.length === 0 && <div style={{ textAlign: "center", padding: 60, color: C.text3, fontSize: 32 }}>Nog geen wedstrijden ingepland.</div>}
        </div>
      </div>
    );
  }

  // ---- "NEXT MATCHES" view ----
  if (view === "next-matches") {
    const nextSlot = getNextMatchesSlot(all);
    const nextSlotMatches = all.filter((m) => m.slotIndex === nextSlot);
    const afterSlot = nextSlot + 1;
    const afterSlotMatches = all.filter((m) => m.slotIndex === afterSlot);
    return (
      <div style={{ background: C.bg, height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT_BODY, overflow: "hidden" }}>
        <style>{GLOBAL_CSS}</style>
        <SponsorLogos />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px 36px", overflow: "hidden" }}>
          <div style={{ flex: 1, minHeight: 0, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 64, color: C.gold }}>Volgende</h2>
              {nextSlotMatches.length > 0 && <Badge color={C.gold}>{slotToTime(nextSlot)}</Badge>}
            </div>
            {nextSlotMatches.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))", gap: 14 }}>
                {nextSlotMatches.map((m) => {
                  const home = state.teams.find((t) => t.id === m.homeId);
                  const away = state.teams.find((t) => t.id === m.awayId);
                  const field = FIELDS.find((f) => f.id === m.fieldId);
                  const ref = m.refTeamId ? state.teams.find((t) => t.id === m.refTeamId) : null;
                  return (
                    <div key={m.id} style={{ background: C.card, border: `2px solid ${C.accent}40`, borderRadius: 14, padding: "18px 24px" }}>
                      <div style={{ fontSize: 26, color: C.gold, fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>
                        {field?.sponsor} · {field?.name} · {m.phase === "group" ? "Groep" : m.phase}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ flex: 1, textAlign: "right", fontSize: 52, fontWeight: 800, color: C.white, fontFamily: FONT_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{home?.name || "TBD"}</span>
                        <span style={{ fontSize: 40, fontWeight: 700, color: C.text3, padding: "2px 18px", fontFamily: FONT_DISPLAY, flexShrink: 0 }}>vs</span>
                        <span style={{ flex: 1, fontSize: 52, fontWeight: 800, color: C.white, fontFamily: FONT_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{away?.name || "TBD"}</span>
                      </div>
                      {ref && <div style={{ fontSize: 22, color: C.text3, marginTop: 8, fontWeight: 600, textAlign: "center" }}>👔 Sch: {m.refPersonName ? `${m.refPersonName} (${ref.name})` : ref.name}</div>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: C.text3, fontSize: 48 }}>Geen komende wedstrijden.</div>
            )}
          </div>
          {afterSlotMatches.length > 0 && (
            <div style={{ flex: 1, minHeight: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 48, color: C.text2 }}>Daarna</h3>
                <Badge color={C.text2}>{slotToTime(afterSlot)}</Badge>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: 10 }}>
                {afterSlotMatches.map((m) => {
                  const home = state.teams.find((t) => t.id === m.homeId);
                  const away = state.teams.find((t) => t.id === m.awayId);
                  const field = FIELDS.find((f) => f.id === m.fieldId);
                  const ref = m.refTeamId ? state.teams.find((t) => t.id === m.refTeamId) : null;
                  return (
                    <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 20px" }}>
                      <div style={{ fontSize: 24, color: C.text3, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>{field?.sponsor} · {field?.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ flex: 1, textAlign: "right", fontSize: 42, fontWeight: 700, color: C.text, fontFamily: FONT_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{home?.name || "TBD"}</span>
                        <span style={{ fontSize: 32, color: C.text3, padding: "0 12px", flexShrink: 0 }}>vs</span>
                        <span style={{ flex: 1, fontSize: 42, fontWeight: 700, color: C.text, fontFamily: FONT_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{away?.name || "TBD"}</span>
                      </div>
                      {ref && <div style={{ fontSize: 20, color: C.text3, marginTop: 6, fontWeight: 600, textAlign: "center" }}>👔 Sch: {m.refPersonName ? `${m.refPersonName} (${ref.name})` : ref.name}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- "STANDINGS" view ----
  if (view === "standings") {
    const menGroups = state.groups.filter((g) => state.teams.find((t) => t.id === g.teamIds[0])?.competition === "men");
    const womenGroups = state.groups.filter((g) => state.teams.find((t) => t.id === g.teamIds[0])?.competition === "women");
    return (
      <div style={{ background: C.bg, height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT_BODY, overflow: "hidden" }}>
        <style>{GLOBAL_CSS}</style>
        <SponsorLogos />
        <div style={{ flex: 1, overflow: "hidden", padding: "16px 36px", display: "flex", flexDirection: "column", gap: 18 }}>
          {womenGroups.length > 0 && (
            <div style={{ flex: "0 0 auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, paddingBottom: 10, borderBottom: `2px solid ${C.blue}30` }}>
                <div style={{ width: 6, height: 36, background: C.blue, borderRadius: 2 }} />
                <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 50, color: C.blue, letterSpacing: "-0.01em" }}>Vrouwen competitie</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 12 }}>
                {womenGroups.map((g) => <StandingsTable key={g.id} group={g} matches={state.matches} teams={state.teams} compact />)}
              </div>
            </div>
          )}
          {menGroups.length > 0 && (
            <div style={{ flex: "0 0 auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, paddingBottom: 10, borderBottom: `2px solid ${C.orange}30` }}>
                <div style={{ width: 6, height: 36, background: C.orange, borderRadius: 2 }} />
                <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 50, color: C.orange, letterSpacing: "-0.01em" }}>Mannen competitie</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 12 }}>
                {menGroups.map((g) => <StandingsTable key={g.id} group={g} matches={state.matches} teams={state.teams} compact />)}
              </div>
            </div>
          )}
          {state.groups.length === 0 && <div style={{ textAlign: "center", padding: 60, color: C.text3, fontSize: 32 }}>Nog geen stand.</div>}
        </div>
      </div>
    );
  }

  // ---- "MEN-GROUPS" / "WOMEN-GROUPS" views ----
  if (view === "men-groups" || view === "women-groups") {
    const compFilter = view === "men-groups" ? "men" : "women";
    const compColor = compFilter === "men" ? C.orange : C.blue;
    const compLabel = compFilter === "men" ? "Mannen competitie" : "Vrouwen competitie";
    const compGroups = state.groups.filter((g) => state.teams.find((t) => t.id === g.teamIds[0])?.competition === compFilter);
    const compMatches = all.filter((m) => state.teams.find((t) => t.id === m.homeId)?.competition === compFilter);
    return (
      <div style={{ background: C.bg, height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT_BODY, overflow: "hidden" }}>
        <style>{GLOBAL_CSS}</style>
        <SponsorLogos />
        <div style={{ flex: 1, overflow: "hidden", padding: "16px 36px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, paddingBottom: 12, borderBottom: `2px solid ${compColor}30`, flexShrink: 0 }}>
            <div style={{ width: 6, height: 36, background: compColor, borderRadius: 2 }} />
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 50, color: compColor }}>{compLabel} — Stand</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 12, overflow: "hidden" }}>
            {compGroups.map((g) => <StandingsTable key={g.id} group={g} matches={state.matches} teams={state.teams} compact />)}
          </div>
        </div>
      </div>
    );
  }

  // ---- "MEN-KNOCKOUT" view ----
  if (view === "men-knockout") {
    const koMatches = all.filter((m) => state.teams.find((t) => t.id === m.homeId)?.competition === "men" && m.phase !== "group");
    return (
      <div style={{ background: C.bg, height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT_BODY, overflow: "hidden" }}>
        <style>{GLOBAL_CSS}</style>
        <SponsorLogos />
        <div style={{ flex: 1, overflow: "hidden", padding: "16px 36px", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {koMatches.length > 0 ? (
              <MirroredKnockoutBracket matches={koMatches} teams={state.teams} showField={true} />
            ) : (
              <div style={{ textAlign: "center", padding: 60, color: C.text3, fontSize: 32 }}>Voltooi de groepsfase voor de knockout.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- "FINALS" view ----
  if (view === "finals") {
    const menFinal = all.find((m) => m.phase === "Final" && state.teams.find((t) => t.id === m.homeId)?.competition === "men");
    const womenFinal = all.find((m) => m.phase === "Final" && state.teams.find((t) => t.id === m.homeId)?.competition === "women");
    const finalMatches = [womenFinal, menFinal].filter(Boolean);
    return (
      <div style={{ background: C.bg, height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT_BODY, overflow: "hidden" }}>
        <style>{GLOBAL_CSS}</style>
        <SponsorLogos />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 36px" }}>
          {finalMatches.length === 0 ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 96, marginBottom: 20 }}>🏆</div>
              <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 96, color: C.white, marginBottom: 16 }}>Finales</h2>
              <p style={{ color: C.text3, fontSize: 48 }}>Finales nog niet bepaald.</p>
            </div>
          ) : (
            <>
              <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 72, color: C.gold, margin: "0 0 32px", letterSpacing: "-0.02em" }}>🏆 Finales</h2>
              <div style={{ display: "grid", gridTemplateColumns: finalMatches.length > 1 ? "1fr 1fr" : "minmax(500px, 800px)", gap: 40, width: "100%", maxWidth: 1600 }}>
                {finalMatches.map((m) => {
                  const home = state.teams.find((t) => t.id === m.homeId);
                  const away = state.teams.find((t) => t.id === m.awayId);
                  const comp = state.teams.find((t) => t.id === m.homeId)?.competition;
                  const field = FIELDS.find((f) => f.id === m.fieldId);
                  const isDone = m.status === "completed";
                  const isLiveM = m.status === "live";
                  const winner = getMatchWinner(m);
                  return (
                    <div key={m.id} style={{ background: `linear-gradient(135deg, ${C.card}, ${C.accentBg})`, border: `2px solid ${isLiveM ? C.live : isDone ? C.gold : C.border2}`, borderRadius: 28, padding: "36px 32px", textAlign: "center" }}>
                      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
                        <Badge color={comp === "women" ? C.blue : C.orange}>{comp === "women" ? "Vrouwenfinale" : "Mannenfinale"}</Badge>
                        {field && <span style={{ fontSize: 28, color: C.text3, fontWeight: 600 }}>{field.sponsor} · {field.name}</span>}
                        {isLiveM && <span style={{ fontSize: 28, color: C.live, fontWeight: 700, animation: "pulse 1.5s infinite" }}>● BEZIG</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
                        <div style={{ flex: 1, textAlign: "right" }}>
                          <div style={{ fontSize: 72, fontWeight: 800, color: winner === m.homeId ? C.gold : C.white, fontFamily: FONT_DISPLAY, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{home?.name || "TBD"}</div>
                          {winner === m.homeId && <div style={{ fontSize: 36, color: C.gold, fontWeight: 700, marginTop: 8 }}>🏆 WINNAAR</div>}
                        </div>
                        <div style={{ minWidth: 140, textAlign: "center" }}>
                          {isDone || isLiveM ? (
                            <div style={{ fontSize: 136, fontWeight: 900, color: C.white, fontFamily: FONT_DISPLAY, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{m.scoreHome}–{m.scoreAway}</div>
                          ) : (
                            <div style={{ fontSize: 72, color: C.text3, fontWeight: 700 }}>vs</div>
                          )}
                          {m.penHome !== null && m.penHome !== undefined && m.penAway !== null && (
                            <div style={{ fontSize: 36, color: C.orange, fontWeight: 700, marginTop: 8 }}>({m.penHome}–{m.penAway} strafsch.)</div>
                          )}
                        </div>
                        <div style={{ flex: 1, textAlign: "left" }}>
                          <div style={{ fontSize: 72, fontWeight: 800, color: winner === m.awayId ? C.gold : C.white, fontFamily: FONT_DISPLAY, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{away?.name || "TBD"}</div>
                          {winner === m.awayId && <div style={{ fontSize: 36, color: C.gold, fontWeight: 700, marginTop: 8 }}>🏆 WINNAAR</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // fallback
  return <div style={{ background: C.bg, color: C.text, padding: 40 }}>Onbekende weergave</div>;
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
        <h2 style={{ color: C.white, margin: "10px 0 3px", fontSize: 18, fontWeight: 800, fontFamily: FONT_DISPLAY }}>Admin Toegang</h2>
        <p style={{ color: C.text2, fontSize: 11, margin: "0 0 18px" }}>Voer het toernooiwachtwoord in</p>
        <Input value={pw} onChange={(v) => { setPw(v); setErr(false); }} placeholder="Wachtwoord" type="password" style={{ marginBottom: 10 }} />
        {err && <p style={{ color: C.red, fontSize: 11, margin: "0 0 8px" }}>Ongeldig wachtwoord</p>}
        <Btn onClick={() => { if (pw === ADMIN_PASSWORD) onLogin(); else setErr(true); }} style={{ width: "100%" }}>Inloggen</Btn>
      </Card>
    </div>
  );
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const [state, dispatch] = useReducer(reducer, INIT);
  const [view, setView] = useState("home");
  const [adminAuth, setAdminAuth] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load state from URL param or localStorage after client mount
  // (cannot be done in useReducer initializer because SSR has no window)
  useEffect(() => {
    const urlParam = getUrlStateParam();
    if (urlParam) {
      const decoded = decodeStateFromUrl(urlParam);
      if (decoded && decoded.teams.length > 0) {
        dispatch({ type: "LOAD", payload: decoded });
        setHydrated(true);
        return;
      }
    }
    const saved = load();
    if (saved) dispatch({ type: "LOAD", payload: saved });
    setHydrated(true);
  }, []);

  useEffect(() => { if (hydrated) save(state); }, [state, hydrated]);
  useEffect(() => {
    const initial = window.location.hash.replace("#", "") || "home";
    if (initial !== "home") setView(initial);
    const h = () => setView(window.location.hash.replace("#", "") || "home");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  useEffect(() => {
    if (view !== "screen" && view !== "player") return;
    const iv = setInterval(() => { const fresh = load(); if (fresh) dispatch({ type: "LOAD", payload: fresh }); }, POLL_INTERVAL);
    return () => clearInterval(iv);
  }, [view]);

  _globalTimeOffset = state.timing?.offsetMin || 0;

  const playerUrl = typeof window !== "undefined"
    ? state.teams.length > 0
      ? `${window.location.origin}${window.location.pathname}?d=${encodeStateForUrl(state)}#player`
      : `${window.location.origin}${window.location.pathname}#player`
    : "";

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
            <Btn sz="sm" v="secondary" onClick={() => setAdminAuth(false)}>🔒 Uitloggen</Btn>
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
        <p style={{ color: C.text2, fontSize: 15, marginTop: 8 }}>6 april 2026 · Gent</p>
        <p style={{ color: C.gold, fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", marginTop: 4, marginBottom: 32 }}>We spelen voor meer</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 300, animation: "slideUp .6s ease .15s both" }}>
        <Btn onClick={() => (window.location.hash = "player")} sz="lg" style={{ width: "100%", justifyContent: "center" }}>⚽ Speler / Supporter</Btn>
        <Btn onClick={() => (window.location.hash = "admin")} sz="lg" v="secondary" style={{ width: "100%", justifyContent: "center" }}>🔒 Admin</Btn>
        <Btn onClick={() => (window.location.hash = "screen")} sz="lg" v="secondary" style={{ width: "100%", justifyContent: "center" }}>🖥️ Groot Scherm</Btn>
      </div>
      <div style={{ marginTop: 24, animation: "slideUp .6s ease .3s both" }}>
        <div style={{ display: "inline-block", padding: 16, background: "#fff", borderRadius: 16 }}>
          <QRCodeSVG value={playerUrl} size={220} bgColor="#ffffff" fgColor="#000000" />
        </div>
        <p style={{ color: C.text2, fontSize: 11, marginTop: 6 }}>Scan voor spelersweergave</p>
      </div>
      <SponsorBar />
      <Footer />
    </div>
  );
}
