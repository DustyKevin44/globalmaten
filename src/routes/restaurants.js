import { Router } from 'express';
import { scanRestaurant } from '../services/restaurantScan.js';

export const restaurantsRouter = Router();

restaurantsRouter.post('/scan', async (req, res, next) => {
  const { searchQuery } = req.body ?? {};
  if (typeof searchQuery !== 'string' || !searchQuery.trim()) {
    return res.status(400).json({
      error: 'searchQuery must be a non-empty string'
    });
  }

  try {
    const result = await scanRestaurant(searchQuery.trim());
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
