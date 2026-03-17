import { Router } from 'express';
import { homeController } from '../controllers/homeController';
import { clubController } from '../controllers/clubController';
import { eventController } from '../controllers/eventController';
import { memberController } from '../controllers/memberController';

export const publicRouter = Router();

publicRouter.get('/',      homeController.home);
publicRouter.get('/clubs', clubController.index);

// IMPORTANT: /events/year/:year MUST be registered before /events/:eventKey.
// Express matches routes in registration order. Without this ordering,
// the literal segment "year" would be captured as the :eventKey param,
// which would fail PUBLIC_EVENT_KEY_PATTERN validation and return 404
// instead of routing to the year archive page.
publicRouter.get('/events',              eventController.landing);
publicRouter.get('/events/year/:year',   eventController.year);
publicRouter.get('/events/:eventKey',    eventController.event);

publicRouter.get('/members',             memberController.index);
publicRouter.get('/members/:personId',   memberController.detail);
