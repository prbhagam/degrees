// Owner: Christian (Server & Infra)
import { handle } from 'hono/netlify';
import { app } from '../../src/app.ts';

export default handle(app);
