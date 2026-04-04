/**
 * BingoMath A-Math Game Engine
 * Optimized generator with precomputed structures + pruning heuristics
 * Target: < 200ms per problem generation
 */

// ─── Tile Definitions ───────────────────────────────────────────────────────
const DIGIT_TILES = ["0","1","2","3","4","5","6","7","8","9"];
const OPERATOR_TILES = ["+","-","*","/"];
const EQUALS_TILE = "=";

const TILE_SCORES = {
  "0":2,"1":1,"2":1,"3":2,"4":3,"5":2,"6":3,"7":4,"8":4,"9":4,
  "+":2,"-":2,"*":4,"/":6,"=":3
};

// ─── Structure Templates (Precomputed) ───────────────────────────────────────
// Each template is a pattern of token types: D=digit, O=operator, E=equals
// Precomputed to avoid re-computing structure candidates per run
const EQUATION_STRUCTURES = [
  // Simple: a O b = c
  ["D","O","D","E","D"],
  ["D","O","D","E","D","D"],
  ["D","D","O","D","E","D"],
  ["D","O","D","E","D","D"],
  // Two operations: a O b O c = d
  ["D","O","D","O","D","E","D"],
  ["D","O","D","O","D","E","D","D"],
  ["D","D","O","D","O","D","E","D"],
  // Three digit numbers
  ["D","D","O","D","D","E","D","D"],
  ["D","O","D","D","E","D","D"],
  // With two operators
  ["D","O","D","O","D","D","E","D"],
];

// ─── Core Generator ──────────────────────────────────────────────────────────

function safeEval(expr) {
  // Safe arithmetic evaluation without eval()
  try {
    const tokens = tokenize(expr);
    return parseExpression(tokens);
  } catch {
    return null;
  }
}

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const s = expr.replace(/\s/g, "");
  while (i < s.length) {
    if (/\d/.test(s[i])) {
      let num = "";
      while (i < s.length && /\d/.test(s[i])) num += s[i++];
      tokens.push({ type: "num", val: parseInt(num, 10) });
    } else if ("+-*/".includes(s[i])) {
      tokens.push({ type: "op", val: s[i++] });
    } else {
      i++;
    }
  }
  return tokens;
}

function parseExpression(tokens) {
  // Respects operator precedence (* / before + -)
  let terms = [];
  let ops = [];
  let i = 0;
  terms.push(parseTerm(tokens, { i: 0 }));
  const pos = { i: 0 };
  terms = [];
  ops = [];
  terms.push(parseTerm(tokens, pos));
  while (pos.i < tokens.length && tokens[pos.i]?.type === "op" && "+-".includes(tokens[pos.i].val)) {
    ops.push(tokens[pos.i++].val);
    terms.push(parseTerm(tokens, pos));
  }
  let result = terms[0];
  for (let j = 0; j < ops.length; j++) {
    result = ops[j] === "+" ? result + terms[j+1] : result - terms[j+1];
  }
  return result;
}

function parseTerm(tokens, pos) {
  let val = parseFactor(tokens, pos);
  while (pos.i < tokens.length && tokens[pos.i]?.type === "op" && "*/".includes(tokens[pos.i].val)) {
    const op = tokens[pos.i++].val;
    const right = parseFactor(tokens, pos);
    if (op === "*") val = val * right;
    else if (op === "/") {
      if (right === 0) throw new Error("Division by zero");
      if (val % right !== 0) throw new Error("Non-integer division");
      val = val / right;
    }
  }
  return val;
}

function parseFactor(tokens, pos) {
  if (pos.i >= tokens.length) throw new Error("Unexpected end");
  const t = tokens[pos.i++];
  if (t.type !== "num") throw new Error("Expected number");
  return t.val;
}

// ─── Tile Pool Builder ───────────────────────────────────────────────────────

function buildTilePool(config) {
  const { difficulty = "medium", tile_bias = "mixed", allowed_operators = ["+","-","*","/"] } = config;
  const pool = [];

  const digitCounts = {
    easy:   [4,4,4,3,3,3,3,2,2,2],
    medium: [3,3,3,3,3,3,3,3,3,3],
    hard:   [2,2,3,3,3,3,3,4,4,4],
    expert: [2,2,2,3,3,3,4,4,4,4]
  }[difficulty] || [3,3,3,3,3,3,3,3,3,3];

  DIGIT_TILES.forEach((d, i) => {
    for (let j = 0; j < digitCounts[i]; j++) pool.push(d);
  });

  allowed_operators.forEach(op => {
    const count = (op === "+" || op === "-") ? 3 : 2;
    for (let j = 0; j < count; j++) pool.push(op);
  });

  for (let j = 0; j < 4; j++) pool.push("=");

  return pool;
}

