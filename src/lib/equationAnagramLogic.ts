// src/lib/EquationAnagramLogic.ts - Optimized with True Pool Sampling
import type { EquationAnagramOptions, EquationAnagramResult, AmathToken, AmathTokenInfo, EquationElement } from '../types/EquationAnagram';
import { Fraction, compareFractions } from './fractionUtil';
import { isHeavyNumber, getElementType } from './tokenUtil';
import { evaluateExpressionAsFraction, tokenizeExpression } from './expressionUtil';
import { AMATH_TOKENS } from './amathTokens';

export { AMATH_TOKENS };



/**
 * สร้าง pool ของ tokens ทั้งหมดตามจำนวนจริง
 */
function createTokenPool(customTokenCounts?: Record<AmathToken, number>): AmathToken[] {
  const pool: AmathToken[] = [];
  Object.entries(AMATH_TOKENS).forEach(([token, info]) => {
    const trueCount = customTokenCounts ? (customTokenCounts[token as AmathToken] ?? info.count) : info.count;
    for (let i = 0; i < trueCount; i++) {
      pool.push(token as AmathToken);
    }
  });
  return pool;
}

/**
 * Generate non-adjacent lock positions
 * @param totalLength Total length of the equation
 * @param lockCount Number of positions to lock
 * @returns Array of lock positions (0-indexed)
 */
function generateNonAdjacentLockPositions(totalLength: number, lockCount: number): number[] {
  if (lockCount === 0) return [];
  if (lockCount >= totalLength) {
    // If lock count is too high, return all positions
    return Array.from({ length: totalLength }, (_, i) => i);
  }
  
  const positions: number[] = [];
  const available = Array.from({ length: totalLength }, (_, i) => i);
  
  while (positions.length < lockCount && available.length > 0) {
    // Randomly select a position
    const randomIndex = Math.floor(Math.random() * available.length);
    const selectedPos = available[randomIndex];
    
    positions.push(selectedPos);
    
    // Remove selected position and adjacent positions from available
    const toRemove = new Set<number>([selectedPos]);
    if (selectedPos > 0) toRemove.add(selectedPos - 1);
    if (selectedPos < totalLength - 1) toRemove.add(selectedPos + 1);
    
    // Filter out removed positions
    for (let i = available.length - 1; i >= 0; i--) {
      if (toRemove.has(available[i])) {
        available.splice(i, 1);
      }
    }
  }
  
  return positions.sort((a, b) => a - b);
}

/**
 * Generate DS Equation Anagram problem based on options
 */
export async function generateEquationAnagram(options: EquationAnagramOptions, customTokenCounts?: Record<AmathToken, number>): Promise<EquationAnagramResult> {
  const validation = validateEquationAnagramOptions(options, customTokenCounts);
  if (validation) {
    throw new Error(validation);
  }

  let attempts = 0;
  const maxAttempts = 10000;

  while (attempts < maxAttempts) {
    try {
      const tokens = generateTokensBasedOnOptions(options, customTokenCounts);
      let solutionTiles: string[] | undefined;
      const equations = findValidEquations(tokens, Math.max(options.equalsCount, 1),
        (eq, tiles) => {
        // เอาเฉพาะคำตอบแรกก็พอ
        if (!solutionTiles) solutionTiles = tiles;
      });
      
      if (equations.length > 0) {
        // Reorder elements to match the solution equation order so lock positions follow solution slots
        const equationTokens = tokenizeExpression(equations[0]);
        console.log(equations)
        const elements = tokens.map(t => t.originalToken);

        const reorderElementsBySolution = () => {
          if (!equationTokens || equationTokens.length === 0) return elements;

          const used = new Array(elements.length).fill(false);
          const result: string[] = [];

          // 1) Map each equation token to the first unused matching element
          for (const tok of equationTokens) {
            let found = -1;
            for (let i = 0; i < elements.length; i++) {
              if (!used[i] && elements[i] === tok) {
                found = i;
                break;
              }
            }
            if (found !== -1) {
              used[found] = true;
              result.push(elements[found]);
            } else {
              // If no match, keep the token itself (keeps order aligned to solution)
              result.push(tok);
            }
          }

          // 2) Append any leftover unused elements to keep counts
          for (let i = 0; i < elements.length; i++) {
            if (!used[i]) result.push(elements[i]);
          }

          // 3) Ensure length matches the original elements length
          if (result.length > elements.length) {
            return result.slice(0, elements.length);
          }
          if (result.length < elements.length) {
            // Pad with remaining elements (unlikely)
            for (let i = 0; i < elements.length && result.length < elements.length; i++) {
              if (!used[i]) result.push(elements[i]);
            }
          }
          return result;
        };

        const orderedElements = reorderElementsBySolution();
        let lockPositions: number[] | undefined;
        
        // ✅ IMPORTANT: Handle lock mode - generate lock positions based on solutionTokens indices
        // DisplayBox uses solutionTokens as sourceTokens, so lock positions must reference solutionTokens indices
        if (options.lockMode && options.lockCount !== undefined && options.lockCount > 0) {
          const lockCount = options.lockCount;
          
          // ✅ Use solutionTokens length if available, otherwise use orderedElements length
          // Lock positions should reference solutionTokens indices (which DisplayBox uses)
          const targetLength = solutionTiles && solutionTiles.length > 0 
            ? solutionTiles.length 
            : orderedElements.length;
          
          lockPositions = generateNonAdjacentLockPositions(targetLength, lockCount);
          
          console.log("🔒 Generated lock positions for solutionTokens:", {
            lockCount,
            targetLength,
            solutionTokensLength: solutionTiles?.length,
            elementsLength: orderedElements.length,
            lockPositions
          });
        }
        console.log(solutionTiles)
        return {
          elements: orderedElements,
          sampleEquation: equations[0],
          possibleEquations: equations.slice(0, 10),
          lockPositions, // ✅ These are indices in solutionTokens array (or elements if no solutionTokens)
          solutionTokens: solutionTiles,
        };
      }
    } catch (error) {
      console.warn(`Attempt ${attempts + 1} failed:`, error);
    }
    attempts++;
  }

  throw new Error('Could not generate a valid problem. Please adjust your options or reduce the number of tiles/operators.');
}

/**
 * Generate tokens based on selected options - Random individual counts only
 */
