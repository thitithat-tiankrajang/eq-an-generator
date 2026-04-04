import type { AmathToken } from '../types/EquationAnagram';
import { AMATH_TOKENS } from './amathTokens';

const AMATH_ORDER = Object.keys(AMATH_TOKENS) as AmathToken[];
const AMATH_ORDER_INDEX = new Map<AmathToken, number>(
  AMATH_ORDER.map((t, i) => [t, i])
);

export function sortTokenStringsByAmathOrder(tokens: string[]): string[] {
    return [...tokens].sort((a, b) => {
      const ia = AMATH_ORDER_INDEX.get(a as AmathToken) ?? Number.MAX_SAFE_INTEGER;
      const ib = AMATH_ORDER_INDEX.get(b as AmathToken) ?? Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
  }
  