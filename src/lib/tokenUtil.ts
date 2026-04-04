// src/lib/tokenUtil.ts - ฟังก์ชันเกี่ยวกับ token (Enhanced)
import { AMATH_TOKENS } from './amathTokens';
import type { EquationElement, AmathToken } from '@/types/EquationAnagram';

/**
 * Check if token is a number
 */
export function isNumber(token: string): boolean {
  return /^\d+$/.test(token);
}

/**
 * Check if token is a light number (1-9)
 */
export function isLightNumber(token: string): boolean {
  return /^[1-9]$/.test(token);
}

/**
 * Check if token is a heavy number (10-20)
 */
export function isHeavyNumber(token: string): boolean {
  const num = parseInt(token);
  return num >= 10 && num <= 20;
}

/**
 * Check if token is an operator
 */
export function isOperator(token: string): boolean {
  return ['+', '-', '×', '÷', '+/-', '×/÷'].includes(token);
}

/**
 * Get element type from token with enhanced logic
 */
export function getElementType(token: string): EquationElement['type'] {
  const tokenInfo = AMATH_TOKENS[token as keyof typeof AMATH_TOKENS];
  if (!tokenInfo) return 'Blank';
  
  switch (tokenInfo.type) {
    case 'lightNumber':
    case 'heavyNumber':
      return 'number';
    case 'operator':
      return 'operator';
    case 'equals':
      return 'equals';
    case 'choice':
      return 'choice';
    case 'Blank':
      return 'Blank';
    default:
      return 'Blank';
  }
}

/**
 * Enhanced number token validation
 */
export function isValidNumberToken(numberStr: string): boolean {
  let actualNumber = numberStr;
  let isNegative = false;
  
  if (numberStr.startsWith('-')) {
    isNegative = true;
    actualNumber = numberStr.substring(1);
  }
  
  // Basic format check
  if (!/^\d+$/.test(actualNumber)) return false;
  
  // No leading zeros (except for single '0')
  if (actualNumber.length > 1 && actualNumber.startsWith('0')) {
    return false;
  }
  
  // Maximum 3 digits
  if (actualNumber.length > 3) {
    return false;
  }
  
  const numValue = parseInt(actualNumber);
  
  // Maximum value 999
  if (numValue > 999) {
    return false;
  }
  
  // No negative zero
  if (isNegative && actualNumber === '0') {
    return false;
  }
  
  return true;
}

/**
 * Check if token is available in pool
 */
export function isTokenAvailableInPool(token: string, count: number = 1): boolean {
  const tokenInfo = AMATH_TOKENS[token as keyof typeof AMATH_TOKENS];
  return tokenInfo ? tokenInfo.count >= count : false;
}

/**
 * Get token rarity/weight for sampling
 */
export function getTokenWeight(token: string): number {
  const tokenInfo = AMATH_TOKENS[token as keyof typeof AMATH_TOKENS];
  return tokenInfo ? tokenInfo.count : 0;
}

/**
 * Calculate expected count for token type in sampling
 */
export function calculateExpectedTokenCount(
  tokenType: 'operators' | 'equals' | 'heavy' | 'blank' | 'zero' | 'light',
  totalSampleSize: number
): number {
  const totalPoolSize = Object.values(AMATH_TOKENS).reduce((sum, info) => sum + info.count, 0);
  
  let typeTokens = 0;
  switch (tokenType) {
    case 'operators':
      typeTokens = (['+', '-', '×', '÷'] as unknown as AmathToken[]).reduce((sum, op) => sum + AMATH_TOKENS[op].count, 0);
      break;
    case 'equals':
      typeTokens = AMATH_TOKENS['='].count;
      break;
    case 'heavy':
      typeTokens = (['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'] as unknown as AmathToken[]).reduce((sum, num) => sum + AMATH_TOKENS[num].count, 0);
      break;
    case 'blank':
      typeTokens = AMATH_TOKENS['?'].count;
      break;
    case 'zero':
      typeTokens = AMATH_TOKENS['0'].count;
      break;
    case 'light':
      typeTokens = (['1', '2', '3', '4', '5', '6', '7', '8', '9'] as unknown as AmathToken[]).reduce((sum, num) => sum + AMATH_TOKENS[num].count, 0);
      break;
  }
  
  const probability = typeTokens / totalPoolSize;
  return Math.round(probability * totalSampleSize);
}