function generateTokensBasedOnOptions(options: EquationAnagramOptions, customTokenCounts?: Record<AmathToken, number>): EquationElement[] {
  // Randomize counts only when BOTH randomSettings.field is true AND corresponding *Mode is 'random'.
  // Otherwise, respect provided counts strictly.
  const processedOptions = { ...options };

  const randomSettings = options.randomSettings;
  // Operators respect explicit operatorMode. Other categories rely solely on randomSettings toggles
  const allowRandomOperators = !!(randomSettings && randomSettings.operators && options.operatorMode === 'random');
  const allowRandomEquals = !!(randomSettings && randomSettings.equals);
  const allowRandomHeavy = !!(randomSettings && randomSettings.heavy);
  const allowRandomBlank = !!(randomSettings && randomSettings.blank);
  const allowRandomZero = !!(randomSettings && randomSettings.zero);

  if (allowRandomOperators || allowRandomEquals || allowRandomHeavy || allowRandomBlank || allowRandomZero) {
    const totalCount = options.totalCount;

    // Prepare pool counts from AMATH_TOKENS (true pool sampling)
    const AMATH_COUNTS = customTokenCounts
      ? Object.assign({}, ...Object.keys(AMATH_TOKENS).map(k => ({[k]: customTokenCounts[k as AmathToken] ?? AMATH_TOKENS[k as AmathToken].count})))
      : Object.fromEntries(Object.entries(AMATH_TOKENS).map(([k,v]) => [k, v.count]));

    const OP_TOKENS: ReadonlyArray<string> = ['+','-','×','÷','+/-','×/÷'];
    const LIGHT_TOKENS: ReadonlyArray<string> = ['1','2','3','4','5','6','7','8','9'];
    const HEAVY_TOKENS: ReadonlyArray<string> = ['10','11','12','13','14','15','16','17','18','19','20'];

    const removeFromCategory = (tokenList: ReadonlyArray<string>, count: number) => {
      let remaining = Math.max(0, count);
      while (remaining > 0) {
        const candidates = tokenList.filter(t => (AMATH_COUNTS[t as AmathToken] || 0) > 0);
        if (candidates.length === 0) break;
        const weights = candidates.map(t => AMATH_COUNTS[t as AmathToken]);
        // weighted pick
        let sum = 0;
        for (const w of weights) sum += w;
        let r = Math.random() * sum;
        let picked = candidates[0];
        for (let i = 0; i < candidates.length; i++) {
          r -= weights[i];
          if (r <= 0) { picked = candidates[i]; break; }
        }
        AMATH_COUNTS[picked as AmathToken] = (AMATH_COUNTS[picked as AmathToken] || 0) - 1;
        remaining--;
      }
    };

    // Account for fixed parts by removing them from the pool first
    const fixedOperators = allowRandomOperators ? 0 : options.operatorCount;
    const fixedEquals = allowRandomEquals ? 0 : options.equalsCount;
    const fixedHeavy = allowRandomHeavy ? 0 : options.heavyNumberCount;
    const fixedBlank = allowRandomBlank ? 0 : options.BlankCount;
    const fixedZero = allowRandomZero ? 0 : options.zeroCount;

    if (fixedOperators > 0) removeFromCategory(OP_TOKENS, fixedOperators);
    if (fixedEquals > 0) removeFromCategory(['='], fixedEquals);
    if (fixedHeavy > 0) removeFromCategory(HEAVY_TOKENS, fixedHeavy);
    if (fixedBlank > 0) removeFromCategory(['?'], fixedBlank);
    if (fixedZero > 0) removeFromCategory(['0'], fixedZero);

    let remainingTiles = totalCount - (fixedOperators + fixedEquals + fixedHeavy + fixedBlank + fixedZero);
    remainingTiles = Math.max(0, remainingTiles);

    // Reserve at least 1 '=' when equals are randomized and available
    let sampledEquals = 0;
    if (allowRandomEquals && (AMATH_COUNTS['='] || 0) > 0 && remainingTiles > 0) {
      AMATH_COUNTS['='] = (AMATH_COUNTS['='] || 0) - 1;
      sampledEquals += 1;
      remainingTiles -= 1;
    }

    let sampledOperators = 0;
    let sampledHeavy = 0;
    let sampledBlank = 0;
    let sampledZero = 0;

    // Draw remaining tiles from the pool honoring toggles
    for (let i = 0; i < remainingTiles; i++) {
      const candidates: string[] = [];
      const pushAvailable = (token: string) => { if ((AMATH_COUNTS[token as AmathToken] || 0) > 0) candidates.push(token); };
      const pushList = (list: ReadonlyArray<string>) => { for (const t of list) pushAvailable(t); };

      // Include categories under random toggles
      if (allowRandomOperators) pushList(OP_TOKENS);
      if (allowRandomEquals) pushAvailable('=');
      if (allowRandomHeavy) pushList(HEAVY_TOKENS);
      if (allowRandomBlank) pushAvailable('?');
      if (allowRandomZero) pushAvailable('0');
      // Always allow light numbers to fill
      pushList(LIGHT_TOKENS);

      if (candidates.length === 0) break;

      const weights = candidates.map(t => AMATH_COUNTS[t as AmathToken]);
      // weighted pick one token from candidates
      let sum = 0; for (const w of weights) sum += w;
      let r = Math.random() * sum;
      let picked = candidates[0];
      for (let j = 0; j < candidates.length; j++) {
        r -= weights[j];
        if (r <= 0) { picked = candidates[j]; break; }
      }

      AMATH_COUNTS[picked as AmathToken] = (AMATH_COUNTS[picked as AmathToken] || 0) - 1;

      if (OP_TOKENS.includes(picked)) sampledOperators += 1;
      else if (picked === '=') sampledEquals += 1;
      else if (HEAVY_TOKENS.includes(picked)) sampledHeavy += 1;
      else if (picked === '?') sampledBlank += 1;
      else if (picked === '0') sampledZero += 1;
    }

    // Apply sampled counts back to options for randomized fields
    if (allowRandomOperators) {
      // Ensure at least 1 operator to form expressions
      processedOptions.operatorCount = Math.max(1, sampledOperators);
    }
    if (allowRandomEquals) {
      // Keep at least 1 '=' to ensure valid equation
      processedOptions.equalsCount = Math.max(1, sampledEquals);
    }
    if (allowRandomHeavy) {
      processedOptions.heavyNumberCount = Math.max(0, sampledHeavy);
    }
    if (allowRandomBlank) {
      processedOptions.BlankCount = Math.max(0, sampledBlank);
    }
    if (allowRandomZero) {
      processedOptions.zeroCount = Math.max(0, sampledZero);
    }
  }

  // Deterministic generation with processed options
  return generateTokensDeterministic(processedOptions, customTokenCounts);
}



/**
 * Generate tokens แบบเดิม (deterministic) สำหรับกรณีที่ไม่ได้ใช้ random
 */
