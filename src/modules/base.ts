import { Binary, Event } from '../cw-interface';

export interface AppResponse {
  events: Event[];
  data: Binary | null;
}
