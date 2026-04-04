// @ts-nocheck
"use client";
import { useState, useEffect, useLayoutEffect, useRef, useReducer, useCallback, useMemo, type CSSProperties } from "react";

// ============================================================
// COPA MUNDIAL — Tournament Management App
// Branding: kopa-events.be (dark premium, sporty, modern)
// ============================================================

// --- CONFIG ---
const ADMIN_PASSWORD = "kopa2026";
const RESET_PASSWORD = "kopa_reset";
const NUM_FIELDS = 8;
const SLOT_DURATION_MIN = 30;
// Harde regel: geen team speelt twee opeenvolgende halfuren (planning laat velden leeg indien nodig).
// Ronde R (1-based) = standaard halfuur vanaf 11:00: slot R-1. Slot 8 = ronde 9: mannen pauzeren groepsfase, vrouwen spelen voorronde.
const PAUSE_SLOT_INDEX = 8;
/** Vrouwengroep (4 teams): rondes 5, 7, 9 — steeds 2 duels zodat alle 4 teams spelen; slots 4, 6, 8. Ronde 5 = 4 man + 2 vrouw op het veld. */
const WOMEN_GROUP_SLOTS = new Set([4, 6, 8]);
/** Mannen groepsfase: max. mannen-matchen per slot (slots 0–7 vóór pauze slot 8). Som = 40 (4×10 RR-duels). */
const MEN_GROUP_EARLY_MATCH_CAPS = [5, 5, 5, 5, 5, 5, 5, 5];
/** Vrouwen per vrouwen-ronde (slots 4, 6, 8): steeds 2 matchen. */
const WOMEN_MATCHES_PER_WOMEN_SLOT = 2;
/** Verhoog bij wijziging groepsplanner; oude localStorage-url-state krijgt nieuwe indeling. */
const GROUP_SCHEDULE_VERSION = 7;
/** Knockout-placeholder rijen (QF/SF/Final zonder teams) — migratie naar vaste skeleton-ids. */
const KO_PLACEHOLDER_VERSION = 2;
const MEN_KO_PLACEHOLDER_IDS = {
  qf: ["ko-m-qf-0", "ko-m-qf-1", "ko-m-qf-2", "ko-m-qf-3"],
  sf: ["ko-m-sf-0", "ko-m-sf-1"],
  final: "ko-m-final",
};
const WOMEN_KO_PLACEHOLDER_FINAL = "ko-w-final";
/** Mannen groepsfase: alleen slot 0–7 (slot 8 = pauze). */
const MEN_GROUP_MAX_SLOT = 7;
const FIRST_GROUP_ROUND_SLOTS = 4; // rondes 1–4: max 6 velden tegelijk
const MAX_FIELDS_FIRST_GROUP_ROUNDS = 6;
const SLOT_ROUND_QF = 9;           // ronde 10 — QF mannen
const SLOT_ROUND_SF = 10;          // ronde 11 — SF mannen + vrouwenfinale
const SLOT_ROUND_FINAL_MEN = 11;   // ronde 12 — mannenfinale
const SLOT_WOMEN_FINAL = 10;       // vrouwenfinalezelfde halfuur als SF (ander veld)
const KO_FIELD_QF = [1, 2, 3, 4]; // Monsieur Hotels, AGO, Jati Kebon, Vicar
const KO_FIELD_SF = [3, 2];       // Jati Kebon, AGO
const KO_FIELD_FINAL = 4;         // Vicar
const POLL_INTERVAL = 3000;
const DEFAULT_SCREEN_ROTATE_SEC = 8;
const SCREEN_ROTATE_SEC_MIN = 3;
const SCREEN_ROTATE_SEC_MAX = 120;
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
  { name: "Caps", src: "/sponsors/caps.jpeg" },
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
  "Duitsland",
];

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

/** Per-ronde (slot) minuten t.o.v. basisrooster; geldt voor alle wedstrijden in die ronde. */
let _slotAdjustMin = {};

function slotAdjustExtra(slotIndex) {
  return Number(_slotAdjustMin[slotIndex] ?? _slotAdjustMin[String(slotIndex)] ?? 0);
}

function slotStartMinutesOfDay(slotIndex) {
  return START_HOUR * 60 + START_MIN + slotIndex * SLOT_DURATION_MIN + slotAdjustExtra(slotIndex);
}

function slotToTime(slotIndex) {
  const d = new Date(2026, 3, 6, START_HOUR, START_MIN);
  d.setMinutes(d.getMinutes() + slotIndex * SLOT_DURATION_MIN + slotAdjustExtra(slotIndex));
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Korte fasenaanduiding voor schema-badge (alleen deze termen). */
function scheduleRoundPhaseWord(slotIndex, competition) {
  const comp = competition || "men";
  if (slotIndex < 0) return "voorrondes";
  if (slotIndex < SLOT_ROUND_QF) return "voorrondes";
  if (slotIndex === SLOT_ROUND_QF) return "kwartfinales";
  if (slotIndex === SLOT_ROUND_SF) {
    if (comp === "women") return "finale";
    return "halve finales";
  }
  if (slotIndex === SLOT_ROUND_FINAL_MEN) return "finale";
  return "voorrondes";
}

/** Admin/schema: ronde = slot + 1 (halfuur vanaf 11:00, aanpasbaar via tijdsverschuiving). */
function scheduleRoundBadgeText(slotIndex, competition) {
  const r = slotIndex + 1;
  return `Ronde ${r} · ${scheduleRoundPhaseWord(slotIndex, competition)}`;
}

function matchScheduleComp(m, teams) {
  if (m.placeholder && m.placeholderComp) return m.placeholderComp;
  return teams.find((t) => t.id === m.homeId)?.competition || "men";
}

// Returns the current "active" slot index based on real clock time.
// Slot i is displayed from (slotStart - 5min) to (slotStart + 25min).
// This covers the full 30-min block: enter 5 min before, clear 5 min after.
function getCurrentActiveSlot() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let best = 0;
  for (let i = 0; i < 32; i++) {
    if (nowMin >= slotStartMinutesOfDay(i) - 5) best = i;
  }
  return best;
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

/** Vaste poules (geen shuffle) voor vooraf vast schema. */
function buildGroupsStable(teams, maxPerGroup, idPrefix) {
  const s = [...teams];
  const nGroups = Math.ceil(s.length / maxPerGroup);
  const groups = Array.from({ length: nGroups }, (_, i) => ({
    id: `${idPrefix}${i}`,
    name: `Groep ${String.fromCharCode(65 + i)}`,
    teamIds: [],
  }));
  s.forEach((t, i) => groups[i % nGroups].teamIds.push(t.id));
  return groups;
}

function maxFieldsAtSchedulingSlot(slot) {
  return slot >= 0 && slot < FIRST_GROUP_ROUND_SLOTS ? MAX_FIELDS_FIRST_GROUP_ROUNDS : NUM_FIELDS;
}

function pairKeyIds(a, b) {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

/**
 * Vaste indeling 4-team RR: ronde 5/7/9 = alle teams aan bod (2 gelijktijdige duels per ronde).
 * Teamvolgorde = group.teamIds (stabiel uit poule).
 */
function assignWomenThreeRounds(womenMatches, existingMatches, womenGroup) {
  const ids = womenGroup.teamIds;
  if (ids.length !== 4) return false;

  const existingBySlot = {};
  for (const m of existingMatches) {
    if (m.slotIndex == null) continue;
    if (!existingBySlot[m.slotIndex]) existingBySlot[m.slotIndex] = { fields: new Set(), teams: new Set() };
    if (m.fieldId) existingBySlot[m.slotIndex].fields.add(m.fieldId);
    existingBySlot[m.slotIndex].teams.add(m.homeId);
    existingBySlot[m.slotIndex].teams.add(m.awayId);
  }

  const byPair = new Map();
  for (const m of womenMatches) {
    if (m.groupId !== womenGroup.id || m.phase !== "group") continue;
    byPair.set(pairKeyIds(m.homeId, m.awayId), m);
  }
  if (byPair.size !== 6) return false;

  const [t0, t1, t2, t3] = ids;
  const rounds = [
    [
      [t0, t1],
      [t2, t3],
    ],
    [
      [t0, t2],
      [t1, t3],
    ],
    [
      [t0, t3],
      [t1, t2],
    ],
  ];
  const slots = [4, 6, 8];

  for (let r = 0; r < 3; r++) {
    const slot = slots[r];
    const ex = existingBySlot[slot] || { fields: new Set(), teams: new Set() };
    const used = new Set(ex.fields);
    for (const [a, b] of rounds[r]) {
      const m = byPair.get(pairKeyIds(a, b));
      if (!m) return false;
      let fid = 1;
      while (fid <= NUM_FIELDS && used.has(fid)) fid++;
      if (fid > NUM_FIELDS) return false;
      m.slotIndex = slot;
      m.fieldId = fid;
      used.add(fid);
    }
  }
  return true;
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
          slotIndex: null, fieldId: null, status: "scheduled", refTeamId: null, refPersonName: null,
        });
      }
    }
  });
  return matches;
}