function generateTokensDeterministic(options: EquationAnagramOptions, customTokenCounts?: Record<AmathToken, number>): EquationElement[] {
  const { totalCount, operatorCount, equalsCount, heavyNumberCount, BlankCount, zeroCount, operatorMode, specificOperators, operatorFixed } = options;
  
  const lightNumberCount = totalCount - operatorCount - equalsCount - heavyNumberCount - BlankCount - zeroCount;
  
  if (lightNumberCount < 0) {
    throw new Error('Not enough light numbers. Please adjust your options.');
  }
  
  const availablePool = createTokenPool(customTokenCounts);
  const selectedTokens: EquationElement[] = [];
  
  // Pick equals tokens with weighted sampling
  for (let i = 0; i < equalsCount; i++) {
    // Weighted sampling for equals tokens
    const equalsTokens = availablePool.filter(t => t === '=');
    const blankTokens = availablePool.filter(t => t === '?');
    
    if (equalsTokens.length > 0 || blankTokens.length > 0) {
      // Calculate weights based on AMATH_TOKENS counts
      const equalsWeight = equalsTokens.length * (customTokenCounts ? customTokenCounts['='] ?? AMATH_TOKENS['='].count : AMATH_TOKENS['='].count);
      const blankWeight = blankTokens.length * (customTokenCounts ? customTokenCounts['?'] ?? AMATH_TOKENS['?'].count : AMATH_TOKENS['?'].count);
      const totalWeight = equalsWeight + blankWeight;
      
      if (totalWeight > 0) {
        const random = Math.random() * totalWeight;
        let token: AmathToken;
        
        if (random < equalsWeight && equalsTokens.length > 0) {
          // Pick equals token
          const index = Math.floor(Math.random() * equalsTokens.length);
          token = equalsTokens[index];
          availablePool.splice(availablePool.indexOf(token), 1);
        } else if (blankTokens.length > 0) {
          // Pick blank token
          const index = Math.floor(Math.random() * blankTokens.length);
          token = blankTokens[index];
          availablePool.splice(availablePool.indexOf(token), 1);
        } else {
          throw new Error('Not enough equals (=) or blank (?) tokens in pool.');
        }
        
        selectedTokens.push(createElementFromToken(token));
      } else {
        throw new Error('Not enough equals (=) or blank (?) tokens in pool.');
      }
    } else {
      throw new Error('Not enough equals (=) or blank (?) tokens in pool.');
    }
  }
  
  // Pick operator tokens based on mode
  if (operatorMode === 'specific' && operatorFixed) {
    // Flexible specific mode with individual operator random/fixed
    const operatorTypes: Array<'+' | '-' | '×' | '÷' | '+/-' | '×/÷'> = ['+', '-', '×', '÷', '+/-', '×/÷'];
    let totalFixedOperators = 0;
    const randomOperatorTypes: Array<'+' | '-' | '×' | '÷' | '+/-' | '×/÷'> = [];
    
    // ใส่ operator ที่ fixed ก่อน
    for (const type of operatorTypes) {
      const fixedValue = operatorFixed[type];
      if (typeof fixedValue === 'number') {
        // Fixed: ใช้จำนวนตรง ๆ (รวมถึง 0)
        for (let i = 0; i < fixedValue; i++) {
          const token = pickTokenFromPool('operator', availablePool, type);
          if (!token) {
            throw new Error(`Not enough ${type} tokens in pool.`);
          }
          selectedTokens.push(createElementFromToken(token));
        }
        totalFixedOperators += fixedValue;
      } else if (fixedValue === null) {
        // Random: เก็บไว้สุ่มทีหลัง
        randomOperatorTypes.push(type);
      }
    }
    
    // สุ่ม operator ที่เหลือให้กับ types ที่เป็น random
    const remainingOperators = operatorCount - totalFixedOperators;
    for (let i = 0; i < remainingOperators; i++) {
      if (randomOperatorTypes.length > 0) {
        const type = randomOperatorTypes[Math.floor(Math.random() * randomOperatorTypes.length)];
        const token = pickTokenFromPool('operator', availablePool, type);
        if (!token) {
          throw new Error(`Not enough ${type} tokens in pool.`);
        }
        selectedTokens.push(createElementFromToken(token));
      } else {
        // ถ้าไม่มี random types เหลือ ให้สุ่มจากทั้งหมด
        const token = pickTokenFromPool('operator', availablePool);
        if (!token) {
          throw new Error('Not enough operator tokens in pool.');
        }
        selectedTokens.push(createElementFromToken(token));
      }
    }
  } else if (operatorMode === 'specific' && specificOperators) {
    // Specific mode with exact counts
    const operatorTypes: Array<{type: '+' | '-' | '×' | '÷', count: number}> = [
      { type: '+', count: specificOperators.plus || 0 },
      { type: '-', count: specificOperators.minus || 0 },
      { type: '×', count: specificOperators.multiply || 0 },
      { type: '÷', count: specificOperators.divide || 0 }
    ];
    
    for (const { type, count } of operatorTypes) {
      for (let i = 0; i < count; i++) {
        const token = pickTokenFromPool('operator', availablePool, type);
        if (!token) {
          throw new Error(`Not enough ${type} tokens in pool.`);
        }
        selectedTokens.push(createElementFromToken(token));
      }
    }
  } else {
    // Random mode: enforce exact operatorCount count by sampling only from operator pool
    for (let i = 0; i < operatorCount; i++) {
      const token = pickTokenFromPool('operator', availablePool);
      if (!token) {
        throw new Error('Not enough operator tokens in pool.');
      }
      selectedTokens.push(createElementFromToken(token));
    }
  }
  
  // Pick other token types
  for (let i = 0; i < heavyNumberCount; i++) {
    const token = pickTokenFromPool('heavy', availablePool);
    if (!token) throw new Error('Not enough heavy number tokens in pool.');
    selectedTokens.push(createElementFromToken(token));
  }
  
  for (let i = 0; i < BlankCount; i++) {
    const token = pickTokenFromPool('Blank', availablePool);
    if (!token) throw new Error('Not enough Blank tokens in pool.');
    selectedTokens.push(createElementFromToken(token));
  }
  
  for (let i = 0; i < zeroCount; i++) {
    const token = pickTokenFromPool('zero', availablePool);
    if (!token) throw new Error('Not enough zero tokens in pool.');
    selectedTokens.push(createElementFromToken(token));
  }
  
  for (let i = 0; i < lightNumberCount; i++) {
    const token = pickTokenFromPool('light', availablePool);
    if (!token) throw new Error('Not enough light number tokens in pool.');
    selectedTokens.push(createElementFromToken(token));
  }
  
  // Final guard: ensure counts match requested EXACTLY
  const final = sortTokensByPriority(selectedTokens);
  // Count both strict operators and choice-operators as operators to honor operatorCount
  const actualOperators = final.filter(el => el.type === 'operator' || el.type === 'choice').length;
  const actualEquals = final.filter(el => el.value === '=').length;
  const actualBlank = final.filter(el => el.value === '?').length;
  const actualZero = final.filter(el => el.value === '0').length;
  const actualHeavy = final.filter(el => isHeavyNumber(el.value)).length;
  const actualTotal = final.length;

  if (actualOperators !== operatorCount || actualEquals !== equalsCount || actualBlank !== BlankCount || actualZero !== zeroCount || actualHeavy !== heavyNumberCount || actualTotal !== totalCount) {
    throw new Error('Generated token counts do not match requested options. Retrying...');
  }

  return final;
}

/**
 * Deprecated: permutation-era helper. Not used by the current backtracking algorithm.
 */
/* function expandBlanks(tokens: string[]): string[][] {
  const SMART_REPLACEMENTS = [
    // High priority (essential for equations)
    '=', '+', '-', '×', '÷', '+/-', '×/÷',
    // Medium priority (common numbers)
    '1', '2', '3', '4', '5', '6', '7', '8', '9',
    // Lower priority (special cases)
    '10', '12', '0'
  ];
  
  const results: string[][] = [];
  const blankCount = tokens.filter(t => t === '?').length;
  
  // Limit expansion for performance
  if (blankCount > 3) {
    return expandBlanksLimited(tokens, SMART_REPLACEMENTS.slice(0, 5));
  }
  
  function smartExpansion(current: string[], idx: number, equalsFound: boolean) {
    if (idx === tokens.length) {
      if (equalsFound) {
        results.push([...current]);
      }
      return;
    }
    
    if (tokens[idx] === '?') {
      let replacements = [...SMART_REPLACEMENTS];
      
      // Prioritize equals if none found
      if (!equalsFound) {
        replacements = ['=', ...replacements.filter(r => r !== '=')];
      }
      
      // Limit for performance
      replacements = replacements.slice(0, Math.min(3, replacements.length));
      
      for (const rep of replacements) {
        current.push(rep);
        smartExpansion(current, idx + 1, equalsFound || rep === '=');
        current.pop();
        
        if (results.length >= 50) return;
      }
    } else {
      current.push(tokens[idx]);
      smartExpansion(current, idx + 1, equalsFound || tokens[idx] === '=');
      current.pop();
    }
  }
  
  smartExpansion([], 0, false);
  return results;
} */

