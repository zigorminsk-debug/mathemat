import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compileBook, serializedBook } from '../scripts/build-content.mjs';

const { book, mathCount } = compileBook();
const lessons = book.chapters.flatMap(c => c.lessons);

test('the full curriculum is present with distinct, substantive lessons', () => {
  assert.equal(book.chapters.length, 14);
  assert.equal(lessons.length, 42);
  assert.ok(mathCount > 1000, 'formulas must be pre-rendered offline');
  for (const lesson of lessons) {
    assert.ok(lesson.plain.length > 900, lesson.id);
    assert.equal((lesson.html.match(/<details>/g) || []).length, 2, lesson.id);
    assert.match(lesson.html, /katex-mathml/, lesson.id);
    assert.doesNotMatch(lesson.html, /ParseError|KaTeX parse error/, lesson.id);
  }
});

test('generated content is reproducible and committed', () => {
  assert.equal(fs.readFileSync('app/src/main/assets/content.js', 'utf8'), serializedBook(book));
});

test('each packaged web resource is local and exists', () => {
  const assets = 'app/src/main/assets';
  const html = fs.readFileSync(path.join(assets, 'index.html'), 'utf8');
  assert.match(html, /lang="ru"/);
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /https?:\/\//);
  for (const file of ['app.js', 'styles.css', 'content.js', 'vendor/katex/katex.min.css']) {
    assert.ok(fs.existsSync(path.join(assets, file)), file);
  }
  const css = fs.readFileSync(path.join(assets, 'styles.css'), 'utf8');
  for (const match of css.matchAll(/url\(['"]?([^)'" ]+)/g)) {
    assert.ok(fs.existsSync(path.join(assets, match[1])), match[1]);
  }
  const katex = fs.readFileSync(path.join(assets, 'vendor/katex/katex.min.css'), 'utf8');
  for (const match of katex.matchAll(/url\((fonts\/[^)]+\.woff2)\)/g)) {
    assert.ok(fs.existsSync(path.join(assets, 'vendor/katex', match[1])), match[1]);
  }
});

test('Android application does not request internet permission', () => {
  const manifest = fs.readFileSync('app/src/main/AndroidManifest.xml', 'utf8');
  assert.doesNotMatch(manifest, /<uses-permission[^>]+INTERNET/);
  assert.match(manifest, /usesCleartextTraffic="false"/);
  const gradle = fs.readFileSync('app/build.gradle', 'utf8');
  assert.match(gradle, /applicationId 'by\.mathemat\.predel'/);
  assert.match(gradle, /applicationIdSuffix '\.preview'/);
  assert.match(gradle, /MATHEMAT_KEYSTORE_PATH/);
});
