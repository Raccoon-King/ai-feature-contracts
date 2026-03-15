'use strict';

const { add, subtract, multiply, divide, calculate } = require('../../tmp-calc-cli/calculator');

describe('Calculator Module', () => {
  describe('add', () => {
    it('adds two positive numbers', () => {
      expect(add(2, 3)).toBe(5);
    });

    it('adds negative numbers', () => {
      expect(add(-2, -3)).toBe(-5);
    });

    it('adds zero', () => {
      expect(add(5, 0)).toBe(5);
    });
  });

  describe('subtract', () => {
    it('subtracts two numbers', () => {
      expect(subtract(10, 4)).toBe(6);
    });

    it('returns negative when second is larger', () => {
      expect(subtract(4, 10)).toBe(-6);
    });
  });

  describe('multiply', () => {
    it('multiplies two numbers', () => {
      expect(multiply(3, 7)).toBe(21);
    });

    it('multiplies by zero', () => {
      expect(multiply(5, 0)).toBe(0);
    });

    it('multiplies negative numbers', () => {
      expect(multiply(-2, 3)).toBe(-6);
    });
  });

  describe('divide', () => {
    it('divides two numbers', () => {
      expect(divide(20, 4)).toBe(5);
    });

    it('returns decimal result', () => {
      expect(divide(7, 2)).toBe(3.5);
    });

    it('throws on division by zero', () => {
      expect(() => divide(5, 0)).toThrow('Division by zero');
    });
  });

  describe('calculate', () => {
    it('performs add operation', () => {
      expect(calculate('add', '5', '3')).toBe(8);
    });

    it('performs subtract operation', () => {
      expect(calculate('subtract', '10', '4')).toBe(6);
    });

    it('performs multiply operation', () => {
      expect(calculate('multiply', '3', '7')).toBe(21);
    });

    it('performs divide operation', () => {
      expect(calculate('divide', '20', '4')).toBe(5);
    });

    it('throws on invalid number', () => {
      expect(() => calculate('add', 'abc', '3')).toThrow('Invalid number input');
    });

    it('throws on unknown operation', () => {
      expect(() => calculate('modulo', '5', '3')).toThrow('Unknown operation: modulo');
    });
  });
});
