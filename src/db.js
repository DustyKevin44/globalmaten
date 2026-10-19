import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function saveRestaurantAndMenu(restaurant, menuItems) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO restaurants (id, place_id, name, lat, lng)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       ON CONFLICT (place_id) DO NOTHING
       RETURNING id, place_id, name, lat, lng`,
      [restaurant.placeId, restaurant.name, restaurant.lat, restaurant.lng]
    );

    const restaurantResult = inserted.rowCount
      ? inserted
      : await client.query(
          `SELECT id, place_id, name, lat, lng
           FROM restaurants
           WHERE place_id = $1`,
          [restaurant.placeId]
        );

    if (!restaurantResult.rowCount) {
      throw new Error('Restaurant was not available after insert conflict');
    }

    const savedRestaurant = restaurantResult.rows[0];
    const savedMenuItems = [];

    for (const item of menuItems) {
      const result = await client.query(
        `INSERT INTO menu_items
           (id, restaurant_id, category, name, price, currency, ingredients)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::text[])
         RETURNING id, restaurant_id, category, name, price, currency, ingredients`,
        [
          savedRestaurant.id,
          item.category,
          item.name,
          item.price,
          item.currency,
          item.ingredients
        ]
      );
      savedMenuItems.push(result.rows[0]);
    }

    await client.query('COMMIT');
    return { restaurant: savedRestaurant, menu_items: savedMenuItems };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back restaurant scan transaction', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}
