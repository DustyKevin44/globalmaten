# globalmaten
A prototype of a way to scale nationsmaten locally or even globally with review api, parsing, ai review and adding to the database and displaying the pub/local 

## Restaurant scan API

`POST /api/restaurants/scan` searches Google Places, downloads the first available
place photo, analyzes it with Gemini, and saves the restaurant and menu items to
PostgreSQL.

### Configuration

Use Node.js 18 or newer and set these environment variables:

- `DATABASE_URL` — PostgreSQL connection string
- `GOOGLE_PLACES_API_KEY` — Google Places API key
- `GEMINI_API_KEY` — Gemini API key
- `GEMINI_MODEL` — optional; defaults to `gemini-1.5-flash`
- `PORT` — optional; defaults to `3000`

The database must provide the tables in the project requirements and support
PostgreSQL's `gen_random_uuid()` function. `restaurants.place_id` must have a
UNIQUE constraint for race-safe duplicate detection.

The persistence uses these parameterized PostgreSQL statements:

```sql
INSERT INTO restaurants (id, place_id, name, lat, lng)
VALUES (gen_random_uuid(), $1, $2, $3, $4)
ON CONFLICT (place_id) DO NOTHING
RETURNING id, place_id, name, lat, lng;

SELECT id, place_id, name, lat, lng
FROM restaurants
WHERE place_id = $1;

INSERT INTO menu_items
  (id, restaurant_id, category, name, price, currency, ingredients)
VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::text[])
RETURNING id, restaurant_id, category, name, price, currency, ingredients;
```

Install dependencies and start the server with `npm install` and `npm start`.
Send a JSON request such as:

```json
{ "searchQuery": "Restaurant Name, City" }
```

On success, the endpoint responds with `{ "restaurant": { ... }, "menu_items": [...] }`.