/**
 * Deprecated: permutation-era helper. Not used by the current backtracking algorithm.
 */
/* function expandBlanksLimited(tokens: string[], limitedReplacements: string[]): string[][] {
  const results: string[][] = [];
  
  function helper(current: string[], idx: number) {
    if (idx === tokens.length) {
      if (current.some(t => t === '=')) {
        results.push([...current]);
      }
      return;
    }
    
    if (tokens[idx] === '?') {
      for (const rep of limitedReplacements) {
        current.push(rep);
        helper(current, idx + 1);
        current.pop();
        
        if (results.length >= 20) return;
      }
    } else {
      current.push(tokens[idx]);
      helper(current, idx + 1);
      current.pop();
    }
  }
  
  helper([], 0);
  return results;
} */

/**
 * Structure-first backtracking equation finder (replaces permutation-based search).
 *
 * Key improvements over the original:
 *
 * 1. minTokensRequired structural pruning — each DFS call computes the minimum
 *    number of tiles still needed to complete any valid equation from the current
 *    phase.  Branches where remaining < min are cut immediately, eliminating
 *    large subtrees that can never yield a result.
 *
 * 2. canAdvanceFromNumber — fixes a silent correctness bug where the old
 *    hasAnyOperatorAvailable() guard did NOT include literal '=' in its check,
 *    so any path whose only remaining non-number token was '=' (e.g. finishing
 *    the last operand before '=3') was pruned even though the equation was valid.
 *
 * 3. Early viability gate — '?' is now counted as a potential operator/equals
 *    source in the upfront hasSomeOperator check, so token sets that rely
 *    entirely on blanks for operators are no longer rejected before the DFS.
 *
 * Everything else (unary minus, blanks, choice tokens, heavy tiles,
 * multi-digit composition, onFound callback, MAX_RESULTS cap) is unchanged.
 */
