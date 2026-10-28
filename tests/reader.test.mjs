import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const assets = 'app/src/main/assets/';
const html = fs.readFileSync(assets + 'index.html', 'utf8');
const content = fs.readFileSync(assets + 'content.js', 'utf8');
const app = fs.readFileSync(assets + 'app.js', 'utf8');
const key = 'predel.reader.v1';
function reader(saved, hash = '') {
  const dom = new JSDOM(html, { url: `https://appassets.androidplatform.net/assets/index.html${hash}`, runScripts: 'outside-only' });
  dom.window.scrollTo = () => {};
  if (saved !== undefined) dom.window.localStorage.setItem(key, saved);
  dom.window.eval(content);
  dom.window.eval(app);
  return dom;
}
function click(doc, selector) {
  const node = doc.querySelector(selector);
  assert.ok(node, `Expected ${selector}`);
  node.click();
}

test('reading, bookmarking and completion survive a reload', () => {
  const dom = reader();
  const doc = dom.window.document;
  assert.match(doc.querySelector('h1').textContent, /Понятнее/);
  click(doc, '.hero-button');
  assert.match(doc.querySelector('h1').textContent, /Логика и кванторы/);
  assert.equal(doc.querySelectorAll('.lesson-content details').length, 2);
  click(doc, '.reading-bookmark');
  click(doc, '[data-complete]');
  const saved = dom.window.localStorage.getItem(key);
  const data = JSON.parse(saved);
  assert.deepEqual(data.bookmarks, ['quantifiers']);
  assert.deepEqual(data.completed, ['quantifiers']);
  const reopened = reader(saved, '#bookmarks');
  assert.equal(reopened.window.document.querySelectorAll('.lesson-card').length, 1);
  assert.match(reopened.window.document.querySelector('.lesson-card').textContent, /Логика и кванторы/);
  click(reopened.window.document, '[data-go="catalog"]');
  assert.match(reopened.window.document.querySelector('.catalog-summary').textContent, /1\s*\/\s*42/);
  dom.window.close(); reopened.window.close();
});

test('full text search, query suggestions and safe rendering', () => {
  const dom = reader(undefined, '#search');
  const doc = dom.window.document;
  const input = doc.querySelector('#search-input');
  input.value = 'Гёльдера';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.match(doc.querySelector('#search-results').textContent, /Пространства L/);
  input.value = '<img src=x onerror=alert(1)>';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(doc.querySelector('#search-results img'), null);
  assert.match(doc.querySelector('#search-results').textContent, /Ничего не найдено/);
  click(doc, '[data-action="clear-search"]');
  click(doc, '[data-query="интеграл"]');
  assert.ok(doc.querySelectorAll('#search-results .lesson-card').length > 5);
  dom.window.close();
});

test('settings persist; reset requires confirmation and keeps font size', () => {
  const dom = reader(undefined, '#settings');
  const doc = dom.window.document;
  click(doc, '[data-font="large"]');
  assert.equal(doc.documentElement.dataset.fontSize, 'large');
  click(doc, '[data-action="confirm-reset"]');
  assert.ok(doc.querySelector('[data-action="reset"]'));
  click(doc, '[data-action="reset"]');
  const data = JSON.parse(dom.window.localStorage.getItem(key));
  assert.equal(data.fontSize, 'large');
  assert.deepEqual(data.bookmarks, []);
  dom.window.close();
});

test('invalid saved data and invalid deep links are harmless', () => {
  const dom = reader('{broken', '#lesson/nonexistent');
  assert.match(dom.window.document.querySelector('h1').textContent, /Понятнее/);
  assert.equal(dom.window.location.hash, '#home');
  assert.equal(dom.window.Predel.back(), false);
  dom.window.close();
});
