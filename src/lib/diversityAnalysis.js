import { tokenizeEquation, OPS_ALL } from './bingoMath.js';
import { HEAVY_SET } from './tileHelpers.js';

export const CORE_OPERATORS = ['+', '-', '×', '÷'];
export const WILD_TILES = new Set(['?', '+/-', '×/÷']);
export const TILE_CATEGORY_ORDER = ['light', 'heavy', 'operator', 'equal', 'wild', 'other'];

const SCORE_WEIGHTS = {
  sampleCoverage: 0.28,
  patternEvenness: 0.24,
  topPatternSafety: 0.16,
  operatorBalance: 0.20,
  repeatHealth: 0.12,
};

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toRange(value) {
  if (Array.isArray(value)) return [Number(value[0] ?? 0), Number(value[1] ?? value[0] ?? 0)];
  if (typeof value === 'number') return [value, value];
  return null;
}

function makeZeroMap(keys) {
  return Object.fromEntries(keys.map(key => [key, 0]));
}

function bump(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function sortedEntries(map) {
  return Object.entries(map).sort(([, a], [, b]) => b - a);
}

function entropyFromCounts(counts) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total <= 0) return 0;
  return counts.reduce((sum, count) => {
    if (count <= 0) return sum;
    const p = count / total;
    return sum - p * Math.log2(p);
  }, 0);
}

function tileCategory(tile) {
  if (tile === '=') return 'equal';
  if (WILD_TILES.has(tile)) return 'wild';
  if (CORE_OPERATORS.includes(tile)) return 'operator';
  if (HEAVY_SET.has(tile)) return 'heavy';
  if (/^\d+$/.test(String(tile))) return 'light';
  return 'other';
}

export function equationToDiversityPattern(equation) {
  const tokens = tokenizeEquation(equation);
  if (!tokens) return '(invalid)';

  return tokens.map(token => {
    if (token === '=') return '=';
    if (OPS_ALL.includes(token)) return token;
    if (WILD_TILES.has(token)) return token;
    return 'O';
  }).join('');
}

export function operatorSignature(operatorCounts, operators = CORE_OPERATORS) {
  return operators
    .map(operator => `${operator}${operatorCounts[operator] || 0}`)
    .join(' ');
}

export function countOperatorsInPattern(pattern) {
  const counts = makeZeroMap(CORE_OPERATORS);
  for (const char of String(pattern)) {
    if (CORE_OPERATORS.includes(char)) bump(counts, char);
  }
  return counts;
}

function patternHasOnlyAllowedOperators(pattern, allowedOperators) {
  const allowed = new Set(allowedOperators);
  for (const char of String(pattern)) {
    if (CORE_OPERATORS.includes(char) && !allowed.has(char)) return false;
  }
  return true;
}

export function deriveAllowedOperatorsFromConfigs(configs = []) {
  let hasFullExplicitSpec = false;
  const explicitlyZero = new Set();
  const explicitlyAllowed = new Set();

  for (const cfg of configs) {
    const spec = cfg?.operatorSpec;
    if (!spec) continue;

    const coreKeys = CORE_OPERATORS.filter(operator => Object.prototype.hasOwnProperty.call(spec, operator));
    if (coreKeys.length === CORE_OPERATORS.length) hasFullExplicitSpec = true;

    for (const operator of coreKeys) {
      const range = toRange(spec[operator]);
      if (!range) continue;
      if (range[1] <= 0) explicitlyZero.add(operator);
      if (range[1] > 0) explicitlyAllowed.add(operator);
    }
  }

  if (hasFullExplicitSpec) {
    const allowed = CORE_OPERATORS.filter(operator => explicitlyAllowed.has(operator) && !explicitlyZero.has(operator));
    return allowed.length > 0 ? allowed : [...CORE_OPERATORS];
  }

  return CORE_OPERATORS.filter(operator => !explicitlyZero.has(operator));
}