function findValidEquations(tokens: EquationElement[], equalsCount: number, onFound?: (eq: string, parts: string[]) => void): string[] {
  const MAX_RESULTS = 10;
  const requiredEquals = Math.max(equalsCount, 1);
  const results = new Set<string>();

  const tokenValues = tokens.map(t => t.originalToken);

  // Quick viability checks — '?' counts since it can stand for any symbol
  const hasSomeNumber = tokenValues.some(v => /^\d+$/.test(v));
  const hasSomeOperatorOrBlank = tokenValues.some(v => ['+', '-', '×', '÷', '+/-', '×/÷', '?'].includes(v));
  const hasEqualsOrBlank = tokenValues.some(v => v === '=' || v === '?');
  if (!hasSomeNumber || !hasSomeOperatorOrBlank || !hasEqualsOrBlank) {
    return [];
  }

  // Build multiset counts
  const counts: Record<string, number> = {};
  for (const v of tokenValues) counts[v] = (counts[v] || 0) + 1;

  // Helpers
  const HEAVY_NUMBERS: ReadonlyArray<string> = ['10','11','12','13','14','15','16','17','18','19','20'];
  const LIGHT_DIGITS: ReadonlyArray<string> = ['1','2','3','4','5','6','7','8','9'];
  const OPS: ReadonlyArray<string> = ['+','-','×','÷'];
  const BLANK_REPLACEMENTS: ReadonlyArray<string> = ['=', '+', '-', '×', '÷', '+/-', '×/÷', ...LIGHT_DIGITS, '10', '12', '0'];

  // O(1) counter — maintained by consume/unconsume so every dfs call is a simple read
  let remaining = tokenValues.length;

  const canPlaceMoreEquals = (used: number) => {
    const availableEquals = (counts['='] || 0) + (counts['?'] || 0);
    return (requiredEquals - used) <= availableEquals;
  };

  // Structural lower bound on remaining tiles needed to form a valid equation.
  //
  //   start:         LHS-num (= RHS-num)+          → 2·required + 1
  //   afterNumber:   (op num)* (= num)+             → 2·equalsLeft
  //   afterOperator: num (op num)* (= num)+         → 2·equalsLeft + 1
  //   afterEquals:   num (op num)* (= num)*         → 2·equalsLeft + 1
  //                  (equalsLeft = 0 → 1 for the final RHS number)
  //
  // These are conservative: they assume no operators between the equals signs,
  // which minimises the required count.  If remaining < min, no valid equation
  // can be built from this branch — prune.
  type Phase = 'start' | 'afterNumber' | 'afterOperator' | 'afterEquals';
  function minTokensRequired(phase: Phase, usedEq: number): number {
    const equalsLeft = requiredEquals - usedEq;
    switch (phase) {
      case 'start':         return 2 * requiredEquals + 1;
      case 'afterNumber':   return 2 * equalsLeft;
      case 'afterOperator': return 2 * equalsLeft + 1;
      case 'afterEquals':   return 2 * equalsLeft + 1;
    }
  }

  // Whether any next symbol can legally be placed after a number.
  // FIX: the old hasAnyOperatorAvailable() omitted literal '=', causing valid
  // equations like 1+2=3 to be pruned when the only remaining non-number tile
  // was '='.  This version includes '=' when we still need one.
  const canAdvanceFromNumber = (usedEq: number): boolean => {
    const hasOp = OPS.some(op => (counts[op] || 0) > 0)
      || (counts['+/-'] || 0) > 0
      || (counts['×/÷'] || 0) > 0
      || (counts['?'] || 0) > 0;
    const hasEq = usedEq < requiredEquals && (counts['='] || 0) > 0;
    return hasOp || hasEq;
  };

  const equationParts: string[] = [];
  const tileParts: string[] = [];

  function consume(token: string) { counts[token] = (counts[token] || 0) - 1; remaining--; }
  function unconsume(token: string) { counts[token] = (counts[token] || 0) + 1; remaining++; }

  function yieldIfValid(eq: string, usedEquals: number) {
    if (usedEquals !== requiredEquals) return;
    try {
      if (isValidEquationByRules(eq, requiredEquals)) {
        results.add(eq);
        onFound?.(eq, tileParts.slice());
      }
    } catch { /* ignore */ }
  }

  function canStartNumber(zeroAllowed: boolean): boolean {
    if (!zeroAllowed) {
      const nonZeroCandidate = HEAVY_NUMBERS.some(h => (counts[h] || 0) > 0) ||
        LIGHT_DIGITS.some(d => (counts[d] || 0) > 0);
      if (!nonZeroCandidate && (counts['?'] || 0) === 0) return false;
    }
    return (
      HEAVY_NUMBERS.some(h => (counts[h] || 0) > 0) ||
      LIGHT_DIGITS.some(d => (counts[d] || 0) > 0) ||
      (counts['0'] || 0) > 0 ||
      (counts['?'] || 0) > 0
    );
  }

  function buildNumber(usedEquals: number, zeroAllowed: boolean) {
    if (results.size >= MAX_RESULTS) return;

    // Heavy numbers — single tile, stands alone
    for (const h of HEAVY_NUMBERS) {
      if ((counts[h] || 0) > 0) {
        equationParts.push(h); consume(h);
        tileParts.push(h);
        dfs('afterNumber', usedEquals);
        tileParts.pop();
        unconsume(h); equationParts.pop();
        if (results.size >= MAX_RESULTS) return;
      }
    }
    // Blank as limited heavy (10 or 12)
    for (const h of ['10','12']) {
      if ((counts['?'] || 0) > 0) {
        consume('?'); equationParts.push(h);
        tileParts.push(h);
        dfs('afterNumber', usedEquals);
        tileParts.pop();
        equationParts.pop(); unconsume('?');
        if (results.size >= MAX_RESULTS) return;
      }
    }

    // Zero
    if (zeroAllowed && ((counts['0'] || 0) > 0 || (counts['?'] || 0) > 0)) {
      if ((counts['0'] || 0) > 0) {
        equationParts.push('0'); consume('0');
        tileParts.push('0');
        dfs('afterNumber', usedEquals);
        tileParts.pop();
        unconsume('0'); equationParts.pop();
      }
      if (results.size >= MAX_RESULTS) return;
      if ((counts['?'] || 0) > 0) {
        equationParts.push('0'); consume('?');
        tileParts.push('?');
        dfs('afterNumber', usedEquals);
        tileParts.pop();
        unconsume('?'); equationParts.pop();
      }
      if (results.size >= MAX_RESULTS) return;
    }

    // Compose light number from digits (1..9), up to length 3
    const digits: string[] = [];
    function addDigit() {
      if (results.size >= MAX_RESULTS) return;
      if (digits.length >= 3) return;
      for (const d of LIGHT_DIGITS) {
        // direct digit
        if ((counts[d] || 0) > 0) {
          digits.push(d); consume(d);
          tileParts.push(d);
          const num = digits.join('');
          equationParts.push(num);
          dfs('afterNumber', usedEquals);
          equationParts.pop();
          addDigit();
          tileParts.pop();
          unconsume(d); digits.pop();
          if (results.size >= MAX_RESULTS) return;
        }
        // blank as digit
        if ((counts['?'] || 0) > 0) {
          digits.push(d); consume('?');
          tileParts.push('?');
          const num = digits.join('');
          equationParts.push(num);
          dfs('afterNumber', usedEquals);
          equationParts.pop();
          addDigit();
          tileParts.pop();
          unconsume('?'); digits.pop();
          if (results.size >= MAX_RESULTS) return;
        }
      }
    }
    addDigit();
  }

  function dfs(phase: Phase, usedEquals: number) {
    if (results.size >= MAX_RESULTS) return;
    if (!canPlaceMoreEquals(usedEquals)) return;

    // Structural pruning: cut branches that can't possibly form a complete equation
    if (remaining < minTokensRequired(phase, usedEquals)) return;

    if (remaining === 0) {
      if (phase === 'afterNumber' && usedEquals === requiredEquals) {
        const eq = equationParts.join('');
        yieldIfValid(eq, usedEquals);
      }
      return;
    }

    switch (phase) {
      case 'start': {
        // Try unary minus at start (e.g., -1-2=-4+1)
        const tryUnaryAtStart = () => {
          if ((counts['-'] || 0) > 0) {
            equationParts.push('-'); consume('-');
            tileParts.push('-');
            if (canStartNumber(false)) buildNumber(usedEquals, false);
            tileParts.pop();
            unconsume('-'); equationParts.pop();
          }
          if ((counts['+/-'] || 0) > 0) {
            equationParts.push('-'); consume('+/-');
            tileParts.push('+/-');
            if (canStartNumber(false)) buildNumber(usedEquals, false);
            tileParts.pop();
            unconsume('+/-'); equationParts.pop();
          }
          if ((counts['?'] || 0) > 0) {
            equationParts.push('-'); consume('?');
            tileParts.push('?');
            if (canStartNumber(false)) buildNumber(usedEquals, false);
            tileParts.pop();
            unconsume('?'); equationParts.pop();
          }
        };
        tryUnaryAtStart();
        if (results.size >= MAX_RESULTS) return;
        if (canStartNumber(true)) buildNumber(usedEquals, true);
        return;
      }

      case 'afterNumber': {
        // Fixed: includes '=' in availability check (old guard missed this)
        if (!canAdvanceFromNumber(usedEquals)) return;

        // try '=' — do this before binary ops so we close the equation sooner
        if (usedEquals < requiredEquals) {
          if ((counts['='] || 0) > 0) {
            equationParts.push('='); consume('=');
            tileParts.push('=');
            dfs('afterEquals', usedEquals + 1);
            tileParts.pop();
            unconsume('='); equationParts.pop();
            if (results.size >= MAX_RESULTS) return;
          }
          if ((counts['?'] || 0) > 0) {
            equationParts.push('='); consume('?');
            tileParts.push('?');
            dfs('afterEquals', usedEquals + 1);
            tileParts.pop();
            unconsume('?'); equationParts.pop();
            if (results.size >= MAX_RESULTS) return;
          }
        }

        // try binary operators (+,-,×,÷) via direct, choice or blank
        for (const op of OPS) {
          if ((counts[op] || 0) > 0) {
            equationParts.push(op); consume(op);
            tileParts.push(op);
            dfs('afterOperator', usedEquals);
            tileParts.pop();
            unconsume(op); equationParts.pop();
            if (results.size >= MAX_RESULTS) return;
          }
          if ((op === '+' || op === '-') && (counts['+/-'] || 0) > 0) {
            equationParts.push(op); consume('+/-');
            tileParts.push('+/-');
            dfs('afterOperator', usedEquals);
            tileParts.pop();
            unconsume('+/-'); equationParts.pop();
            if (results.size >= MAX_RESULTS) return;
          }
          if ((op === '×' || op === '÷') && (counts['×/÷'] || 0) > 0) {
            equationParts.push(op); consume('×/÷');
            tileParts.push('×/÷');
            dfs('afterOperator', usedEquals);
            tileParts.pop();
            unconsume('×/÷'); equationParts.pop();
            if (results.size >= MAX_RESULTS) return;
          }
          if ((counts['?'] || 0) > 0 && BLANK_REPLACEMENTS.includes(op)) {
            equationParts.push(op); consume('?');
            tileParts.push('?');
            dfs('afterOperator', usedEquals);
            tileParts.pop();
            unconsume('?'); equationParts.pop();
            if (results.size >= MAX_RESULTS) return;
          }
        }
        return;
      }

      case 'afterOperator': {
        if (!canStartNumber(true)) return;
        buildNumber(usedEquals, true);
        return;
      }

      case 'afterEquals': {
        // optional unary minus after '='
        const tryUnary = () => {
          if ((counts['-'] || 0) > 0) {
            equationParts.push('-'); consume('-');
            tileParts.push('-');
            if (canStartNumber(false)) buildNumber(usedEquals, false);
            tileParts.pop();
            unconsume('-'); equationParts.pop();
          }
          if ((counts['+/-'] || 0) > 0) {
            equationParts.push('-'); consume('+/-');
            tileParts.push('+/-');
            if (canStartNumber(false)) buildNumber(usedEquals, false);
            tileParts.pop();
            unconsume('+/-'); equationParts.pop();
          }
          if ((counts['?'] || 0) > 0) {
            equationParts.push('-'); consume('?');
            tileParts.push('?');
            if (canStartNumber(false)) buildNumber(usedEquals, false);
            tileParts.pop();
            unconsume('?'); equationParts.pop();
          }
        };
        tryUnary();
        if (results.size >= MAX_RESULTS) return;
        if (canStartNumber(true)) buildNumber(usedEquals, true);
        return;
      }
    }
  }

  dfs('start', 0);
  return Array.from(results).slice(0, MAX_RESULTS);
}