function isWomenGroupMatch(m, teams) {
  if (m.phase !== "group") return false;
  const h = teams.find((t) => t.id === m.homeId);
  return h?.competition === "women";
}

/** Voorrondes: vrouwen alleen op WOMEN_GROUP_SLOTS; mannen niet in slot 8 (ronde 9 pauze). */
function groupSlotAllowed(m, slot, teams) {
  if (m.phase !== "group") return true;
  if (isWomenGroupMatch(m, teams)) return WOMEN_GROUP_SLOTS.has(slot);
  if (slot === PAUSE_SLOT_INDEX) return false;
  if (slot > MEN_GROUP_MAX_SLOT) return false;
  return true;
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

function countGroupRoundGapViolations(matches) {
  const byTeam = new Map();
  for (const m of matches) {
    if (m.phase !== "group" || m.slotIndex === null || m.slotIndex === undefined) continue;
    for (const tid of [m.homeId, m.awayId]) {
      if (!byTeam.has(tid)) byTeam.set(tid, []);
      byTeam.get(tid).push(m.slotIndex);
    }
  }
  let n = 0;
  for (const slots of byTeam.values()) {
    slots.sort((a, b) => a - b);
    for (let i = 1; i < slots.length; i++) if (slots[i] - slots[i - 1] < 2) n++;
  }
  return n;
}

function countMenGroupPlanViolations(matches, teams) {
  let pen = 0;
  for (let s = 0; s < MEN_GROUP_EARLY_MATCH_CAPS.length; s++) {
    const cap = MEN_GROUP_EARLY_MATCH_CAPS[s];
    const nMen = matches.filter(
      (m) => m.phase === "group" && m.slotIndex === s && teams.find((t) => t.id === m.homeId)?.competition === "men",
    ).length;
    pen += Math.abs(nMen - cap) * 800;
  }
  return pen;
}

function countWomenGroupPlanViolations(matches, teams) {
  let pen = 0;
  for (const s of [4, 6, 8]) {
    const nW = matches.filter((m) => m.phase === "group" && m.slotIndex === s && isWomenGroupMatch(m, teams)).length;
    pen += Math.abs(nW - WOMEN_MATCHES_PER_WOMEN_SLOT) * 800;
  }
  const wantTotal4 = MEN_GROUP_EARLY_MATCH_CAPS[4] + WOMEN_MATCHES_PER_WOMEN_SLOT;
  const nSlot4 = matches.filter((m) => m.phase === "group" && m.slotIndex === 4).length;
  pen += Math.abs(nSlot4 - wantTotal4) * 500;
  return pen;
}

// Lager score = beter: geen opeenvolgende groepsrondes per team; onvolledige planning zwaar gestraft.
function scheduleMatchesBest(matches, startSlot = 0, existingMatches = [], teams = [], tries = 80, schedOpts = {}) {
  let bestTrial = null;
  let bestScore = Infinity;
  for (let t = 0; t < tries; t++) {
    const trial = cloneForScheduling(matches);
    scheduleMatches(trial, startSlot, existingMatches, teams, schedOpts);
    const pending = trial.filter((m) => m.slotIndex === null).length;
    const placed = trial.filter((m) => m.slotIndex !== null);
    const combined = [...existingMatches, ...placed];
    const back = countTeamBackToBackSlots(combined);
    const gap = countGroupRoundGapViolations(combined);
    const planPen =
      schedOpts.planPenalty === "men"
        ? countMenGroupPlanViolations(combined, teams)
        : schedOpts.planPenalty === "women"
          ? countWomenGroupPlanViolations(combined, teams)
          : 0;
    const score = planPen + gap * 40 + back * 10 + pending * 10000;
    if (score < bestScore) {
      bestScore = score;
      bestTrial = trial;
    }
  }
  return bestTrial || [];
}

function isMenGroupMatch(m, teams) {
  return m.phase === "group" && teams.find((t) => t.id === m.homeId)?.competition === "men";
}

function maxMenGroupMatchesAtSlot(slot) {
  const si = Number(slot);
  if (si >= 0 && si < MEN_GROUP_EARLY_MATCH_CAPS.length) return MEN_GROUP_EARLY_MATCH_CAPS[si];
  return NUM_FIELDS;
}

/** Vul mannen-groepsmatchen die door greedy loop op slot>7 vastliepen; gap gefaseerd 2→1→0. */
function fillRemainingMenGroupMatches(menMatches, existingNonMen, teams) {
  const pending = menMatches.filter(
    (m) => isMenGroupMatch(m, teams) && (m.slotIndex === null || m.slotIndex === undefined),
  );
  if (!pending.length) return;

  const baseCombined = () => [
    ...existingNonMen,
    ...menMatches.filter((m) => m.slotIndex != null && isMenGroupMatch(m, teams)),
  ];

  for (const m of pending) {
    let done = false;
    for (const gapNeed of [2, 1, 0]) {
      for (let slot = 0; slot <= MEN_GROUP_MAX_SLOT && !done; slot++) {
        if (!groupSlotAllowed(m, slot, teams)) continue;
        const base = baseCombined().filter((x) => x.id !== m.id);
        const gapOk = (tid) => {
          const last = lastSlotOf(base, tid);
          if (last === null) return true;
          return slot - last >= gapNeed;
        };
        if (!gapOk(m.homeId) || !gapOk(m.awayId)) continue;

        const allPlaced = baseCombined();
        const bySlot = {};
        for (const x of allPlaced) {
          if (x.slotIndex == null) continue;
          if (!bySlot[x.slotIndex]) bySlot[x.slotIndex] = { fields: new Set(), teams: new Set() };
          if (x.fieldId) bySlot[x.slotIndex].fields.add(x.fieldId);
          bySlot[x.slotIndex].teams.add(x.homeId);
          bySlot[x.slotIndex].teams.add(x.awayId);
        }
        const ex = bySlot[slot] || { fields: new Set(), teams: new Set() };
        if (ex.teams.has(m.homeId) || ex.teams.has(m.awayId)) continue;

        const nMenHere = allPlaced.filter(
          (x) => x.slotIndex === slot && isMenGroupMatch(x, teams),
        ).length;
        if (nMenHere >= maxMenGroupMatchesAtSlot(slot)) continue;

        const used = new Set(ex.fields);
        m.slotIndex = slot;
        m.fieldId = nextField(used);
        done = true;
      }
      if (done) break;
    }
  }
}

// Geen twee wedstrijden op rij per team; max 6 velden in eerste vier ronden; mannen geen groep in slot 8.
// opts.matchCapAtSlot(slot) → max. aantal matchen in dit slot voor deze batch (optioneel); anders veldlimiet.
function scheduleMatches(matches, startSlot = 0, existingMatches = [], teams = [], opts = {}) {
  const matchCapAtSlot = opts.matchCapAtSlot;
  const scheduled = [];
  const unscheduled = shuffle([...matches]);
  let slot = startSlot;
  let maxIter = 3500;

  const existingBySlot = {};
  existingMatches.forEach((m) => {
    if (m.slotIndex === null) return;
    if (!existingBySlot[m.slotIndex]) existingBySlot[m.slotIndex] = { fields: new Set(), teams: new Set() };
    if (m.fieldId) existingBySlot[m.slotIndex].fields.add(m.fieldId);
    existingBySlot[m.slotIndex].teams.add(m.homeId);
    existingBySlot[m.slotIndex].teams.add(m.awayId);
  });

  const noImmediateRepeat = (baseMatches, m, s) =>
    consecutiveBefore(baseMatches, m.homeId, s) < 1 &&
    consecutiveBefore(baseMatches, m.awayId, s) < 1;

  /** Liever wedstrijden waar beide teams de grootste rust (slot-afstand) hebben. */
  const idealScore = (baseMatches, m, s) => {
    const h = lastSlotOf(baseMatches, m.homeId);
    const a = lastSlotOf(baseMatches, m.awayId);
    const gh = h === null ? 1000 : s - h;
    const ga = a === null ? 1000 : s - a;
    return -Math.min(gh, ga);
  };

  const placePredicate = (base, m, s) => {
    if (!groupSlotAllowed(m, s, teams)) return false;
    if (m.phase === "group") {
      const gapOk = (tid) => {
        const last = lastSlotOf(base, tid);
        if (last === null) return true;
        return s - last >= 2;
      };
      return gapOk(m.homeId) && gapOk(m.awayId);
    }
    return noImmediateRepeat(base, m, s);
  };

  const tryPlace = (teamsInSlot, fieldsUsed, slotMatches, scoreFn, maxFieldsHere) => {
    let progress = true;
    while (progress && slotMatches.length < maxFieldsHere && fieldsUsed.size < maxFieldsHere) {
      progress = false;
      let bestIdx = null;
      let bestSc = null;
      let bestTie = null;
      for (let i = unscheduled.length - 1; i >= 0; i--) {
        const m = unscheduled[i];
        if (teamsInSlot.has(m.homeId) || teamsInSlot.has(m.awayId)) continue;
        const baseForPred = [...scheduled, ...existingMatches, ...slotMatches];
        if (!placePredicate(baseForPred, m, slot)) continue;
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

    const maxFieldsBase = maxFieldsAtSchedulingSlot(slot);
    const cap = matchCapAtSlot ? matchCapAtSlot(slot) : null;
    const maxHere = cap != null ? Math.min(maxFieldsBase, cap) : maxFieldsBase;

    tryPlace(teamsInSlot, fieldsUsed, slotMatches, idealScore, maxHere);

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

function isMenKoMatch(m, teams) {
  if (m.placeholder && m.placeholderComp === "men") return true;
  return teams.find((t) => t.id === m.homeId)?.competition === "men";
}
function isWomenKoMatch(m, teams) {
  if (m.placeholder && m.placeholderComp === "women") return true;
  return teams.find((t) => t.id === m.homeId)?.competition === "women";
}

function scheduleRoundBadgeTextForSlot(slotIndex, matchesInSlot, teams) {
  const compHint = (() => {
    if (!matchesInSlot.length) return "men";
    if (slotIndex === SLOT_ROUND_SF) {
      const hasWFin = matchesInSlot.some(
        (m) =>
          m.phase === "Final" &&
          (isWomenKoMatch(m, teams) || (m.placeholder && m.placeholderComp === "women")),
      );
      const hasMSF = matchesInSlot.some((m) => m.phase === "SF" && isMenKoMatch(m, teams));
      if (hasWFin && !hasMSF) return "women";
      if (hasMSF && !hasWFin) return "men";
      if (hasWFin && hasMSF) return "men";
    }
    return matchScheduleComp(matchesInSlot[0], teams);
  })();
  return scheduleRoundBadgeText(slotIndex, compHint);
}

/** QF / SF / finales op vaste velden en slotten (Copa-reglement). */
function patchKnockoutPlacement(matches, teams) {
  const sortIds = (a, b) => String(a.id).localeCompare(String(b.id));
  const isMen = (m) => isMenKoMatch(m, teams);
  const isWomen = (m) => isWomenKoMatch(m, teams);

  const menQF = matches.filter((m) => m.phase === "QF" && isMen(m)).sort(sortIds);
  menQF.forEach((m, i) => {
    if (i < KO_FIELD_QF.length) {
      m.slotIndex = SLOT_ROUND_QF;
      m.fieldId = KO_FIELD_QF[i];
    }
  });

  const womenQF = matches.filter((m) => m.phase === "QF" && isWomen(m)).sort(sortIds);
  womenQF.forEach((m, i) => {
    m.slotIndex = SLOT_ROUND_QF;
    m.fieldId = [5, 6, 7, 8][i] ?? 5;
  });

  const menSF = matches.filter((m) => m.phase === "SF" && isMen(m)).sort(sortIds);
  menSF.forEach((m, i) => {
    if (i < KO_FIELD_SF.length) {
      m.slotIndex = SLOT_ROUND_SF;
      m.fieldId = KO_FIELD_SF[i];
    }
  });

  const womenSF = matches.filter((m) => m.phase === "SF" && isWomen(m)).sort(sortIds);
  womenSF.forEach((m, i) => {
    m.slotIndex = SLOT_ROUND_SF;
    m.fieldId = [5, 6][i] ?? 5;
  });

  matches
    .filter((m) => m.phase === "R16" && isMen(m))
    .sort(sortIds)
    .forEach((m, i) => {
      m.slotIndex = Math.max(0, SLOT_ROUND_QF - 1);
      m.fieldId = KO_FIELD_QF[i % KO_FIELD_QF.length];
    });
  matches
    .filter((m) => m.phase === "R16" && isWomen(m))
    .sort(sortIds)
    .forEach((m, i) => {
      m.slotIndex = Math.max(0, SLOT_ROUND_QF - 1);
      m.fieldId = [5, 6, 7, 8][i % 4];
    });

  matches
    .filter((m) => m.phase === "Final" && isMen(m))
    .forEach((m) => {
      m.slotIndex = SLOT_ROUND_FINAL_MEN;
      m.fieldId = KO_FIELD_FINAL;
    });
  matches
    .filter((m) => m.phase === "Final" && isWomen(m))
    .forEach((m) => {
      m.slotIndex = SLOT_WOMEN_FINAL;
      m.fieldId = KO_FIELD_FINAL;
    });
}

function buildMenKnockoutSkeleton() {
  const rows = [];
  for (let i = 0; i < 4; i++) {
    rows.push({
      id: MEN_KO_PLACEHOLDER_IDS.qf[i],
      homeId: null,
      awayId: null,
      groupId: null,
      phase: "QF",
      scoreHome: null,
      scoreAway: null,
      penHome: null,
      penAway: null,
      slotIndex: null,
      fieldId: null,
      status: "scheduled",
      refTeamId: null,
      refPersonName: null,
      placeholder: true,
      placeholderComp: "men",
    });
  }
  for (let i = 0; i < 2; i++) {
    rows.push({
      id: MEN_KO_PLACEHOLDER_IDS.sf[i],
      homeId: null,
      awayId: null,
      groupId: null,
      phase: "SF",
      scoreHome: null,
      scoreAway: null,
      penHome: null,
      penAway: null,
      slotIndex: null,
      fieldId: null,
      status: "scheduled",
      refTeamId: null,
      refPersonName: null,
      placeholder: true,
      placeholderComp: "men",
    });
  }
  rows.push({
    id: MEN_KO_PLACEHOLDER_IDS.final,
    homeId: null,
    awayId: null,
    groupId: null,
    phase: "Final",
    scoreHome: null,
    scoreAway: null,
    penHome: null,
    penAway: null,
    slotIndex: null,
    fieldId: null,
    status: "scheduled",
    refTeamId: null,
    refPersonName: null,
    placeholder: true,
    placeholderComp: "men",
  });
  patchKnockoutPlacement(rows, buildFixedTeams());
  return rows;
}

/** Zorg dat mannen-knockoutslots in het schema staan (idempotent). */
function ensureMenKoSkeleton(matches, teams) {
  const hasRealMenKo = matches.some((m) => {
    if (m.phase === "group" || m.placeholder) return false;
    const t = teams.find((x) => x.id === m.homeId);
    return t?.competition === "men";
  });
  if (hasRealMenKo) return matches;
  if (matches.some((m) => m.id === MEN_KO_PLACEHOLDER_IDS.qf[0])) return matches;
  return [...matches, ...buildMenKnockoutSkeleton()];
}

function buildWomenFinalSkeleton() {
  const row = {
    id: WOMEN_KO_PLACEHOLDER_FINAL,
    homeId: null,
    awayId: null,
    groupId: null,
    phase: "Final",
    scoreHome: null,
    scoreAway: null,
    penHome: null,
    penAway: null,
    slotIndex: null,
    fieldId: null,
    status: "scheduled",
    refTeamId: null,
    refPersonName: null,
    placeholder: true,
    placeholderComp: "women",
  };
  patchKnockoutPlacement([row], buildFixedTeams());
  return [row];
}

function ensureWomenFinalSkeleton(matches, teams) {
  const hasRealWomenKo = matches.some((m) => {
    if (m.phase === "group" || m.placeholder) return false;
    const t = teams.find((x) => x.id === m.homeId);
    return t?.competition === "women";
  });
  if (hasRealWomenKo) return matches;
  if (matches.some((m) => m.id === WOMEN_KO_PLACEHOLDER_FINAL)) return matches;
  return [...matches, ...buildWomenFinalSkeleton()];
}

// Auto-generate next knockout round from completed round winners
function generateNextRound(allMatches, completedRound, existingMatches, comp = "men", teams = []) {
  const roundMatches = allMatches.filter((m) => {
    if (m.phase !== completedRound || m.status !== "completed") return false;
    if (m.placeholder && m.placeholderComp === comp) return false;
    return teams.find((t) => t.id === m.homeId)?.competition === comp;
  });
  const winners = roundMatches.map(getMatchWinner).filter(Boolean);
  const next = nextRoundName(completedRound);
  if (!next || winners.length < 2) return [];
  const pairs = [];
  for (let i = 0; i < winners.length - 1; i += 2) {
    pairs.push([winners[i], winners[i + 1]]);
  }

  const sortIds = (a, b) => String(a.id).localeCompare(String(b.id));
  const placeholders = existingMatches
    .filter((m) => m.phase === next && m.placeholder && m.placeholderComp === comp)
    .sort(sortIds);

  if (placeholders.length === pairs.length && pairs.length > 0) {
    return placeholders.map((ph, i) => {
      const u = {
        ...ph,
        homeId: pairs[i][0],
        awayId: pairs[i][1],
      };
      delete u.placeholder;
      delete u.placeholderComp;
      return u;
    });
  }

  const newMatches = pairs.map(([h, a]) => ({
    id: uid(),
    homeId: h,
    awayId: a,
    groupId: null,
    phase: next,
    scoreHome: null,
    scoreAway: null,
    penHome: null,
    penAway: null,
    slotIndex: null,
    fieldId: null,
    status: "scheduled",
    refTeamId: null,
    refPersonName: null,
  }));
  patchKnockoutPlacement(newMatches, teams);
  return newMatches;
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

function normRefName(n) {
  return (n || "").trim().toLowerCase();
}

// Assign referees: zelfde persoon nooit twee wedstrijden tegelijk (zelfde slot).
function assignReferees(state) {
  const persons = buildRefPersons(state.teams);
  const usePersons = persons.length > 0;

  const slotTeams = {};
  state.matches.forEach((m) => {
    if (m.slotIndex === null) return;
    if (!slotTeams[m.slotIndex]) slotTeams[m.slotIndex] = new Set();
    if (m.homeId) slotTeams[m.slotIndex].add(m.homeId);
    if (m.awayId) slotTeams[m.slotIndex].add(m.awayId);
  });

  const allTeamIds = state.teams.map((t) => t.id);
  const refCounts = {};
  if (usePersons) persons.forEach((p) => (refCounts[p.id] = 0));
  else allTeamIds.forEach((id) => (refCounts[id] = 0));

  const usedNamesBySlot = {};
  const sorted = [...state.matches]
    .filter((m) => m.slotIndex !== null)
    .sort((a, b) => a.slotIndex - b.slotIndex || String(a.id).localeCompare(String(b.id)));

  const byId = {};
  state.matches.forEach((m) => {
    byId[m.id] = { ...m };
  });

  for (const m of sorted) {
    const slot = m.slotIndex;
    const playing = slotTeams[slot] || new Set();
    if (!usedNamesBySlot[slot]) usedNamesBySlot[slot] = new Set();

    if (usePersons) {
      const available = persons.filter(
        (p) => !playing.has(p.teamId) && p.name && !usedNamesBySlot[slot].has(normRefName(p.name)),
      );
      if (available.length === 0) {
        byId[m.id] = { ...byId[m.id], refTeamId: null, refPersonName: null };
        continue;
      }
      available.sort((a, b) => (refCounts[a.id] || 0) - (refCounts[b.id] || 0));
      const chosen = available[0];
      refCounts[chosen.id] = (refCounts[chosen.id] || 0) + 1;
      usedNamesBySlot[slot].add(normRefName(chosen.name));
      byId[m.id] = { ...byId[m.id], refTeamId: chosen.teamId, refPersonName: chosen.name };
    } else {
      const free = allTeamIds.filter((id) => !playing.has(id));
      if (free.length === 0) {
        byId[m.id] = { ...byId[m.id], refTeamId: null, refPersonName: null };
        continue;
      }
      free.sort((a, b) => (refCounts[a] || 0) - (refCounts[b] || 0));
      const chosen = free[0];
      refCounts[chosen] = (refCounts[chosen] || 0) + 1;
      byId[m.id] = { ...byId[m.id], refTeamId: chosen, refPersonName: null };
    }
  }

  return state.matches.map((m) => byId[m.id] || m);
}

function buildFixedTeams() {
  const men = SEED_MEN.map((name, i) => ({
    id: `m${i}`,
    name,
    competition: "men",
    referees: ["", ""],
  }));
  const women = SEED_WOMEN.map((name, i) => ({
    id: `w${i}`,
    name,
    competition: "women",
  }));
  return [...men, ...women];
}

function clampScreenRotateSec(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return DEFAULT_SCREEN_ROTATE_SEC;
  return Math.min(SCREEN_ROTATE_SEC_MAX, Math.max(SCREEN_ROTATE_SEC_MIN, Math.round(x)));
}

function scheduleGroupStageMatches(teams, groups) {
  const menGroups = groups.filter((g) => teams.find((t) => t.id === g.teamIds[0])?.competition === "men");
  const womenGroups = groups.filter((g) => teams.find((t) => t.id === g.teamIds[0])?.competition === "women");
  const menGroupMatches = buildGroupMatches(menGroups);
  const womenGroupMatches = buildGroupMatches(womenGroups);
  const menSchedOpts = {
    matchCapAtSlot: (s) => {
      const si = Number(s);
      return si >= 0 && si < MEN_GROUP_EARLY_MATCH_CAPS.length ? MEN_GROUP_EARLY_MATCH_CAPS[si] : null;
    },
    planPenalty: "men",
  };
  const womenSchedOpts = {
    matchCapAtSlot: (s) => (WOMEN_GROUP_SLOTS.has(Number(s)) ? WOMEN_MATCHES_PER_WOMEN_SLOT : null),
    planPenalty: "women",
  };
  const menTrial = scheduleMatchesBest(menGroupMatches, 0, [], teams, 400, menSchedOpts);
  fillRemainingMenGroupMatches(menTrial, [], teams);
  const menWithSlots = menTrial.filter((m) => m.slotIndex != null);
  let womenScheduled;
  if (womenGroups.length === 1 && womenGroups[0].teamIds.length === 4) {
    const womenClones = cloneForScheduling(womenGroupMatches);
    if (assignWomenThreeRounds(womenClones, menWithSlots, womenGroups[0])) womenScheduled = womenClones;
  }
  if (!womenScheduled) {
    womenScheduled = scheduleMatchesBest(womenGroupMatches, 0, menWithSlots, teams, 200, womenSchedOpts);
  }
  return [...menTrial, ...womenScheduled];
}

function sanitizeScreenView(sv) {
  const arr = Array.isArray(sv) ? [...sv] : [sv || "welcome"];
  const mapped = arr.flatMap((v) => {
    if (v === "all" || v === "next-matches") return ["welcome"];
    if (v === "standings") return [];
    if (
      v === "men-groups" ||
      v === "women-groups" ||
      v === "all-poules" ||
      v === "men-poules-1" ||
      v === "men-poules-2" ||
      v === "women-poules"
    ) {
      return ["poules-men-ab", "poules-men-cd-women"];
    }
    return [v];
  }).filter(Boolean);
  const u = [...new Set(mapped)];
  return u.length ? u : ["welcome"];
}

function mergeKnockoutAdvancements(currentMatches, updates) {
  if (!updates.length) return currentMatches;
  const byId = new Map(currentMatches.map((m) => [m.id, m]));
  if (updates.every((u) => byId.has(u.id))) {
    const map = new Map(updates.map((m) => [m.id, m]));
    return currentMatches.map((m) => map.get(m.id) || m);
  }
  return [...currentMatches, ...updates];
}

function createInitialState() {
  const teams = buildFixedTeams();
  const menGroups = buildGroupsStable(teams.filter((t) => t.competition === "men"), 5, "grp-m-");
  const womenGroups = buildGroupsStable(teams.filter((t) => t.competition === "women"), 4, "grp-w-");
  const groups = [...menGroups, ...womenGroups];
  const scheduled = scheduleGroupStageMatches(teams, groups);
  const koSkel = buildMenKnockoutSkeleton();
  const wFinSkel = buildWomenFinalSkeleton();
  const base = {
    teams,
    groups,
    matches: [...scheduled, ...koSkel, ...wFinSkel],
    screenView: ["welcome"],
    slotAdjustMin: {},
    screenRotateSec: DEFAULT_SCREEN_ROTATE_SEC,
    groupScheduleVersion: GROUP_SCHEDULE_VERSION,
    koPlaceholderVersion: KO_PLACEHOLDER_VERSION,
  };
  return { ...base, matches: assignReferees(base) };
}

// --- REDUCER ---
const EMPTY_INIT = {
  teams: buildFixedTeams(),
  groups: [],
  matches: [],
  screenView: ["welcome"],
  slotAdjustMin: {},
  screenRotateSec: DEFAULT_SCREEN_ROTATE_SEC,
  groupScheduleVersion: GROUP_SCHEDULE_VERSION,
  koPlaceholderVersion: 0,
};

function reducer(state, action) {
  switch (action.type) {
    case "INIT_DEFAULT_TOURNAMENT":
      return createInitialState();
    case "GEN_KNOCKOUT": {
      const comp = action.payload;
      const alreadyHasKO = state.matches.some((m) => {
        if (m.phase === "group") return false;
        if (m.placeholder && m.placeholderComp === comp) return false;
        const t = state.teams.find((x) => x.id === m.homeId);
        return t?.competition === comp;
      });
      if (alreadyHasKO) return state;
      const compGroups = state.groups.filter((g) => {
        const t = state.teams.find((x) => x.id === g.teamIds[0]);
        return t?.competition === comp;
      });
      const ko = generateKnockout(compGroups, state.matches, state.teams, comp);
      if (comp === "men") {
        const sortIds = (a, b) => String(a.id).localeCompare(String(b.id));
        const qfSkel = state.matches
          .filter((m) => m.phase === "QF" && m.placeholder && m.placeholderComp === "men")
          .sort(sortIds);
        const scheduledKo = ko.map((m) => ({ ...m }));
        patchKnockoutPlacement(scheduledKo, state.teams);
        if (qfSkel.length === scheduledKo.length && qfSkel.length > 0) {
          let qi = 0;
          const newMatches = state.matches.map((m) => {
            if (m.phase === "QF" && m.placeholder && m.placeholderComp === "men") {
              const k = scheduledKo[qi++];
              const u = {
                ...m,
                homeId: k.homeId,
                awayId: k.awayId,
              };
              delete u.placeholder;
              delete u.placeholderComp;
              return u;
            }
            return m;
          });
          const merged = { ...state, matches: newMatches };
          return { ...merged, matches: assignReferees(merged) };
        }
      }
      if (comp === "women") {
        const sortIds = (a, b) => String(a.id).localeCompare(String(b.id));
        const finSkel = state.matches
          .filter((m) => m.phase === "Final" && m.placeholder && m.placeholderComp === "women")
          .sort(sortIds);
        const scheduledKo = ko.map((m) => ({ ...m }));
        patchKnockoutPlacement(scheduledKo, state.teams);
        const allFinal = scheduledKo.length > 0 && scheduledKo.every((m) => m.phase === "Final");
        if (finSkel.length === scheduledKo.length && allFinal) {
          let qi = 0;
          const newMatches = state.matches.map((m) => {
            if (m.phase === "Final" && m.placeholder && m.placeholderComp === "women") {
              const k = scheduledKo[qi++];
              const u = { ...m, homeId: k.homeId, awayId: k.awayId };
              delete u.placeholder;
              delete u.placeholderComp;
              return u;
            }
            return m;
          });
          const merged = { ...state, matches: newMatches };
          return { ...merged, matches: assignReferees(merged) };
        }
      }
      const scheduled = ko.map((m) => ({ ...m }));
      patchKnockoutPlacement(scheduled, state.teams);
      const merged = { ...state, matches: [...state.matches, ...scheduled] };
      return { ...merged, matches: assignReferees(merged) };
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
            const nextRoundMatches = generateNextRound(newMatches, round, newMatches, matchComp, state.teams);
            newMatches = mergeKnockoutAdvancements(newMatches, nextRoundMatches);
          }
        }
      }
      return { ...state, matches: assignReferees({ ...state, matches: newMatches }) };
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
          const a = DEMO_REF_NAME_POOL[i++ % DEMO_REF_NAME_POOL.length];
          const b = DEMO_REF_NAME_POOL[i++ % DEMO_REF_NAME_POOL.length];
          return { ...t, referees: [a, b] };
        }),
      };
    }
    case "SET_SLOT_ADJUST": {
      const { slotIndex, deltaMin } = action.payload;
      const k = String(slotIndex);
      const prev = state.slotAdjustMin || {};
      const cur = Number(prev[k] ?? 0) + deltaMin;
      const next = { ...prev, [k]: cur };
      return { ...state, slotAdjustMin: next };
    }
    case "SCREEN_VIEW":
      return { ...state, screenView: sanitizeScreenView(action.payload) };
    case "TOGGLE_SCREEN_VIEW": {
      const cur = Array.isArray(state.screenView) ? state.screenView : [state.screenView];
      const vid = action.payload;
      const nv = cur.includes(vid) ? cur.filter((v) => v !== vid) : [...cur, vid];
      return { ...state, screenView: sanitizeScreenView(nv.length === 0 ? ["welcome"] : nv) };
    }
    case "SET_SCREEN_ROTATE_SEC":
      return { ...state, screenRotateSec: clampScreenRotateSec(action.payload) };
    case "LOAD": {
      const pl = action.payload;
      const teams = pl.teams?.length ? pl.teams : buildFixedTeams();
      const slotAdjustMin = pl.slotAdjustMin && typeof pl.slotAdjustMin === "object" ? { ...pl.slotAdjustMin } : {};
      let matches = pl.matches || [];
      if ((pl.groupScheduleVersion ?? 0) < GROUP_SCHEDULE_VERSION && pl.groups?.length) {
        const freshGroup = scheduleGroupStageMatches(teams, pl.groups);
        const nonGroup = matches.filter((m) => m.phase !== "group");
        matches = [...freshGroup, ...nonGroup];
      }
      if ((pl.koPlaceholderVersion ?? 0) < KO_PLACEHOLDER_VERSION) {
        matches = ensureMenKoSkeleton(matches, teams);
        matches = ensureWomenFinalSkeleton(matches, teams);
      }
      const merged = {
        ...pl,
        teams,
        matches,
        slotAdjustMin,
        groupScheduleVersion: GROUP_SCHEDULE_VERSION,
        koPlaceholderVersion: KO_PLACEHOLDER_VERSION,
        screenView: sanitizeScreenView(pl.screenView),
        screenRotateSec: clampScreenRotateSec(pl.screenRotateSec ?? DEFAULT_SCREEN_ROTATE_SEC),
      };
      return { ...merged, matches: assignReferees(merged) };
    }
    case "RESET":
      return createInitialState();
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
            const nextRoundMatches = generateNextRound(newMatches, phase, newMatches, fillComp, state.teams);
            newMatches = mergeKnockoutAdvancements(newMatches, nextRoundMatches);
          }
        }
      }
      return { ...state, matches: assignReferees({ ...state, matches: newMatches }) };
    }
    default:
      return state;
  }
}

