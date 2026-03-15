'use strict';

/**
 * Calculator Module
 * Core arithmetic operations: add, subtract, multiply, divide
 */

function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

function multiply(a, b) {
  return a * b;
}

function divide(a, b) {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}

function calculate(operation, a, b) {
  const num1 = parseFloat(a);
  const num2 = parseFloat(b);

  if (isNaN(num1) || isNaN(num2)) {
    throw new Error('Invalid number input');
  }

  switch (operation) {
    case 'add':
      return add(num1, num2);
    case 'subtract':
      return subtract(num1, num2);
    case 'multiply':
      return multiply(num1, num2);
    case 'divide':
      return divide(num1, num2);
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

module.exports = {
  add,
  subtract,
  multiply,
  divide,
  calculate,
};
