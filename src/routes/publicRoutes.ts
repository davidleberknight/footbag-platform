import { Router } from 'express';
import { eventsController } from '../controllers/eventsController';

export const publicRouter = Router();

// IMPORTANT: /events/year/:year MUST be registered before /events/:eventKey.
// Express matches routes in registration order. Without this ordering,
// the literal segment "year" would be captured as the :eventKey param,
// which would fail PUBLIC_EVENT_KEY_PATTERN validation and return 404
// instead of routing to the year archive page.
publicRouter.get('/events',              eventsController.landing);
publicRouter.get('/events/year/:year',   eventsController.year);
publicRouter.get('/events/:eventKey',    eventsController.event);
