import express from 'express';
import { restaurantsRouter } from './routes/restaurants.js';

export const app = express();

app.use(express.json({ limit: '1mb' }));
app.use('/api/restaurants', restaurantsRouter);

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: status === 500 ? 'Internal server error' : error.message
  });
});
