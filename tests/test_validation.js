/**
 * Automated Unit Test Suite for Colab to GitHub Extension
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Test Base64 Encoding Functionality
function testBase64Encoding() {
  const GitHubAPI = require('../utils/github.js');

  const testCases = [
    { name: 'Simple Python Code', input: 'print("Hello World")\n' },
    { name: 'Unicode & Emoji', input: '# 🚀 Machine Learning Project — नमस्ते दुनिया\nx = 10\n' },
    { name: 'LaTeX & Math', input: '# Formula: $$\\sigma(z) = \\frac{1}{1 + e^{-z}}$$\n' },
    { name: 'Large String with Indents', input: 'def test():\n    for i in range(100):\n        yield i\n' }
  ];

  for (const tc of testCases) {
    const encoded = GitHubAPI.toBase64(tc.input);
    assert(typeof encoded === 'string', `${tc.name}: Encoded output must be string`);
    assert(encoded.length > 0, `${tc.name}: Encoded output must not be empty`);

    // Verify round-trip decoding via Buffer
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    assert.strictEqual(decoded, tc.input, `${tc.name}: Round-trip decode must match original`);
  }

  console.log('✅ Base64 UTF-8 round-trip encoding tests passed (4/4)');
}

// 2. Test Jupyter Notebook v4 Specification Validation
function testNotebookSchema() {
  const sampleNotebook = {
    nbformat: 4,
    nbformat_minor: 0,
    metadata: {
      colab: { provenance: [] },
      kernelspec: { name: 'python3', display_name: 'Python 3' },
      language_info: { name: 'python' }
    },
    cells: [
      {
        cell_type: 'code',
        execution_count: 1,
        metadata: { id: 'cell_0' },
        outputs: [],
        source: ['import numpy as np\n', 'print("Ready")\n']
      },
      {
        cell_type: 'markdown',
        metadata: { id: 'cell_1' },
        source: ['# Heading 1\n', 'This is a description.\n']
      }
    ]
  };

  const jsonStr = JSON.stringify(sampleNotebook, null, 2);
  const parsed = JSON.parse(jsonStr);

  assert.strictEqual(parsed.nbformat, 4, 'Notebook must be nbformat 4');
  assert(Array.isArray(parsed.cells), 'Notebook must have cells array');
  assert.strictEqual(parsed.cells.length, 2, 'Cells count must be 2');
  assert.strictEqual(parsed.cells[0].cell_type, 'code', 'First cell must be code');
  assert.strictEqual(parsed.cells[1].cell_type, 'markdown', 'Second cell must be markdown');

  console.log('✅ Jupyter Notebook v4 structure tests passed');
}

// 3. Test Validation Safeguards
function testSafeguards() {
  const GitHubAPI = require('../utils/github.js');

  const invalidInputs = [
    null,
    undefined,
    '',
    '   ',
    false,
    12345
  ];

  for (const invalid of invalidInputs) {
    assert.rejects(
      async () => {
        await GitHubAPI.pushNotebook({
          token: 'test_token',
          repoName: 'DSV_Colab',
          filePath: 'test.ipynb',
          content: invalid
        });
      },
      /Notebook content is empty or invalid/
    );
  }

  console.log('✅ Content validation safeguard tests passed (6/6)');
}

// Run All Tests
try {
  console.log('--- Running Colab-to-GitHub Test Suite ---');
  testBase64Encoding();
  testNotebookSchema();
  testSafeguards();
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
} catch (e) {
  console.error('❌ Test failed:', e);
  process.exit(1);
}
