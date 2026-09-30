import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { stripAnsi } from '../../../src/terminal/PtySessionService';

// Run in a child process: a synchronous regression cannot be interrupted by
// Vitest's in-process timeout. The parent kills and reaps this process after 30s.
const results = [];
for (const size of [10_000, 100_000, 500_000]) {
  const text = 'x'.repeat(size);
  const half = 'x'.repeat(size / 2);
  const cases = [
    { name: 'no CR', input: text, expected: text },
    { name: 'middle CR', input: half + '\r' + half, expected: half },
    { name: 'long suffix', input: 'old\r' + text, expected: text },
    { name: 'trailing CR', input: text + '\r', expected: text + '\r' },
    { name: 'consecutive CR', input: '\r'.repeat(size), expected: '\r' },
    { name: 'CRLF', input: text + '\r\n', expected: text + '\r\n' },
    {
      name: 'Codex CSI',
      input: '\x1b[1A\x1b[2K\x1b[?25lx\x1b[?25h'.repeat(size),
      expected: text,
    },
  ];
  for (const { name, input, expected } of cases) {
    assert.equal(stripAnsi(input), expected, `${name} (${size})`);
    const samples = [];
    for (let iteration = 0; iteration < 5; iteration++) {
      const start = performance.now();
      const actual = stripAnsi(input);
      samples.push(performance.now() - start);
      assert.equal(actual, expected);
    }
    samples.sort((a, b) => a - b);
    const medianMs = samples[2];
    results.push({ name, size, inputLength: input.length, medianMs, msPerCharacter: medianMs / input.length });
  }
}
console.log(JSON.stringify(results));
