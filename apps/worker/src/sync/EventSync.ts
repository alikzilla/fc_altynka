import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

export class EventSync extends DurableObject<Env> {}
