// page_view for the simple pages (/agentes, /condiciones, /caso). The landing sends its own from app.js.
import { track } from './track.js';
track('page_view', { page: location.pathname });
