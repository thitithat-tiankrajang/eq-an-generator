// src/lib/fractionUtil.ts - ฟังก์ชันเกี่ยวกับเศษส่วน
export interface Fraction {
  numerator: number;
  denominator: number;
}

export function addFractions(a: Fraction, b: Fraction): Fraction {
  const numerator = a.numerator * b.denominator + b.numerator * a.denominator;
  const denominator = a.denominator * b.denominator;
  return simplifyFraction({ numerator, denominator });
}

export function subtractFractions(a: Fraction, b: Fraction): Fraction {
  const numerator = a.numerator * b.denominator - b.numerator * a.denominator;
  const denominator = a.denominator * b.denominator;
  return simplifyFraction({ numerator, denominator });
}

export function multiplyFractions(a: Fraction, b: Fraction): Fraction {
  const numerator = a.numerator * b.numerator;
  const denominator = a.denominator * b.denominator;
  return simplifyFraction({ numerator, denominator });
}

export function divideFractions(a: Fraction, b: Fraction): Fraction {
  const numerator = a.numerator * b.denominator;
  const denominator = a.denominator * b.numerator;
  return simplifyFraction({ numerator, denominator });
}

export function simplifyFraction(fraction: Fraction): Fraction {
  const gcd = findGCD(Math.abs(fraction.numerator), Math.abs(fraction.denominator));
  return {
    numerator: fraction.numerator / gcd,
    denominator: fraction.denominator / gcd
  };
}

export function findGCD(a: number, b: number): number {
  while (b !== 0) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

export function compareFractions(a: Fraction, b: Fraction): boolean {
  const simplifiedA = simplifyFraction(a);
  const simplifiedB = simplifyFraction(b);
  return simplifiedA.numerator === simplifiedB.numerator && 
         simplifiedA.denominator === simplifiedB.denominator;
}

export function fractionToString(fraction: Fraction): string {
  if (fraction.denominator === 1) {
    return fraction.numerator.toString();
  }
  return `${fraction.numerator}/${fraction.denominator}`;
}