// --- PERSISTENCE ---
function save(s) { try { localStorage.setItem("copa_mundial", JSON.stringify(s)); } catch {} }
function load() { try { const d = localStorage.getItem("copa_mundial"); return d ? JSON.parse(d) : null; } catch { return null; } }

// --- URL STATE DECODING (?d=… gedeelde links) ---
const PHASES_LIST = ["group", "R16", "QF", "SF", "Final"];
const STATUS_LIST = ["scheduled", "live", "completed"];

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
    return { teams, groups, matches, screenView: ["welcome"], slotAdjustMin: {}, screenRotateSec: DEFAULT_SCREEN_ROTATE_SEC };
  } catch { return null; }
}

function getUrlStateParam() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("d") || "";
  } catch { return ""; }
}

// ============================================================
// DESIGN SYSTEM — Kopa Events branding
// ============================================================
const C = {
  /** kopa-events.be :root --kopa-red */
  bg: "#8B1E26",
  /** Same backdrop layers as kopa-events.be body */
  bgLayers:
    "radial-gradient(ellipse at 30% 20%, rgba(180, 80, 60, 0.15) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(100, 20, 20, 0.2) 0%, transparent 50%), linear-gradient(180deg, #8B1E26 0%, #6B1820 100%)",
  /** --bg-elevated */
  card: "#7A1A22",
  /** --kopa-red-dark */
  input: "#6B1820",
  border: "rgba(255,255,255,0.10)",  // Subtle white border
  border2: "rgba(255,255,255,0.20)", // More visible white border
  accent: "#e11a2b",      // Kopa-events.be primary red (CTA / links)
  accentLight: "#ff3b4a",
  accentBg: "rgba(225,26,43,0.15)",
  gold: "#e8c465",        // Kopa yellow — scores, highlights
  goldLight: "#f0d080",
  goldBg: "rgba(232,196,101,0.18)",
  red: "#e11a2b",
  darkRed: "#6B1820",     // --kopa-red-dark
  redBg: "rgba(225,26,43,0.15)",
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
/** Displaykoppen: iets lichter + meer letterspatiëring voor leesbaarheid */
const HEAD = { letterSpacing: "0.045em", fontWeight: 600 };

const SHELL_BG: CSSProperties = {
  backgroundColor: C.bg,
  backgroundImage: C.bgLayers,
  backgroundRepeat: "no-repeat",
  backgroundSize: "100% 100%",
};

const GLOBAL_CSS = `
@font-face{font-family:'Cubano';src:url('/fonts/Cubano.ttf') format('truetype');font-weight:400;font-style:normal;font-display:swap}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background-color:${C.bg};background-image:${C.bgLayers};background-repeat:no-repeat;background-size:100% 100%;color:${C.text};font-family:${FONT_BODY};-webkit-font-smoothing:antialiased}
input,button,select,textarea{font-family:inherit}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.border2};border-radius:3px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
::selection{background:${C.gold};color:#000}
`;

// Big screen (ultrabreed ±384×192 cm, beeld 2:1): vult viewport, sponsorlogos schalen mee met vh
const BIG_SCREEN_CSS = `
.bs-root{box-sizing:border-box;width:100dvw;max-width:100dvw;height:100dvh;max-height:100dvh;overflow:hidden;display:flex;flex-direction:column;background-color:${C.bg};background-image:${C.bgLayers};background-repeat:no-repeat;background-size:100% 100%;font-family:${FONT_BODY}}
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
    <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: fs, color: C.white, letterSpacing: "0.08em", lineHeight: 1.05, margin: 0, textTransform: "uppercase" }}>
      Copa <span style={{ color: C.gold }}>Mundial</span>
    </h1>
  );
}

function Badge({ children, color = C.accent }) {
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600,
      letterSpacing: "0.1em", textTransform: "uppercase", color, background: `${color}14`, border: `1px solid ${color}22`,
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

function Input({ value, onChange, onBlur, onKeyDown, placeholder, type = "text", min, max, style: sx }) {
  return <input type={type} value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} onKeyDown={onKeyDown} placeholder={placeholder}
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
          <h2 style={{ margin: 0, fontSize: 20, color: C.white, fontFamily: FONT_DISPLAY, ...HEAD }}>{title}</h2>
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

function MatchCard({ match, teams, compact, onScore, showField = true, refereeDisplayMode = "admin" }) {
  const home = teams.find((t) => t.id === match.homeId);
  const away = teams.find((t) => t.id === match.awayId);
  const field = FIELDS.find((f) => f.id === match.fieldId);
  const ref = match.refTeamId ? teams.find((t) => t.id === match.refTeamId) : null;
  const refLabel =
    !ref
      ? null
      : refereeDisplayMode === "player"
        ? ref.name
        : match.refPersonName
          ? `${match.refPersonName} (${ref.name})`
          : ref.name;
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
      {refLabel != null && <div style={{ fontSize: 10, color: C.text3, marginTop: 4, fontWeight: 600 }}>👔 Sch: {refLabel}</div>}
      {onScore && !match.placeholder && <ScoreEditor match={match} onScore={onScore} />}
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
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 13, color: C.gold, ...HEAD }}>{group.name}</span>
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
                <td style={{ padding: cp, textAlign: "center", color: C.gold, fontWeight: 700, fontSize: compact ? 12 : 14 }}>{r.pts}</td>
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

function ScreenRotateControl({ sec, dispatch }) {
  const [draft, setDraft] = useState(String(sec));
  useEffect(() => setDraft(String(sec)), [sec]);
  const commit = () => {
    const n = parseInt(draft, 10);
    dispatch({ type: "SET_SCREEN_ROTATE_SEC", payload: Number.isNaN(n) ? DEFAULT_SCREEN_ROTATE_SEC : n });
  };
  return (
    <Input
      value={draft}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      type="number"
      min={SCREEN_ROTATE_SEC_MIN}
      max={SCREEN_ROTATE_SEC_MAX}
      style={{ width: 72, padding: "8px 10px" }}
    />
  );
}

// ============================================================
// VIEW 1: ADMIN
// ============================================================
function AdminView({ state, dispatch }) {
  const [tab, setTab] = useState("teams");
  const [comp, setComp] = useState("men");
  const isW = comp === "women";

  const teams = state.teams.filter((t) => t.competition === comp);
  const groups = state.groups.filter((g) => { const t = state.teams.find((x) => x.id === g.teamIds[0]); return t?.competition === comp; });
  const matches = state.matches.filter((m) => {
    if (m.placeholder && m.placeholderComp === comp) return true;
    const t = state.teams.find((x) => x.id === m.homeId);
    return t?.competition === comp;
  });
  const hasKO = matches.some((m) => m.phase !== "group");
  const hasRealKO = matches.some((m) => m.phase !== "group" && !m.placeholder);
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
        <Section
          title="Teams"
          sub={`Vaste deelnemers (${comp === "men" ? "20 mannenteams (4×5 — poule van 5: 4 groepswedstrijden)" : "4 vrouwenteams (1×4 — poule van 4: 3 groepswedstrijden)"}) · 30 min per wedstrijd · in voorrondes minstens één ronde rust tussen twee matchen per team · ontbrekend team = verlies · groepen en schema zijn vooraf vastgelegd`}
        >
          {isLocked && (
            <div style={{ padding: "8px 14px", borderRadius: 8, background: C.accentBg, border: `1px solid ${C.accent}22`, color: C.accent, fontSize: 11, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              Groepen en speelschema zijn ingesteld
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {!isW && groups.length > 0 && <Btn v="secondary" disabled={hasRealKO} onClick={() => dispatch({ type: "GEN_KNOCKOUT", payload: comp })}>🏆 Genereer Knockout</Btn>}
            {isW && groups.length > 0 && !hasRealKO && allGroupsDone && <Btn v="secondary" onClick={() => dispatch({ type: "GEN_KNOCKOUT", payload: "women" })}>🏆 Genereer Vrouwen Finale</Btn>}
            {groups.length > 0 && (() => { const hasRefs = state.matches.some((m) => m.refTeamId); return <Btn v={hasRefs ? "ghost" : "secondary"} onClick={() => dispatch({ type: "ASSIGN_REFS" })}>{hasRefs ? "👔 Scheidsrechters Toegewezen ✓" : "👔 Wijs Scheidsrechters Toe"}</Btn>; })()}
            {groupMatchesPending && <Btn v="ghost" sz="sm" onClick={() => dispatch({ type: "FILL_SCORES", payload: { phase: "group", comp } })} style={{ color: C.orange }}>🎲 Vul Groepsscores in (Demo)</Btn>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 6 }}>
            {teams.map((t) => (
              <Card key={t.id} style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{t.name}</span>
              </Card>
            ))}
          </div>
          {comp === "men" && teams.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                <h3 style={{ fontSize: 14, ...HEAD, color: C.gold, margin: 0, fontFamily: FONT_DISPLAY }}>👔 Scheidsrechters per team</h3>
                <Btn sz="sm" v="secondary" onClick={() => dispatch({ type: "SEED_DEMO_REF_NAMES" })}>Demo: vul scheidsnamen</Btn>
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
        <Section title={`Schema · ${comp === "men" ? "Mannen" : "Vrouwen"}`}>
          {(() => {
            const allM = state.matches.filter((m) => {
              if (m.placeholder && m.placeholderComp === comp) return true;
              const tm = state.teams.find((t) => t.id === m.homeId);
              return tm?.competition === comp;
            });
            /** Vrouwen: groepsfase altijd op slot 4/6/8 (rondes 5/7/9) — toon die rondes ook zonder matchen. */
            let slotIndices;
            if (comp === "women") {
              const fromMatches = allM.map((m) => m.slotIndex).filter((s) => s != null && s >= 0);
              slotIndices = [...new Set([...fromMatches, ...[...WOMEN_GROUP_SLOTS], SLOT_WOMEN_FINAL])].sort((a, b) => a - b);
            } else {
              const maxS = allM.length > 0 ? Math.max(...allM.map((m) => m.slotIndex ?? 0)) : -1;
              slotIndices = maxS >= 0 ? Array.from({ length: maxS + 1 }, (_, i) => i) : [];
            }
            return (
              <>
       {slotIndices.map((si) => {
            const sm = allM.filter((m) => m.slotIndex === si);
            if (comp === "men" && sm.length === 0) return null;
            const adj = Number(state.slotAdjustMin?.[String(si)] ?? state.slotAdjustMin?.[si] ?? 0);
            return (
              <div key={si} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <Badge>{scheduleRoundBadgeText(si, comp)}</Badge>
                  <span style={{ fontSize: 13, color: C.text2, fontWeight: 600 }}>{slotToTime(si)}</span>
                  <span style={{ fontSize: 10, color: C.text3 }}>{sm.length} wedstrijd{sm.length > 1 ? "en" : ""}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                    <span style={{ fontSize: 10, color: C.text3 }}>Tijd ronde:</span>
                    <Btn sz="sm" v="secondary" onClick={() => dispatch({ type: "SET_SLOT_ADJUST", payload: { slotIndex: si, deltaMin: -5 } })}>−5</Btn>
                    <Btn sz="sm" v="secondary" onClick={() => dispatch({ type: "SET_SLOT_ADJUST", payload: { slotIndex: si, deltaMin: 5 } })}>+5</Btn>
                    <Btn sz="sm" v="secondary" onClick={() => dispatch({ type: "SET_SLOT_ADJUST", payload: { slotIndex: si, deltaMin: -15 } })}>−15</Btn>
                    <Btn sz="sm" v="secondary" onClick={() => dispatch({ type: "SET_SLOT_ADJUST", payload: { slotIndex: si, deltaMin: 15 } })}>+15</Btn>
                    {adj !== 0 && (
                      <Btn sz="sm" v="ghost" onClick={() => dispatch({ type: "SET_SLOT_ADJUST", payload: { slotIndex: si, deltaMin: -adj } })}>Reset</Btn>
                    )}
                    {adj !== 0 && <span style={{ fontSize: 10, color: C.orange, fontWeight: 600 }}>{adj > 0 ? "+" : ""}{adj} min</span>}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 6 }}>
                  {sm.length === 0 ? (
                    <div style={{ padding: 16, textAlign: "center", color: C.text3, fontSize: 12, border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                      Geen wedstrijden gepland in deze ronde (vrouwen: per ronde 5/7/9 normaal 2 duels, alle teams).
                    </div>
                  ) : (
                    sm.map((m) => <MatchCard key={m.id} match={m} teams={state.teams} compact onScore={(payload) => dispatch({ type: "SCORE", payload })} />)
                  )}
                </div>
              </div>
            );
          })}
              </>
            );
          })()}
          {state.matches.length === 0 && <div style={{ textAlign: "center", padding: 36, color: C.text3 }}>Wedstrijden laden…</div>}
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
          {!isW && <Btn onClick={() => dispatch({ type: "GEN_KNOCKOUT", payload: comp })} disabled={hasRealKO} style={{ marginBottom: 14 }}>🏆 Genereer vanuit Stand</Btn>}
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
                  <h3 style={{ margin: "0 0 14px", fontSize: 13, color: C.text3, textTransform: "uppercase", fontFamily: FONT_DISPLAY, ...HEAD, letterSpacing: "0.1em" }}>Scores Invoeren</h3>
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
        const selectedViews = Array.isArray(state.screenView) ? state.screenView : [state.screenView || "welcome"];
        const rotSec = clampScreenRotateSec(state.screenRotateSec ?? DEFAULT_SCREEN_ROTATE_SEC);
        return (
        <Section title="Groot Scherm Beheer" sub="Selecteer één of meerdere weergaven — rotatie alleen actief als er meer dan één weergave gekozen is">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 6 }}>
            {[{ id: "welcome", label: "Welkom" }, { id: "poules-men-ab", label: "Poules Mannen A–B" }, { id: "poules-men-cd-women", label: "Poules M C–D + Vrouwen" }, { id: "current-next-rounds", label: "Nu + volgende ronde" }, { id: "men-knockout", label: "Mannen Knockout" }, { id: "finals", label: "Finales" }].map((v) => {
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
          <Card style={{ marginTop: 14, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Wissel elke</span>
              <ScreenRotateControl sec={rotSec} dispatch={dispatch} />
              <span style={{ fontSize: 12, color: C.text2 }}>seconden (min {SCREEN_ROTATE_SEC_MIN}, max {SCREEN_ROTATE_SEC_MAX})</span>
            </div>
            {selectedViews.length > 1 && (
              <div style={{ marginTop: 10, padding: "6px 12px", borderRadius: 8, background: C.goldBg, fontSize: 11, color: C.gold, fontWeight: 600 }}>
                ⏱ {selectedViews.length} weergaven — wisselt elke {rotSec}s op het groot scherm
              </div>
            )}
          </Card>
          <Card style={{ marginTop: 14, textAlign: "center" }}>
            <p style={{ color: C.text2, fontSize: 12 }}>Open <strong style={{ color: C.accent }}>#screen</strong> in een ander tabblad of op een apart apparaat voor de weergave. Ronde-tijden stel je in bij <strong style={{ color: C.gold }}>Schema</strong> (Mannen/Vrouwen hierboven).</p>
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
          <p style={{ color: C.gold, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 3 }}>We play for more</p>
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
      <h1 style={{ fontSize: 22, color: C.white, fontFamily: FONT_DISPLAY, margin: "0 0 2px", ...HEAD }}>{team?.name}</h1>
      {teamGroup && <p style={{ margin: "0 0 14px", color: C.gold, fontSize: 12, fontWeight: 700 }}>{teamGroup.name}</p>}
      {notifications.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>{notifications.map((n, i) => <Notification key={i} msg={n.msg} type={n.type} />)}</div>}
      <Section title="Wedstrijden" sub={`${teamMatches.length} gepland`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {teamMatches.map((m) => (
            <div key={m.id}>
              <div style={{ fontSize: 10, color: C.text3, marginBottom: 2, fontWeight: 600 }}>🕐 {slotToTime(m.slotIndex ?? 0)} · {scheduleRoundBadgeText(m.slotIndex ?? 0, matchScheduleComp(m, state.teams))}</div>
              <MatchCard match={m} teams={state.teams} compact refereeDisplayMode="player" />
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
    <div style={{ ...SHELL_BG, height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 48px", fontFamily: FONT_BODY }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ maxWidth: 1400, width: "100%", textAlign: "center" }}>
        <div style={{ animation: "slideUp .6s ease", marginBottom: 20 }}>
          <Logo size="xl" />
          <div style={{ marginTop: 10, marginBottom: 6 }}><EventTitle size="xl" /></div>
          <p style={{ color: C.text2, fontSize: 28, margin: "4px 0" }}>6 april 2026 · Gent</p>
          <p style={{ color: C.gold, fontSize: 18, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 24 }}>We play for more</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20, animation: "slideUp .6s ease .2s both" }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, textAlign: "left" }}>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 42, color: C.gold, marginBottom: 22, ...HEAD }}>⏱ Wedstrijdformat</h2>
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
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 42, color: C.gold, marginBottom: 22, ...HEAD }}>🏆 Toernooiformat</h2>
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
                <p style={{ color: C.text, fontSize: 26, margin: "0 0 10px" }}>Groepsfase — poule van 5: 4 wedstrijden · poule van 4: 3 wedstrijden</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["Kwartfinales", "Halve finales", "Finale"].map((r) => (
                    <span key={r} style={{ fontSize: 22, color: C.gold, background: C.goldBg, padding: "6px 16px", borderRadius: 8, fontWeight: 700 }}>{r}</span>
                  ))}
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                <p style={{ color: C.live, fontSize: 36, margin: "0 0 6px", fontFamily: FONT_DISPLAY, ...HEAD }}>⚡ Eerste aftrap om 11:00</p>
                <p style={{ color: C.text2, fontSize: 24, margin: 0 }}>Eerste vier rondes: 6 velden · daarna tot 8 gelijktijdige wedstrijden</p>
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

// ============================================================
// VIEW 3: BIG SCREEN
// ============================================================
function ScreenView({ state }) {
  const [, setTick] = useState(0);
  const [viewIndex, setViewIndex] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick((t) => t + 1), POLL_INTERVAL); return () => clearInterval(iv); }, []);

  const views = sanitizeScreenView(Array.isArray(state.screenView) ? state.screenView : [state.screenView || "welcome"]);
  const rotateMs = clampScreenRotateSec(state.screenRotateSec ?? DEFAULT_SCREEN_ROTATE_SEC) * 1000;
  useEffect(() => {
    if (views.length <= 1) return;
    const iv = setInterval(() => setViewIndex((p) => (p + 1) % views.length), rotateMs);
    return () => clearInterval(iv);
  }, [views.length, rotateMs]);

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

  const menGroupsSorted = state.groups
    .filter((g) => state.teams.find((t) => t.id === g.teamIds[0])?.competition === "men")
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const womenGroupsSorted = state.groups
    .filter((g) => state.teams.find((t) => t.id === g.teamIds[0])?.competition === "women")
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));

  // ---- Mannen poules A–B ----
  if (view === "poules-men-ab") {
    const chunk = menGroupsSorted.slice(0, 2);
    const sub = chunk.map((g) => g.name).join(" · ") || "—";
    return (
      <div style={{ ...SHELL_BG, height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT_BODY, overflow: "hidden" }}>
        <style>{GLOBAL_CSS}</style>
        <SponsorLogos />
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "16px 36px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, paddingBottom: 12, borderBottom: `2px solid ${C.orange}30`, flexShrink: 0 }}>
            <div style={{ width: 6, height: 36, background: C.orange, borderRadius: 2 }} />
            <div>
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: 50, color: C.orange, ...HEAD, display: "block" }}>Mannen Poules A–B</span>
              <span style={{ fontSize: 22, color: C.text2, fontWeight: 600 }}>{sub}</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12 }}>
            {chunk.map((g) => <StandingsTable key={g.id} group={g} matches={state.matches} teams={state.teams} compact />)}
          </div>
        </div>
      </div>
    );
  }

  // ---- Mannen poules C–D + vrouwen poules ----
  if (view === "poules-men-cd-women") {
    const menCd = menGroupsSorted.slice(2, 4);
    return (
      <div style={{ ...SHELL_BG, height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT_BODY, overflow: "hidden" }}>
        <style>{GLOBAL_CSS}</style>
        <SponsorLogos />
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "16px 36px", display: "flex", flexDirection: "column", gap: 22 }}>
          {womenGroupsSorted.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, paddingBottom: 10, borderBottom: `2px solid ${C.blue}30` }}>
                <div style={{ width: 6, height: 36, background: C.blue, borderRadius: 2 }} />
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: 50, color: C.blue, ...HEAD }}>Vrouwen Poules</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12 }}>
                {womenGroupsSorted.map((g) => <StandingsTable key={g.id} group={g} matches={state.matches} teams={state.teams} compact />)}
              </div>
            </div>
          )}
          {menCd.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, paddingBottom: 10, borderBottom: `2px solid ${C.orange}30` }}>
                <div style={{ width: 6, height: 36, background: C.orange, borderRadius: 2 }} />
                <div>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 50, color: C.orange, ...HEAD, display: "block" }}>Mannen Poules C–D</span>
                  <span style={{ fontSize: 22, color: C.text2, fontWeight: 600 }}>{menCd.map((g) => g.name).join(" · ")}</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12 }}>
                {menCd.map((g) => <StandingsTable key={g.id} group={g} matches={state.matches} teams={state.teams} compact />)}
              </div>
            </div>
          )}
          {menCd.length === 0 && womenGroupsSorted.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: C.text3, fontSize: 32 }}>Nog geen poules.</div>
          )}
        </div>
      </div>
    );
  }

  // ---- Huidige + volgende speelronde (klok) ----
  if (view === "current-next-rounds") {
    const cur = getCurrentActiveSlot();
    const nextS = cur + 1;
    const block = (slot, titleExtra) => {
      const ms = all
        .filter((m) => m.slotIndex === slot)
        .sort((a, b) => (a.fieldId || 0) - (b.fieldId || 0));
      return (
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flexShrink: 0, marginBottom: 16, paddingBottom: 14, borderBottom: `2px solid ${C.orange}33` }}>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 44, color: C.gold, ...HEAD, display: "block" }}>{titleExtra}</span>
            <span style={{ fontSize: 28, color: C.text2, fontWeight: 600 }}>{slotToTime(slot)} · {scheduleRoundBadgeTextForSlot(slot, ms, state.teams)}</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            {ms.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: C.text3, fontSize: 28, border: `1px dashed ${C.border}`, borderRadius: 12 }}>
                Geen wedstrijden in dit halfuurblok.
              </div>
            ) : (
              ms.map((m) => {
                const home = state.teams.find((t) => t.id === m.homeId);
                const away = state.teams.find((t) => t.id === m.awayId);
                const f = FIELDS.find((fi) => fi.id === m.fieldId);
                const ph = m.phase === "group" ? "Groep" : m.phase;
                return (
                  <div
                    key={m.id}
                    style={{
                      background: C.card,
                      border: `1px solid ${C.border}`,
                      borderRadius: 14,
                      padding: "18px 22px",
                      display: "grid",
                      gridTemplateColumns: "1fr auto 1fr",
                      gap: 16,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 32, fontWeight: 700, color: C.white, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {home?.name || "—"}
                    </span>
                    <div style={{ textAlign: "center", minWidth: 100 }}>
                      <span style={{ fontSize: 12, color: C.text3, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>{ph}{f ? ` · ${f.sponsor}` : ""}</span>
                      {m.scoreHome != null ? (
                        <span style={{ fontSize: 40, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: C.white }}>{m.scoreHome}–{m.scoreAway}</span>
                      ) : (
                        <span style={{ fontSize: 26, color: C.text3, fontWeight: 700 }}>vs</span>
                      )}
                    </div>
                    <span style={{ fontSize: 32, fontWeight: 700, color: C.white, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {away?.name || "—"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    };
    return (
      <div style={{ ...SHELL_BG, height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT_BODY, overflow: "hidden" }}>
        <style>{GLOBAL_CSS}</style>
        <SponsorLogos />
        <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 28, padding: "20px 40px" }}>
          {block(cur, "Nu aan de beurt")}
          <div style={{ width: 3, flexShrink: 0, background: `${C.border2}`, borderRadius: 2, alignSelf: "stretch" }} />
          {block(nextS, "Daarna")}
        </div>
      </div>
    );
  }

  // ---- "MEN-KNOCKOUT" view ----
  if (view === "men-knockout") {
    const koMatches = all.filter((m) => m.phase !== "group" && isMenKoMatch(m, state.teams));
    return (
      <div style={{ ...SHELL_BG, height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT_BODY, overflow: "hidden" }}>
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
    const menFinal = all.find((m) => m.phase === "Final" && isMenKoMatch(m, state.teams));
    const womenFinal = all.find((m) => m.phase === "Final" && isWomenKoMatch(m, state.teams));
    const finalMatches = [womenFinal, menFinal].filter(Boolean);
    return (
      <div style={{ ...SHELL_BG, height: "100vh", display: "flex", flexDirection: "column", fontFamily: FONT_BODY, overflow: "hidden" }}>
        <style>{GLOBAL_CSS}</style>
        <SponsorLogos />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 36px" }}>
          {finalMatches.length === 0 ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 96, marginBottom: 20 }}>🏆</div>
              <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 96, color: C.white, marginBottom: 16, ...HEAD }}>Finales</h2>
              <p style={{ color: C.text3, fontSize: 48 }}>Finales nog niet bepaald.</p>
            </div>
          ) : (
            <>
              <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 72, color: C.gold, margin: "0 0 32px", ...HEAD }}>🏆 Finales</h2>
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
                          <div style={{ fontSize: 72, color: winner === m.homeId ? C.gold : C.white, fontFamily: FONT_DISPLAY, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...HEAD }}>{home?.name || "TBD"}</div>
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
                          <div style={{ fontSize: 72, color: winner === m.awayId ? C.gold : C.white, fontFamily: FONT_DISPLAY, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...HEAD }}>{away?.name || "TBD"}</div>
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
  return <div style={{ ...SHELL_BG, color: C.text, padding: 40 }}>Onbekende weergave</div>;
}

// ============================================================
// LOGIN
// ============================================================
function LoginScreen({ onLogin }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", ...SHELL_BG, padding: 20 }}>
      <style>{GLOBAL_CSS}</style>
      <Card style={{ maxWidth: 320, width: "100%", textAlign: "center", padding: 28 }}>
        <Logo size="md" />
        <h2 style={{ color: C.white, margin: "10px 0 3px", fontSize: 18, fontFamily: FONT_DISPLAY, ...HEAD }}>Admin Toegang</h2>
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
  const [state, dispatch] = useReducer(reducer, EMPTY_INIT);
  _slotAdjustMin = state.slotAdjustMin || {};
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
    else dispatch({ type: "INIT_DEFAULT_TOURNAMENT" });
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

  if (view === "screen") return <ScreenView state={state} />;

  if (view === "admin") {
    if (!adminAuth) return <LoginScreen onLogin={() => setAdminAuth(true)} />;
    return (
      <div style={{ ...SHELL_BG, minHeight: "100vh", fontFamily: FONT_BODY }}>
        <style>{GLOBAL_CSS}</style>
        <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Logo size="sm" /><Badge color={C.live}>Admin</Badge></div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn sz="sm" v="ghost" onClick={() => (window.location.hash = "home")}>Home</Btn>
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: 18 }}><AdminView state={state} dispatch={dispatch} /></div>
      </div>
    );
  }

  if (view === "player") return <div style={{ ...SHELL_BG, minHeight: "100vh", fontFamily: FONT_BODY }}><style>{GLOBAL_CSS}</style><PlayerView state={state} /></div>;

  // HOME
  return (
    <div style={{ ...SHELL_BG, minHeight: "100vh", fontFamily: FONT_BODY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ animation: "slideUp .6s ease" }}>
        <Logo size="xl" />
        <div style={{ marginTop: 10 }}><EventTitle size="xl" /></div>
        <p style={{ color: C.text2, fontSize: 15, marginTop: 8 }}>6 april 2026 · Gent</p>
        <p style={{ color: C.gold, fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", marginTop: 4, marginBottom: 32 }}>We play for more</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 300, animation: "slideUp .6s ease .15s both" }}>
        <Btn onClick={() => (window.location.hash = "player")} sz="lg" style={{ width: "100%", justifyContent: "center" }}>⚽ Speler / Supporter</Btn>
        <Btn onClick={() => (window.location.hash = "admin")} sz="lg" v="secondary" style={{ width: "100%", justifyContent: "center" }}>🔒 Admin</Btn>
        <Btn onClick={() => (window.location.hash = "screen")} sz="lg" v="secondary" style={{ width: "100%", justifyContent: "center" }}>🖥️ Groot Scherm</Btn>
      </div>
      <div style={{ marginTop: 28, width: "100%" }}>
        <SponsorBar />
        <Footer />
      </div>
    </div>
  );
}
