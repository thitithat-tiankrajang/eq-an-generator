// src/lib/permutationUtil.ts - ฟังก์ชันเกี่ยวกับ permutation (Optimized)
/**
 * Generate limited permutations with better performance
 */
export function generateLimitedPermutations<T>(arr: T[], maxCount: number): T[][] {
  if (arr.length <= 1) return [arr];
  
  const permutations: T[][] = [];
  const seen = new Set<string>();
  
  // Calculate realistic max attempts based on array size
  const maxAttempts = Math.min(maxCount, factorial(arr.length), arr.length * 1000);
  
  for (let i = 0; i < maxAttempts; i++) {
    const shuffled = [...arr];
    shuffleArray(shuffled);
    
    const key = shuffled.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      permutations.push(shuffled);
      
      // Early termination if we have enough unique permutations
      if (permutations.length >= maxCount) {
        break;
      }
    }
  }
  
  return permutations;
}

/**
 * Optimized factorial calculation with upper limit
 */
export function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  // Limit factorial calculation to prevent overflow and performance issues
  for (let i = 2; i <= Math.min(n, 12); i++) {
    result *= i;
  }
  return result;
}

/**
 * Fisher-Yates shuffle algorithm
 */
export function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}