// ฟังก์ชันอื่นๆ ที่เหลือยังคงเหมือนเดิม (ไม่เปลี่ยนแปลง)

/**
 * Deprecated: permutation-era helper. Not used by the current backtracking algorithm.
 */
/* function createEquationFromPermutation(tokens: AmathToken[], equalsCount: number): string | null {
  // Handle choice tokens FIRST before any processing
  const processedTokens = tokens.map(token => {
    if (token === '+/-') {
      return Math.random() < 0.5 ? '+' : '-';
    }
    if (token === '×/÷') {
      return Math.random() < 0.5 ? '×' : '÷';
    }
    return token;
  });
  
  const processed = combineAdjacentNumbers(processedTokens as AmathToken[]);
  if (processed.length === 0) return null;
  
  const minEqualsCount = Math.max(equalsCount, 1);
  
  if (!isValidTokenStructure(processed, minEqualsCount)) return null;
  
  const equation = processed.join('');
  
  return equation;
} */

/**
 * Deprecated: permutation-era helper. Not used by the current backtracking algorithm.
 */
/* function combineAdjacentNumbers(tokens: AmathToken[]): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (isHeavyNumber(token) || token === '0') {
      const prev = result[result.length - 1];
      const next = tokens[i + 1];
      if ((prev && (isLightNumber(prev) || isHeavyNumber(prev) || prev === '0')) ||
          (next && (isLightNumber(next) || isHeavyNumber(next) || next === '0'))) {
        return [];
      }
      result.push(token);
      i++;
      continue;
    }

    if (isLightNumber(token)) {
      let combinedNumber = token;
      let j = i + 1;
      while (j < tokens.length && isLightNumber(tokens[j]) && combinedNumber.length < 3) {
        combinedNumber += tokens[j];
        j++;
      }
      result.push(combinedNumber);
      i = j;
      continue;
    }

    result.push(token);
    i++;
  }

  for (let i = 0; i < result.length; i++) {
    const current = result[i];
    if (isNumber(current) && (current.length > 3 || parseInt(current) > 999)) {
      return [];
    }
  }

  return result;
} */

/**
 * Deprecated: permutation-era helper. Not used by the current backtracking algorithm.
 */
/* function isValidTokenStructure(tokens: string[], equalsCount: number): boolean {
  if (tokens.length < 3) return false;

  // คำนึงว่า ? สามารถแทน = ได้
  const equalsInTokens = tokens.filter(t => t === '=').length;
  const blanksInTokens = tokens.filter(t => t === '?').length;
  const totalEqualsOrBlanks = equalsInTokens + blanksInTokens;
  
  if (totalEqualsOrBlanks < 1) {
    return false;
  }
  
  if (equalsCount > 0 && totalEqualsOrBlanks < equalsCount) {
    return false;
  }

  if (equalsInTokens > 1) {
    const parts = tokens.join('').split('=');
    if (parts.length !== equalsInTokens + 1) return false;
    for (const part of parts) {
      if (part.length === 0) return false;
      if (!/\d/.test(part)) return false;
    }
  }
  
  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    const next = tokens[i + 1];
    const prev = tokens[i - 1];
    
    // Choice tokens should have been converted already - if we see them, it's an error
    if (current === '+/-' || current === '×/÷') {
      return false;
    }
    
    if (isHeavyNumber(current)) {
      if (prev && !isOperator(prev) && prev !== '=' && prev !== '?') {
        return false;
      }
      if (next && !isOperator(next) && next !== '=' && next !== '?') {
        return false;
      }
    }
    
    if (current === '0') {
      if (prev === '-') {
        return false;
      }
    }
    
    if (isOperator(current)) {
      if (isOperator(next)) {
        if (current === '=' && next === '-') {
          // Allow =-3
        } else {
          return false;
        }
      }
      
      if (isOperator(prev)) {
        if (prev === '=' && current === '-') {
          // Allow =-3
        } else {
          return false;
        }
      }
    }
    
    if (current === '=' || current === '?') {
      if (i === 0 || i === tokens.length - 1) {
        return false;
      }
    }
  }
  
  return true;
} */

/**
 * Check if equation is valid according to rules
 */
export function isValidEquationByRules(equation: string, equalsCount?: number): boolean {
  try {
    const parts = equation.split('=');
    if (parts.length < 2) {
      return false;
    }
    
    const actualEquals = parts.length - 1;
    const requiredEquals = equalsCount === undefined ? actualEquals : equalsCount;
    
    if (requiredEquals > 0 && actualEquals !== requiredEquals) {
      return false;
    }
    
    if (actualEquals < 1) {
      return false;
    }
    
    if (parts.some(part => part.length === 0)) return false;
    
    const fractions: Fraction[] = [];
    for (const part of parts) {
      const fraction = evaluateExpressionAsFraction(part);
      if (!fraction) return false;
      fractions.push(fraction);
    }
    
    const firstFraction = fractions[0];
    return fractions.every(fraction => compareFractions(fraction, firstFraction));
  } catch {
    return false;
  }
}

/**
 * Validate EquationAnagram options
 */
