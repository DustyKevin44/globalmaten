import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { app } from '../src/app.js';
import { parseMenuItems } from '../src/services/restaurantScan.js';

test('scan endpoint rejects missing or blank searchQuery', async (t) => {
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => server.close());

  const { port } = server.address();
  for (const body of [{}, { searchQuery: '  ' }, { searchQuery: 12 }]) {
    const response = await fetch(`http://127.0.0.1:${port}/api/restaurants/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'searchQuery must be a non-empty string'
    });
  }
});

test('menu parser accepts valid structured menu data', () => {
  const items = parseMenuItems(JSON.stringify({
    menu_items: [{
      category: 'Main',
      name: 'Example dish',
      price: 125,
      currency: 'SEK',
      ingredients: ['potato', 'herbs']
    }]
  }));

  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Example dish');
});

test('menu parser rejects malformed JSON and invalid item fields', () => {
  assert.throws(() => parseMenuItems('not json'), /invalid menu JSON/);
  assert.throws(
    () => parseMenuItems(JSON.stringify({ menu_items: [{ name: 'Missing fields' }] })),
    /invalid shape/
  );
});