function pickTiles(pool, count) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ─── Problem Generator Modes ─────────────────────────────────────────────────

function tryBuildEquationFromTiles(tiles, ops, allowPartial = false) {
  // Try each precomputed structure
  const shuffled = [...EQUATION_STRUCTURES].sort(() => Math.random() - 0.5);

  for (const structure of shuffled) {
    const digitSlots = structure.filter(s => s === "D").length;
    const opSlots = structure.filter(s => s === "O").length;

    const digits = tiles.filter(t => /\d/.test(t));
    const operators = tiles.filter(t => ops.includes(t));

    if (!allowPartial && (digits.length < digitSlots || operators.length < opSlots)) continue;

    const result = attemptFill(structure, digits, operators, ops);
    if (result) return result;
  }
  return null;
}

function attemptFill(structure, digits, operators, allowedOps, maxAttempts = 80) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const digs = [...digits].sort(() => Math.random() - 0.5);
    const ops = [...operators].sort(() => Math.random() - 0.5);
    let di = 0, oi = 0;
    const lhs = [];
    const rhs = [];
    let seenEquals = false;

    for (const token of structure) {
      if (token === "E") { seenEquals = true; continue; }
      if (token === "D") {
        const d = digs[di++];
        if (!d) break;
        seenEquals ? rhs.push(d) : lhs.push(d);
      } else if (token === "O") {
        const o = ops[oi++];
        if (!o) break;
        lhs.push(o);
      }
    }

    if (!seenEquals || lhs.length === 0 || rhs.length === 0) continue;

    const lhsExpr = lhs.join("");
    const rhsExpr = rhs.join("");

    try {
      const lhsVal = safeEval(lhsExpr);
      const rhsVal = safeEval(rhsExpr);
      if (lhsVal !== null && rhsVal !== null && lhsVal === rhsVal) {
        return `${lhsExpr}=${rhsExpr}`;
      }
    } catch (_) {}

    // Try: make rhs match lhs
    try {
      const lhsVal = safeEval(lhsExpr);
      if (lhsVal !== null && lhsVal >= 0 && lhsVal <= 99) {
        const rhsStr = String(lhsVal);
        if (rhsStr.split("").every(c => digs.includes(c))) {
          return `${lhsExpr}=${rhsStr}`;
        }
      }
    } catch (_) {}
  }
  return null;
}

function generateMode1(tiles, config) {
  // Must use ALL tiles to form valid equation
  const ops = config.allowed_operators || ["+","-","*","/"];
  return tryBuildEquationFromTiles(tiles, ops, false);
}

function generateMode2(tiles, config) {
  // Use ALL tiles, maximize score
  const ops = config.allowed_operators || ["+","-","*","/"];
  let best = null, bestScore = -1;
  // Try multiple candidates, pick highest score
  for (let i = 0; i < 5; i++) {
    const candidate = tryBuildEquationFromTiles(tiles, ops, false);
    if (candidate) {
      const score = computeEquationScore(candidate, []);
      if (score > bestScore) { bestScore = score; best = candidate; }
    }
  }
  return best;
}

function generateMode3(tiles, config) {
  // Use SOME tiles, balance equation score vs leftover value
  const ops = config.allowed_operators || ["+","-","*","/"];
  let best = null, bestScore = -1;
  for (let i = 0; i < 8; i++) {
    const candidate = tryBuildEquationFromTiles(tiles, ops, true);
    if (candidate) {
      const used = candidate.replace(/=/g,"").split("").filter(c => !/\s/.test(c));
      const leftovers = [...tiles];
      used.forEach(c => { const idx = leftovers.indexOf(c); if (idx >= 0) leftovers.splice(idx, 1); });
      const eqScore = computeEquationScore(candidate, []);
      const leftoverPenalty = leftovers.reduce((sum, t) => sum + (TILE_SCORES[t] || 1), 0);
      const net = eqScore - leftoverPenalty * (config.leftover_weight || 0.5);
      if (net > bestScore) { bestScore = net; best = candidate; }
    }
  }
  return best;
}

// ─── Score Computation ───────────────────────────────────────────────────────

