// src/lib/expressionUtil.ts - ฟังก์ชันเกี่ยวกับการประเมินผลนิพจน์ (Enhanced)
import { Fraction, addFractions, subtractFractions, multiplyFractions, divideFractions } from './fractionUtil';
import { isValidNumberToken } from './tokenUtil';

/**
 * Enhanced expression evaluation with better error handling
 */
export function evaluateExpressionAsFraction(expression: string): Fraction | null {
  try {
    expression = expression.trim().replace(/\s/g, '');
    
    // Basic format validation
    if (!/^[\-0-9+\-×÷\.]+$/.test(expression)) {
      return null;
    }
    
    // Check for invalid leading zeros
    if (containsInvalidZeroLeadingNumbers(expression)) {
      return null;
    }
    
    // Handle simple negative numbers
    if (expression.startsWith('-')) {
      if (/^\-\d+$/.test(expression)) {
        const num = parseInt(expression);
        if (isNaN(num)) return null;
        return { numerator: num, denominator: 1 };
      }
    }
    
    // Handle simple positive numbers
    if (/^\d+$/.test(expression)) {
      if (expression.length > 1 && expression.startsWith('0')) {
        return null;
      }
      return { numerator: parseInt(expression), denominator: 1 };
    }
    
    // Evaluate complex expressions
    return evaluateLeftToRight(expression);
  } catch {
    return null;
  }
}

/**
 * Check for invalid number formats
 */
export function containsInvalidZeroLeadingNumbers(expression: string): boolean {
  const numbers = expression.match(/\d+/g);
  if (!numbers) return false;
  
  for (const num of numbers) {
    // Check for leading zeros
    if (num.length > 1 && num.startsWith('0')) {
      return true;
    }
    // Check for too long numbers
    if (num.length > 3) {
      return true;
    }
  }
  return false;
}

/**
 * Enhanced left-to-right evaluation with proper operator precedence
 */
export function evaluateLeftToRight(expression: string): Fraction | null {
  try {
    const tokens = tokenizeExpression(expression);
    if (!tokens || tokens.length === 0) return null;
    if (isNaN(parseInt(tokens[0]))) return null;
    
    const numbers: Fraction[] = [];
    const operators: string[] = [];
    
    // Parse tokens into numbers and operators
    for (let i = 0; i < tokens.length; i++) {
      if (i % 2 === 0) {
        const num = parseInt(tokens[i]);
        if (isNaN(num)) return null;
        numbers.push({ numerator: num, denominator: 1 });
      } else {
        operators.push(tokens[i]);
      }
    }
    
    if (operators.length !== numbers.length - 1) return null;
    
    // Process multiplication and division first (operator precedence)
    const processedNumbers: Fraction[] = [...numbers];
    const processedOperators: string[] = [...operators];
    
    let i = 0;
    while (i < processedOperators.length) {
      const operator = processedOperators[i];
      if (operator === '×' || operator === '÷') {
        const left = processedNumbers[i];
        const right = processedNumbers[i + 1];
        let result: Fraction;
        
        if (operator === '×') {
          result = multiplyFractions(left, right);
        } else {
          if (right.numerator === 0) return null; // Division by zero
          result = divideFractions(left, right);
        }
        
        processedNumbers[i] = result;
        processedNumbers.splice(i + 1, 1);
        processedOperators.splice(i, 1);
      } else {
        i++;
      }
    }
    
    // Process addition and subtraction left to right
    let result = processedNumbers[0];
    for (let i = 0; i < processedOperators.length; i++) {
      const operator = processedOperators[i];
      const nextNumber = processedNumbers[i + 1];
      
      if (operator === '+') {
        result = addFractions(result, nextNumber);
      } else if (operator === '-') {
        result = subtractFractions(result, nextNumber);
      } else {
        return null; // Invalid operator
      }
    }
    
    return result;
  } catch {
    return null;
  }
}

/**
 * Enhanced tokenization with better negative number handling
 */
export function tokenizeExpression(expression: string): string[] | null {
  try {
    const tokens: string[] = [];
    let currentNumber = '';
    let i = 0;
    
    while (i < expression.length) {
      const char = expression[i];
      
      if (/\d/.test(char)) {
        currentNumber += char;
      } else if (['+', '-', '×', '÷'].includes(char)) {
        if (currentNumber) {
          if (!isValidNumberToken(currentNumber)) {
            return null;
          }
          tokens.push(currentNumber);
          currentNumber = '';
        }
        
        if (char === '-') {
          // Check if this is a negative number
          const isNegativeNumber = (
            tokens.length === 0 ||
            tokens[tokens.length - 1] === '=' ||
            tokens[tokens.length - 1] === '+' ||
            tokens[tokens.length - 1] === '-' ||
            tokens[tokens.length - 1] === '×' ||
            tokens[tokens.length - 1] === '÷'
          );
          
          if (isNegativeNumber && i + 1 < expression.length && /\d/.test(expression[i + 1])) {
            currentNumber = '-';
          } else {
            tokens.push(char);
          }
        } else {
          tokens.push(char);
        }
      } else {
        return null; // Invalid character
      }
      i++;
    }
    
    if (currentNumber) {
      if (!isValidNumberToken(currentNumber)) {
        return null;
      }
      tokens.push(currentNumber);
    }
    
    return tokens;
  } catch {
    return null;
  }
}

/**
 * Validate expression format before evaluation
 */
export function isValidExpressionFormat(expression: string): boolean {
  // Basic format checks
  if (!expression || expression.length === 0) return false;
  
  // Check for valid characters only
  if (!/^[\-0-9+\-×÷\s]+$/.test(expression)) return false;
  
  // Check for balanced operators and numbers
  const tokens = tokenizeExpression(expression.replace(/\s/g, ''));
  if (!tokens) return false;
  
  // Must have odd number of tokens (number operator number operator...)
  if (tokens.length % 2 === 0) return false;
  
  // First and last tokens must be numbers
  if (!/^-?\d+$/.test(tokens[0]) || !/^-?\d+$/.test(tokens[tokens.length - 1])) {
    return false;
  }
  
  // Alternating pattern check
  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0) {
      // Should be number
      if (!/^-?\d+$/.test(tokens[i])) return false;
    } else {
      // Should be operator
      if (!['+', '-', '×', '÷'].includes(tokens[i])) return false;
    }
  }
  
  return true;
}