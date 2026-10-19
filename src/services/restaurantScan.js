import { saveRestaurantAndMenu } from '../db.js';

const PLACES_BASE_URL = 'https://places.googleapis.com/v1';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MENU_INSTRUCTION =
  'Analyze this restaurant menu image. Extract all food items, categories, prices, and ingredients. Return ONLY a valid JSON object matching this schema: { "menu_items": [ { "category": "String", "name": "String", "price": Number, "currency": "SEK", "ingredients": ["String"] } ] }.';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function requestJson(url, options, failureMessage) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new HttpError(502, failureMessage);
  }

  if (!response.ok) {
    throw new HttpError(502, failureMessage);
  }

  try {
    return await response.json();
  } catch {
    throw new HttpError(502, failureMessage);
  }
}

async function findPlace(searchQuery, apiKey) {
  const result = await requestJson(
    `${PLACES_BASE_URL}/places:searchText`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location'
      },
      body: JSON.stringify({ textQuery: searchQuery })
    },
    'Google Places search failed'
  );

  const place = result.places?.[0];
  if (!place?.id || !place.displayName?.text || !place.location) {
    throw new HttpError(404, 'No matching restaurant was found');
  }

  return {
    placeId: place.id,
    name: place.displayName.text,
    lat: place.location.latitude,
    lng: place.location.longitude
  };
}

async function getFirstPhotoUri(placeId, apiKey) {
  const details = await requestJson(
    `${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'photos'
      }
    },
    'Google Places details request failed'
  );

  const photoName = details.photos?.[0]?.name;
  if (!photoName) {
    throw new HttpError(422, 'The restaurant has no available menu photo');
  }

  const photoUrl = new URL(`${PLACES_BASE_URL}/${photoName}/media`);
  photoUrl.searchParams.set('maxWidthPx', '1600');
  photoUrl.searchParams.set('skipHttpRedirect', 'true');
  photoUrl.searchParams.set('key', apiKey);

  const photo = await requestJson(
    photoUrl,
    {},
    'Google Places photo request failed'
  );

  if (!photo.photoUri) {
    throw new HttpError(422, 'Google Places did not return a photo URL');
  }
  return photo.photoUri;
}

async function downloadImage(photoUri) {
  let response;
  try {
    response = await fetch(photoUri);
  } catch {
    throw new HttpError(502, 'Restaurant photo download failed');
  }

  if (!response.ok) {
    throw new HttpError(502, 'Restaurant photo download failed');
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0];
  if (!mimeType?.startsWith('image/')) {
    throw new HttpError(502, 'Restaurant photo URL did not return an image');
  }

  return {
    mimeType,
    base64: Buffer.from(await response.arrayBuffer()).toString('base64')
  };
}

export function parseMenuItems(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const jsonText = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (!jsonText) {
      throw new HttpError(502, 'Gemini returned invalid menu JSON');
    }
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new HttpError(502, 'Gemini returned invalid menu JSON');
    }
  }

  if (!Array.isArray(parsed?.menu_items)) {
    throw new HttpError(502, 'Gemini response is missing menu_items');
  }

  for (const item of parsed.menu_items) {
    if (
      typeof item.category !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.price !== 'number' ||
      !Number.isFinite(item.price) ||
      typeof item.currency !== 'string' ||
      !Array.isArray(item.ingredients) ||
      !item.ingredients.every((ingredient) => typeof ingredient === 'string')
    ) {
      throw new HttpError(502, 'Gemini returned a menu item with an invalid shape');
    }
  }

  return parsed.menu_items;
}

async function analyzeMenu(image, apiKey) {
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = new URL(`${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`);
  url.searchParams.set('key', apiKey);

  const result = await requestJson(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: MENU_INSTRUCTION },
            {
              inline_data: {
                mime_type: image.mimeType,
                data: image.base64
              }
            }
          ]
        }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    },
    'Gemini menu analysis failed'
  );

  const text = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();
  if (!text) {
    throw new HttpError(502, 'Gemini returned no menu analysis');
  }

  return parseMenuItems(text);
}

export async function scanRestaurant(searchQuery) {
  requiredEnv('DATABASE_URL');
  const placesApiKey = requiredEnv('GOOGLE_PLACES_API_KEY');
  const geminiApiKey = requiredEnv('GEMINI_API_KEY');
  const restaurant = await findPlace(searchQuery, placesApiKey);
  const photoUri = await getFirstPhotoUri(restaurant.placeId, placesApiKey);
  const image = await downloadImage(photoUri);
  const menuItems = await analyzeMenu(image, geminiApiKey);

  return saveRestaurantAndMenu(restaurant, menuItems);
}