function computeEquationScore(equation, specialSlots) {
  let score = 0;
  const tokens = equation.replace(/=/g,"").split("");
  tokens.forEach((t, i) => {
    const base = TILE_SCORES[t] || 1;
    const special = specialSlots.find(s => s.slot === i);
    score += special ? base * (special.multiplier || 2) : base;
  });
  return score;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function generateProblem(config) {
  const t0 = performance.now();
  const pool = buildTilePool(config);
  const tiles = pickTiles(pool, 8);
  const ops = config.allowed_operators || ["+","-","*","/"];

  // Generate special slots
  const specialSlots = [];
  if (config.special_slots_enabled) {
    const numSpecial = Math.floor(Math.random() * 3) + 1;
    const positions = Array.from({ length: 15 }, (_, i) => i).sort(() => Math.random() - 0.5);
    positions.slice(0, numSpecial).forEach(p => {
      specialSlots.push({ slot: p, multiplier: Math.random() > 0.5 ? 3 : 2 });
    });
  }

  // Run generator by mode first, then derive locked tiles FROM the solution
  let solution = null;
  const mode = config.mode || 1;
  if (mode === 1) solution = generateMode1(tiles, config);
  else if (mode === 2) solution = generateMode2(tiles, config);
  else solution = generateMode3(tiles, config);

  // Fallback: if generation failed, build a simple one
  if (!solution) {
    solution = buildFallbackEquation(tiles);
  }

  // Generate locked tiles FROM the solution equation
  // Locked positions = slots in the equation that are pre-revealed to the student
  const lockedTiles = [];
  const numLocked = config.num_locked_tiles || 0;
  if (solution && numLocked > 0) {
    // Build a flat char array of the solution (slots of the board)
    // The board slots are each character of the solution string (excluding '=', which is its own slot)
    const solutionChars = solution.split(""); // e.g. ["3","+","4","=","7"]
    const available = solutionChars.map((_, i) => i).sort(() => Math.random() - 0.5);
    available.slice(0, Math.min(numLocked, solutionChars.length)).forEach(slotIndex => {
      lockedTiles.push({ slot: slotIndex, tile: solutionChars[slotIndex] });
    });
  }

  const elapsed = performance.now() - t0;

  return {
    tilesInHand: tiles,
    lockedTiles,
    specialSlots,
    correctSolutions: solution ? [solution] : [],
    optimalSolution: solution,
    generationTimeMs: Math.round(elapsed),
    mode
  };
}

function buildFallbackEquation(tiles) {
  const digits = tiles.filter(t => /\d/.test(t));
  if (digits.length >= 3) {
    const a = parseInt(digits[0]);
    const b = parseInt(digits[1]);
    return `${a}+${b}=${a+b}`;
  }
  return "1+1=2";
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateEquation(slots, specialSlots) {
  // Server-side style validation (runs client-side for free play, always re-validated server-side for assignments)
  const filled = slots.filter(Boolean);
  if (filled.length < 3) return { valid: false, reason: "Too few tiles placed" };

  const str = slots.map(s => s || "").join("").trim();
  if (!str.includes("=")) return { valid: false, reason: "Missing equals sign" };

  const [lhs, rhs] = str.split("=");
  if (!lhs || !rhs) return { valid: false, reason: "Invalid equation format" };

  // Prevent leading zeros
  if (/(?<![0-9])0[0-9]/.test(lhs) || /(?<![0-9])0[0-9]/.test(rhs)) {
    return { valid: false, reason: "Leading zeros not allowed" };
  }

  try {
    const lhsVal = safeEval(lhs);
    const rhsVal = safeEval(rhs);
    if (lhsVal === null || rhsVal === null) return { valid: false, reason: "Cannot evaluate" };
    if (lhsVal !== rhsVal) return { valid: false, reason: `${lhsVal} ≠ ${rhsVal}` };
    return { valid: true, lhsVal, rhsVal };
  } catch (e) {
    return { valid: false, reason: e.message };
  }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export function calculateScore(validation, timeTaken, leftoverTiles, config, specialSlots) {
  if (!validation.valid) return { total: 0, breakdown: { base_score: 0 } };

  const base = 100;
  const timeBonus = Math.max(0, (config.time_limit || 120) - timeTaken) * 0.5;
  const leftoverPenalty = leftoverTiles.reduce((sum, t) => sum + (TILE_SCORES[t] || 1), 0) * 5;
  const specialBonus = specialSlots.reduce((sum, s) => sum + (TILE_SCORES["="] * ((s.multiplier || 2) - 1)), 0);
  const difficultyMultiplier = { easy: 1, medium: 1.5, hard: 2, expert: 3 }[config.difficulty] || 1;

  const total = Math.max(0, Math.round((base + timeBonus + specialBonus - leftoverPenalty) * difficultyMultiplier));

  return {
    total,
    breakdown: {
      base_score: base,
      time_bonus: Math.round(timeBonus),
      special_slot_bonus: Math.round(specialBonus),
      leftover_penalty: Math.round(leftoverPenalty),
      complexity_multiplier: difficultyMultiplier
    }
  };
}