export function selectBalancedPatternBatch(patterns = [], requestedCount = 10, options = {}) {
  const { allowedOperators = CORE_OPERATORS } = options;
  const operators = allowedOperators.length > 0 ? allowedOperators : CORE_OPERATORS;
  const normalized = patterns
    .map((item, index) => typeof item === 'string' ? { id: index, pattern: item } : { id: item.id ?? index, ...item })
    .filter(item => item.pattern && patternHasOnlyAllowedOperators(item.pattern, operators));

  const selected = [];
  const selectedIds = new Set();
  const operatorTotals = makeZeroMap(CORE_OPERATORS);
  const signatureCounts = {};

  while (selected.length < requestedCount && selectedIds.size < normalized.length) {
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of normalized) {
      if (selectedIds.has(candidate.id)) continue;

      const candidateCounts = countOperatorsInPattern(candidate.pattern);
      const nextTotals = { ...operatorTotals };
      for (const operator of operators) nextTotals[operator] += candidateCounts[operator] || 0;

      const balance = summarizeOperatorBalance(nextTotals, operators);
      const signature = operatorSignature(candidateCounts, operators);
      const signaturePenalty = (signatureCounts[signature] || 0) * 0.04;
      const duplicatePenalty = selected.some(item => item.pattern === candidate.pattern) ? 0.25 : 0;
      const score = (1 - balance.score) + signaturePenalty + duplicatePenalty;

      if (score < bestScore) {
        best = { ...candidate, operatorCounts: candidateCounts, operatorSignature: signature };
        bestScore = score;
      }
    }

    if (!best) break;
    selected.push(best);
    selectedIds.add(best.id);
    for (const operator of CORE_OPERATORS) operatorTotals[operator] += best.operatorCounts[operator] || 0;
    bump(signatureCounts, best.operatorSignature);
  }

  return {
    selected,
    operatorTotals,
    operatorBalance: summarizeOperatorBalance(operatorTotals, operators),
    availableCount: normalized.length,
    requestedCount,
    allowedOperators: operators,
  };
}

export function summarizeOperatorBalance(operatorTotals, allowedOperators = CORE_OPERATORS) {
  const operators = allowedOperators.length > 0 ? allowedOperators : CORE_OPERATORS;
  const counts = operators.map(operator => operatorTotals[operator] || 0);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const expectedShare = operators.length > 0 ? 1 / operators.length : 0;

  if (total <= 0 || operators.length <= 1) {
    return {
      operators,
      counts: Object.fromEntries(operators.map(operator => [operator, operatorTotals[operator] || 0])),
      total,
      expected: 0,
      spread: 0,
      spreadPct: 0,
      maxDeviationPct: 0,
      meanDeviationPct: 0,
      score: total > 0 ? 1 : 0,
    };
  }

  const shares = counts.map(count => count / total);
  const spreadPct = Math.max(...shares) - Math.min(...shares);
  const deviations = shares.map(share => Math.abs(share - expectedShare));
  const maxDeviationPct = Math.max(...deviations);
  const meanDeviationPct = deviations.reduce((sum, value) => sum + value, 0) / deviations.length;

  return {
    operators,
    counts: Object.fromEntries(operators.map(operator => [operator, operatorTotals[operator] || 0])),
    total,
    expected: total / operators.length,
    spread: Math.max(...counts) - Math.min(...counts),
    spreadPct,
    maxDeviationPct,
    meanDeviationPct,
    score: clamp01(1 - (spreadPct / expectedShare)),
  };
}

function summarizeRepeatRisk(repeatRecords, successCount, totalNumberTokens) {
  const duplicatePuzzles = repeatRecords.filter(record => record.maxRepeat >= 2).length;
  const excessivePuzzles = repeatRecords.filter(record => record.maxRepeat >= 3).length;
  const severePuzzles = repeatRecords.filter(record => record.maxRepeat >= 4).length;
  const repeatPressure = repeatRecords.reduce((sum, record) => sum + record.extraCopies, 0);
  const excessiveRate = successCount > 0 ? excessivePuzzles / successCount : 0;
  const severeRate = successCount > 0 ? severePuzzles / successCount : 0;
  const pressureRate = totalNumberTokens > 0 ? repeatPressure / totalNumberTokens : 0;

  return {
    duplicatePuzzles,
    excessivePuzzles,
    severePuzzles,
    duplicateRate: successCount > 0 ? duplicatePuzzles / successCount : 0,
    excessiveRate,
    severeRate,
    repeatPressure,
    pressureRate,
    score: clamp01(1 - (excessiveRate * 2.1 + severeRate * 2.8 + pressureRate * 0.9)),
  };
}

