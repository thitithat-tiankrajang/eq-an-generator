import type { AmathToken, AmathTokenInfo } from '../types/EquationAnagram';

export const AMATH_TOKENS = {
  '0': { token: '0', count: 4, type: 'lightNumber', point: 1 },
  '1': { token: '1', count: 4, type: 'lightNumber', point: 1 },
  '2': { token: '2', count: 4, type: 'lightNumber', point: 1 },
  '3': { token: '3', count: 4, type: 'lightNumber', point: 1 },
  '4': { token: '4', count: 4, type: 'lightNumber', point: 2 },
  '5': { token: '5', count: 4, type: 'lightNumber', point: 2 },
  '6': { token: '6', count: 4, type: 'lightNumber', point: 2 },
  '7': { token: '7', count: 4, type: 'lightNumber', point: 2 },
  '8': { token: '8', count: 4, type: 'lightNumber', point: 2 },
  '9': { token: '9', count: 4, type: 'lightNumber', point: 2 },
  '10': { token: '10', count: 1, type: 'heavyNumber', point: 3 },
  '11': { token: '11', count: 1, type: 'heavyNumber', point: 4 },
  '12': { token: '12', count: 1, type: 'heavyNumber', point: 3 },
  '13': { token: '13', count: 1, type: 'heavyNumber', point: 6 },
  '14': { token: '14', count: 1, type: 'heavyNumber', point: 4 },
  '15': { token: '15', count: 1, type: 'heavyNumber', point: 4 },
  '16': { token: '16', count: 1, type: 'heavyNumber', point: 4 },
  '17': { token: '17', count: 1, type: 'heavyNumber', point: 6 },
  '18': { token: '18', count: 1, type: 'heavyNumber', point: 4 },
  '19': { token: '19', count: 1, type: 'heavyNumber', point: 7 },
  '20': { token: '20', count: 1, type: 'heavyNumber', point: 5 },
  '+': { token: '+', count: 4, type: 'operator', point: 2 },
  '-': { token: '-', count: 4, type: 'operator', point: 2 },
  '×': { token: '×', count: 4, type: 'operator', point: 2 },
  '÷': { token: '÷', count: 4, type: 'operator', point: 2 },
  '+/-': { token: '+/-', count: 4, type: 'choice', point: 1 },
  '×/÷': { token: '×/÷', count: 4, type: 'choice', point: 1 },
  '=': { token: '=', count: 11, type: 'equals', point: 1 },
  '?': { token: '?', count: 4, type: 'Blank', point: 0 },
} satisfies Record<AmathToken, AmathTokenInfo>;

export const POOL_DEF: Record<AmathToken, number> = Object.fromEntries(
  Object.entries(AMATH_TOKENS).map(([k, v]) => [k, v.count])
) as Record<AmathToken, number>;

export const TILE_POINTS: Record<AmathToken, number> = Object.fromEntries(
  Object.entries(AMATH_TOKENS).map(([k, v]) => [k, v.point])
) as Record<AmathToken, number>;

export const HEAVY_SET: ReadonlySet<string> = new Set(
  Object.values(AMATH_TOKENS)
    .filter(info => info.type === 'heavyNumber')
    .map(info => info.token)
);

export const OPS_SET: ReadonlySet<string> = new Set(['+', '-', '×', '÷']);
export const CHOICE_SET: ReadonlySet<string> = new Set(['+/-', '×/÷']);

export const HEAVY_ARR: string[] = [...HEAVY_SET];
export const LIGHT_ARR: string[] = ['1','2','3','4','5','6','7','8','9'];
export const OPS_ARR: string[] = ['+','-','×','÷'];

