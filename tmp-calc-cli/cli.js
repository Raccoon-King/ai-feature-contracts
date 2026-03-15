#!/usr/bin/env node
'use strict';

/**
 * CLI Calculator Entry Point
 * Usage: node cli.js <operation> <num1> <num2>
 */

const { calculate } = require('./calculator');

const OPERATIONS = ['add', 'subtract', 'multiply', 'divide'];

function showHelp() {
  console.log(`
Calculator CLI - Basic Arithmetic Operations

Usage:
  node cli.js <operation> <num1> <num2>

Operations:
  add       Add two numbers
  subtract  Subtract num2 from num1
  multiply  Multiply two numbers
  divide    Divide num1 by num2

Examples:
  node cli.js add 5 3        # Output: 8
  node cli.js subtract 10 4  # Output: 6
  node cli.js multiply 3 7   # Output: 21
  node cli.js divide 20 4    # Output: 5
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args.length !== 3) {
    console.error('Error: Expected 3 arguments: <operation> <num1> <num2>');
    showHelp();
    process.exit(1);
  }

  const [operation, num1, num2] = args;

  if (!OPERATIONS.includes(operation)) {
    console.error(`Error: Unknown operation "${operation}"`);
    console.error(`Valid operations: ${OPERATIONS.join(', ')}`);
    process.exit(1);
  }

  try {
    const result = calculate(operation, num1, num2);
    console.log(result);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