export function analyzeGeneratedPuzzles(results = [], options = {}) {
  const {
    allowedOperators = CORE_OPERATORS,
    requestedCount = results.length,
    possiblePatternCount = null,
    failureCount = 0,
    elapsedMs = 0,
  } = options;

  const patternMap = {};
  const eqCountMap = {};
  const opCountMap = {};
  const operatorTotals = makeZeroMap(CORE_OPERATORS);
  const operatorMixMap = {};
  const tileCategoryMap = makeZeroMap(TILE_CATEGORY_ORDER);
  const numberValueMap = {};
  const repeatedNumberMap = {};
  const repeatRecords = [];
  const examplesByPattern = {};
  const warningExamples = [];

  let success = 0;
  let invalid = 0;
  let heavyPuzzles = 0;
  let wildPuzzles = 0;
  let totalNumberTokens = 0;
  let totalTileTokens = 0;

  for (const result of results) {
    if (!result?.equation) {
      invalid++;
      continue;
    }

    success++;
    const equation = result.equation;
    const tokens = tokenizeEquation(equation) || [];
    const pattern = equationToDiversityPattern(equation);
    const eqCount = Number.isFinite(result.eqCount)
      ? result.eqCount
      : tokens.filter(token => token === '=').length;

    bump(patternMap, pattern);
    bump(eqCountMap, String(eqCount));
    if (!examplesByPattern[pattern]) examplesByPattern[pattern] = equation;

    const opCounts = makeZeroMap(CORE_OPERATORS);
    const numberCounts = {};

    for (const token of tokens) {
      if (CORE_OPERATORS.includes(token)) {
        bump(operatorTotals, token);
        bump(opCounts, token);
      } else if (token !== '=') {
        bump(numberCounts, token);
        bump(numberValueMap, token);
        totalNumberTokens++;
      }
    }

    const opCount = CORE_OPERATORS.reduce((sum, operator) => sum + opCounts[operator], 0);
    bump(opCountMap, String(opCount));
    bump(operatorMixMap, operatorSignature(opCounts, allowedOperators));

    const repeatEntries = Object.entries(numberCounts).filter(([, count]) => count >= 2);
    const maxRepeat = repeatEntries.length > 0
      ? Math.max(...repeatEntries.map(([, count]) => count))
      : 1;
    const extraCopies = repeatEntries.reduce((sum, [, count]) => sum + count - 1, 0);
    repeatRecords.push({ equation, maxRepeat, extraCopies, repeated: Object.fromEntries(repeatEntries) });
    for (const [number, count] of repeatEntries) {
      bump(repeatedNumberMap, number, count - 1);
    }
    if (maxRepeat >= 3 && warningExamples.length < 8) {
      warningExamples.push({ equation, maxRepeat, repeated: Object.fromEntries(repeatEntries) });
    }

    const tiles = result.solutionTiles?.length ? result.solutionTiles : tokens;
    const tileCategoriesInPuzzle = new Set();
    for (const tile of tiles) {
      const category = tileCategory(tile);
      tileCategoriesInPuzzle.add(category);
      bump(tileCategoryMap, category);
      totalTileTokens++;
    }
    if (tileCategoriesInPuzzle.has('heavy')) heavyPuzzles++;
    if (tileCategoriesInPuzzle.has('wild')) wildPuzzles++;
  }

  const totalAttempts = success + invalid + failureCount;
  const patternEntries = sortedEntries(patternMap);
  const operatorMixEntries = sortedEntries(operatorMixMap);
  const uniquePatternCount = patternEntries.length;
  const topPatternCount = patternEntries[0]?.[1] || 0;
  const topPatternShare = success > 0 ? topPatternCount / success : 0;
  const sampleCoverage = success > 0 ? uniquePatternCount / success : 0;
  const possibleCoverage = Number.isFinite(possiblePatternCount) && possiblePatternCount > 0
    ? uniquePatternCount / possiblePatternCount
    : null;

  const patternEntropy = entropyFromCounts(patternEntries.map(([, count]) => count));
  const maxEntropy = uniquePatternCount > 1 ? Math.log2(uniquePatternCount) : 0;
  const normalizedPatternEntropy = maxEntropy > 0 ? patternEntropy / maxEntropy : (success > 0 ? 1 : 0);
  const operatorBalance = summarizeOperatorBalance(operatorTotals, allowedOperators);
  const repeatRisk = summarizeRepeatRisk(repeatRecords, success, totalNumberTokens);
  const requestedFillRate = requestedCount > 0 ? success / requestedCount : 0;

  const score = clamp01(
    sampleCoverage * SCORE_WEIGHTS.sampleCoverage
    + normalizedPatternEntropy * SCORE_WEIGHTS.patternEvenness
    + (1 - topPatternShare) * SCORE_WEIGHTS.topPatternSafety
    + operatorBalance.score * SCORE_WEIGHTS.operatorBalance
    + repeatRisk.score * SCORE_WEIGHTS.repeatHealth
  );

  return {
    success,
    failed: invalid + failureCount,
    totalAttempts,
    requestedCount,
    requestedFillRate,
    elapsedMs,
    patternMap,
    patternEntries,
    examplesByPattern,
    eqCountMap,
    opCountMap,
    operatorTotals,
    operatorBalance,
    operatorMixMap,
    operatorMixEntries,
    tileCategoryMap,
    numberValueMap,
    repeatedNumberMap,
    repeatRisk,
    warningExamples,
    heavyPuzzles,
    wildPuzzles,
    totalNumberTokens,
    totalTileTokens,
    uniquePatternCount,
    sampleCoverage,
    possiblePatternCount,
    possibleCoverage,
    topPatternCount,
    topPatternShare,
    patternEntropy,
    normalizedPatternEntropy,
    score,
  };
}

export function qualityTone(score) {
  if (score >= 0.82) return 'excellent';
  if (score >= 0.68) return 'good';
  if (score >= 0.52) return 'watch';
  return 'risk';
}

export function formatPercent(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}