function validateEquationAnagramOptions(options: EquationAnagramOptions, customTokenCounts?: Record<AmathToken, number>): string | null {
  const { totalCount, operatorCount, equalsCount, heavyNumberCount, BlankCount, zeroCount, operatorMode, specificOperators, operatorFixed, randomSettings, lockMode, lockCount } = options;
  
  // Lock mode validation
  if (lockMode) {
    if (totalCount < 9 || totalCount > 15) {
      return 'In lock mode, total count must be between 9 and 15.';
    }
    // ✅ When lockMode is true, lockCount is required and must equal totalCount - 8
    const expectedLockCount = totalCount - 8;
    if (lockCount === undefined) {
      return `In lock mode, lock count is required and must equal totalCount - 8 (${expectedLockCount}).`;
    }
    if (lockCount !== expectedLockCount) {
      return `In lock mode, lock count must equal totalCount - 8 (expected ${expectedLockCount}, got ${lockCount}).`;
    }
  } else {
    if (totalCount < 8) {
      return 'Total count must be at least 8.';
    }
  }
  
  // Validate random settings if enabled
  if (randomSettings) {
    const availableBlanks = customTokenCounts ? (customTokenCounts['?'] ?? AMATH_TOKENS['?'].count) : AMATH_TOKENS['?'].count;
    const availableZeros = customTokenCounts ? (customTokenCounts['0'] ?? AMATH_TOKENS['0'].count) : AMATH_TOKENS['0'].count;
    
    if (randomSettings.blank && BlankCount > availableBlanks) {
      return `Random blank count (${BlankCount}) exceeds available tokens (${availableBlanks}).`;
    }
    
    if (randomSettings.zero && zeroCount > availableZeros) {
      return `Random zero count (${zeroCount}) exceeds available tokens (${availableZeros}).`;
    }
  }
  
  // Validate operator count when in specific mode
  if (operatorMode === 'specific' && specificOperators) {
    const specifiedTotal = (specificOperators.plus || 0) + 
                          (specificOperators.minus || 0) + 
                          (specificOperators.multiply || 0) + 
                          (specificOperators.divide || 0);
    
    if (specifiedTotal !== operatorCount) {
      return `Specified operators (${specifiedTotal}) must equal total operator count (${operatorCount}).`;
    }
    
    // Check individual operator availability
    if ((specificOperators.plus || 0) > (customTokenCounts ? (customTokenCounts['+'] ?? AMATH_TOKENS['+'].count) : AMATH_TOKENS['+'].count)) {
      return `Requested number of + operators (${specificOperators.plus}) exceeds available tokens (${customTokenCounts ? (customTokenCounts['+'] ?? AMATH_TOKENS['+'].count) : AMATH_TOKENS['+'].count}).`;
    }
    if ((specificOperators.minus || 0) > (customTokenCounts ? (customTokenCounts['-'] ?? AMATH_TOKENS['-'].count) : AMATH_TOKENS['-'].count)) {
      return `Requested number of - operators (${specificOperators.minus}) exceeds available tokens (${customTokenCounts ? (customTokenCounts['-'] ?? AMATH_TOKENS['-'].count) : AMATH_TOKENS['-'].count}).`;
    }
    if ((specificOperators.multiply || 0) > (customTokenCounts ? (customTokenCounts['×'] ?? AMATH_TOKENS['×'].count) : AMATH_TOKENS['×'].count)) {
      return `Requested number of × operators (${specificOperators.multiply}) exceeds available tokens (${customTokenCounts ? (customTokenCounts['×'] ?? AMATH_TOKENS['×'].count) : AMATH_TOKENS['×'].count}).`;
    }
    if ((specificOperators.divide || 0) > (customTokenCounts ? (customTokenCounts['÷'] ?? AMATH_TOKENS['÷'].count) : AMATH_TOKENS['÷'].count)) {
      return `Requested number of ÷ operators (${specificOperators.divide}) exceeds available tokens (${customTokenCounts ? (customTokenCounts['÷'] ?? AMATH_TOKENS['÷'].count) : AMATH_TOKENS['÷'].count}).`;
    }
  }

  // Validate operatorFixed logic
  if (operatorMode === 'specific' && operatorFixed) {
    const fixedSum = Object.values(operatorFixed).reduce<number>((sum, v) => sum + (typeof v === 'number' && v > 0 ? v : 0), 0);
    if (fixedSum > operatorCount) {
      return `Sum of fixed operators (${fixedSum}) exceeds total operator count (${operatorCount}).`;
    }
    
    // Check choice operators availability
    if ((operatorFixed['+/-'] || 0) > (customTokenCounts ? (customTokenCounts['+/-'] ?? AMATH_TOKENS['+/-'].count) : AMATH_TOKENS['+/-'].count)) {
      return `Requested number of +/- operators (${operatorFixed['+/-']}) exceeds available tokens (${customTokenCounts ? (customTokenCounts['+/-'] ?? AMATH_TOKENS['+/-'].count) : AMATH_TOKENS['+/-'].count}).`;
    }
    if ((operatorFixed['×/÷'] || 0) > (customTokenCounts ? (customTokenCounts['×/÷'] ?? AMATH_TOKENS['×/÷'].count) : AMATH_TOKENS['×/÷'].count)) {
      return `Requested number of ×/÷ operators (${operatorFixed['×/÷']}) exceeds available tokens (${customTokenCounts ? (customTokenCounts['×/÷'] ?? AMATH_TOKENS['×/÷'].count) : AMATH_TOKENS['×/÷'].count}).`;
    }
  }

  // ไม่ตรวจสอบ lightNumberCount เมื่อใช้ random settings
  if (!randomSettings || !Object.values(randomSettings).some(val => val === true)) {
    const lightNumberCount = totalCount - operatorCount - equalsCount - heavyNumberCount - BlankCount - zeroCount;
    
    if (lightNumberCount < 1) {
      return 'There must be at least 1 light number.';
    }
    
    // Check light numbers (1-9) - only when not using random
    const availableLightNumbers = Object.entries(AMATH_TOKENS)
      .filter(([token, info]) => info.type === 'lightNumber' && token !== '0')
      .reduce((sum, [, info]) => sum + info.count, 0);
    if (lightNumberCount > availableLightNumbers) {
      return `Requested number of light numbers (1-9) (${lightNumberCount}) exceeds available tokens (${availableLightNumbers}).`;
    }
  }
  
  // Check equals
  const availableEquals = customTokenCounts ? (customTokenCounts['='] ?? AMATH_TOKENS['='].count) : AMATH_TOKENS['='].count;
  const availableBlanks = customTokenCounts ? (customTokenCounts['?'] ?? AMATH_TOKENS['?'].count) : AMATH_TOKENS['?'].count;
  
  // ถ้าใช้ random settings และ blank เป็น random หรือ equals เป็น random
  // ให้รวม blank เข้าไปใน available equals เพราะ ? สามารถแทน = ได้
  const effectiveAvailableEquals = (randomSettings && (randomSettings.equals || randomSettings.blank)) 
    ? availableEquals + availableBlanks 
    : availableEquals;
  
  if (equalsCount > effectiveAvailableEquals) {
    return `Requested number of equals (${equalsCount}) exceeds available tokens (${effectiveAvailableEquals} = ${availableEquals} equals + ${availableBlanks} blanks).`;
  }
  
  // Check operators (only when in random mode)
  if (operatorMode === 'random') {
    const availableOperators = Object.entries(AMATH_TOKENS)
      .filter(([, info]) => info.type === 'operator')
      .reduce((sum, [, info]) => sum + info.count, 0);
    if (operatorCount > availableOperators) {
      return `Requested number of operators (${operatorCount}) exceeds available tokens (${availableOperators}).`;
    }
  }
  
  // Check heavy numbers
  const availableHeavyNumbers = Object.entries(AMATH_TOKENS)
    .filter(([, info]) => info.type === 'heavyNumber')
    .reduce((sum, [, info]) => sum + info.count, 0);
  if (heavyNumberCount > availableHeavyNumbers) {
    return `Requested number of heavy numbers (${heavyNumberCount}) exceeds available tokens (${availableHeavyNumbers}).`;
  }
  
  // Check Blanks
  const availableBlank = customTokenCounts ? (customTokenCounts['?'] ?? AMATH_TOKENS['?'].count) : AMATH_TOKENS['?'].count;
  if (BlankCount > availableBlank) {
    return `Requested number of blank (${BlankCount}) exceeds available tokens (${availableBlank}).`;
  }
  
  // Check zero
  const availableZeros = customTokenCounts ? (customTokenCounts['0'] ?? AMATH_TOKENS['0'].count) : AMATH_TOKENS['0'].count;
  if (zeroCount > availableZeros) {
    return `Requested number of zeros (${zeroCount}) exceeds available tokens (${availableZeros}).`;
  }
  
  return null;
}

