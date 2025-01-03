import type { Code } from 'micromark-util-types';
import { codes } from 'micromark-util-symbol';

// Source: https://stackoverflow.com/questions/42473446/how-to-get-function-name-in-strict-mode-proper-way
export function callees() {
  return (new Error()).stack?.split(/\n/).slice(2).map(s => s.replace(/^\s+at\s+(\<?[\w.]+\>?).*/, '$1')) || [];
}

function keyByValue(object: any, value: any) {
  return Object.keys(object).find(key => object[key] === value);
}

export function charFromCode(code: Code) {
  return keyByValue(codes, code);
}

export function debug(code: Code) {
  const names = callees();
  const indexOfGoFn = names.indexOf('go');
  const stack = names.slice(1, indexOfGoFn).reverse();
  const callSegment = stack.join(' > ').padEnd(75, '.');
  const codeSegment = (code ? code.toString() : 'null').padStart(4);
  const character = charFromCode(code);

  console.log(callSegment, codeSegment, character);
}
