import { Router } from 'express';
import { eventsController } from '../controllers/eventsController';
import { playersController } from '../controllers/playersController';
import { listHistoricalPersons, publicStats } from "../db/db";

export const publicRouter = Router();

// IMPORTANT: /events/year/:year MUST be registered before /events/:eventKey.
// Express matches routes in registration order. Without this ordering,
// the literal segment "year" would be captured as the :eventKey param,
// which would fail PUBLIC_EVENT_KEY_PATTERN validation and return 404
// instead of routing to the year archive page.
publicRouter.get('/', (_req, res) => {
  const stats = publicStats.counts.get() as { event_count: number; player_count: number; year_count: number };
  res.render('home', { pageTitle: 'Home', stats });
});
publicRouter.get('/events',              eventsController.landing);
publicRouter.get('/events/year/:year',   eventsController.year);
publicRouter.get('/events/:eventKey',    eventsController.event);
publicRouter.get('/players/:personId',   playersController.detail);
publicRouter.get("/players", (req, res) => {
  const players = listHistoricalPersons() as { country?: string }[];
  const playerCount = players.length;
  const countryCount = new Set(
    players.map(p => p.country).filter(c => c && c !== 'Global')
  ).size;
  res.render("players/index", { players, playerCount, countryCount, pageTitle: "Players" });
});