/**
 * Weighted random selection based on token availability in pool
 */
function weightedRandomFromPool(pool: AmathToken[], weights: number[]): AmathToken | null {
  if (pool.length === 0) return null;
  
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight === 0) return null;
  
  const random = Math.random() * totalWeight;
  
  let currentWeight = 0;
  for (let i = 0; i < pool.length; i++) {
    currentWeight += weights[i];
    if (random <= currentWeight) {
      return pool[i];
    }
  }
  
  return pool[pool.length - 1];
}

/**
 * Get weighted pool for specific token type
 */
function getWeightedPool(tokenType: 'equals' | 'operator' | 'light' | 'heavy' | 'Blank' | 'zero', availablePool: AmathToken[], specificOperator?: '+' | '-' | '×' | '÷' | '+/-' | '×/÷', customTokenCounts?: Record<AmathToken, number>): { tokens: AmathToken[], weights: number[] } {
  let candidates: AmathToken[] = [];
  let weights: number[] = [];
  
  if (tokenType === 'equals') {
    candidates = availablePool.filter(token => token === '=');
    weights = candidates.map(() => customTokenCounts ? (customTokenCounts['='] ?? AMATH_TOKENS['='].count) : AMATH_TOKENS['='].count);
  } else if (tokenType === 'operator') {
    if (specificOperator) {
      candidates = availablePool.filter(token => token === specificOperator);
      weights = candidates.map(token => customTokenCounts ? (customTokenCounts[token] ?? AMATH_TOKENS[token].count) : AMATH_TOKENS[token].count);
    } else {
      // รวม choice operators เป็นส่วนหนึ่งของ operator
      candidates = availablePool.filter(token => ['+', '-', '×', '÷', '+/-', '×/÷'].includes(token));
      weights = candidates.map(token => customTokenCounts ? (customTokenCounts[token] ?? AMATH_TOKENS[token].count) : AMATH_TOKENS[token].count);
    }
  } else if (tokenType === 'light') {
    candidates = availablePool.filter(token => ['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(token));
    weights = candidates.map(token => customTokenCounts ? (customTokenCounts[token] ?? AMATH_TOKENS[token].count) : AMATH_TOKENS[token].count);
  } else if (tokenType === 'heavy') {
    candidates = availablePool.filter(token => ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'].includes(token));
    weights = candidates.map(token => customTokenCounts ? (customTokenCounts[token] ?? AMATH_TOKENS[token].count) : AMATH_TOKENS[token].count);
  } else if (tokenType === 'Blank') {
    candidates = availablePool.filter(token => token === '?');
    weights = candidates.map(() => customTokenCounts ? (customTokenCounts['?'] ?? AMATH_TOKENS['?'].count) : AMATH_TOKENS['?'].count);
  } else if (tokenType === 'zero') {
    candidates = availablePool.filter(token => token === '0');
    weights = candidates.map(() => customTokenCounts ? (customTokenCounts['0'] ?? AMATH_TOKENS['0'].count) : AMATH_TOKENS['0'].count);
  }
  
  return { tokens: candidates, weights };
}

/**
 * Pick token from pool using weighted random
 */
const pickTokenFromPool = (tokenType: 'equals' | 'operator' | 'light' | 'heavy' | 'Blank' | 'zero', availablePool: AmathToken[], specificOperator?: '+' | '-' | '×' | '÷' | '+/-' | '×/÷', customTokenCounts?: Record<AmathToken, number>): AmathToken | null => {
  const { tokens, weights } = getWeightedPool(tokenType, availablePool, specificOperator, customTokenCounts);
  
  if (tokens.length === 0) return null;
  
  const selectedToken = weightedRandomFromPool(tokens, weights);
  if (!selectedToken) return null;
  
  const poolIndex = availablePool.indexOf(selectedToken);
  if (poolIndex !== -1) {
    availablePool.splice(poolIndex, 1);
  }
  
  return selectedToken;
};

/**
 * Create EquationElement from token
 */
function createElementFromToken(token: AmathToken): EquationElement {
  return {
    type: getElementType(token),
    value: token,
    originalToken: token
  };
}

/**
 * Sort tokens by AMATH_TOKENS order for better readability
 */
function sortTokensByPriority(tokens: EquationElement[]): EquationElement[] {
  // สร้าง order array ตามลำดับที่ประกาศใน AMATH_TOKENS
  const amathOrder = Object.keys(AMATH_TOKENS) as AmathToken[];
  
  return tokens.sort((a, b) => {
    const indexA = amathOrder.indexOf(a.value as AmathToken);
    const indexB = amathOrder.indexOf(b.value as AmathToken);
    return indexA - indexB;
  });
}

/**
 * Check if a set of numbers and operators can form a valid equation
 */
export function canFormValidEquation(elements: string[]): boolean {
  try {
    const tokens: EquationElement[] = elements.map(el => ({
      type: getElementType(el),
      value: el,
      originalToken: el as AmathToken
    }));
    
    const equations = findValidEquations(tokens, 1);
    return equations.length > 0;
  } catch {
    return false;
  }
}

/**
 * Find all possible equations from a given set of numbers and operators
 */
export function findAllPossibleEquations(elements: string[]): string[] {
  try {
    const tokens: EquationElement[] = elements.map(el => ({
      type: getElementType(el),
      value: el,
      originalToken: el as AmathToken
    }));

    return findValidEquations(tokens, 1);
  } catch {
    return [];
  }
}

/**
 * Result type returned by findEquationsWithTiles.
 * `tiles` is the source-tile ordering produced by the DFS —
 * individual digit tiles are preserved as-is even when they form
 * a multi-digit number in the equation (e.g. ['1','2'] for "12").
 */
export interface EquationWithTiles {
  equation: string;
  tiles: string[];
}

/**
 * Backtrack-DFS equation search that also returns the tile ordering.
 *
 * Like findAllPossibleEquations but with configurable equalsCount and
 * with per-equation tile arrays so callers can reconstruct solutionTiles
 * without re-running equationToSourceTiles (which would collapse digit
 * pairs into heavy-tile tokens and break the count invariant).
 */
export function findEquationsWithTiles(
  elements: string[],
  equalsCount: number = 1,
): EquationWithTiles[] {
  try {
    const tokens: EquationElement[] = elements.map(el => ({
      type: getElementType(el),
      value: el,
      originalToken: el as AmathToken,
    }));

    const seen = new Set<string>();
    const results: EquationWithTiles[] = [];

    findValidEquations(tokens, Math.max(equalsCount, 1), (eq, tiles) => {
      if (!seen.has(eq)) {
        seen.add(eq);
        results.push({ equation: eq, tiles: [...tiles] });
      }
    });

    return results;
  } catch {
    return [];
  }
}