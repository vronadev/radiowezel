import type { IClock } from "../interfaces/IClock.js";

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}
