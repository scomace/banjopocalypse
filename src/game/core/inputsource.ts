// The netcode seam, realized. The play scene pulls each tick's commands
// from an InputSource instead of reading the keyboard directly:
//   - LocalInputSource wraps the sampler (couch play, unchanged behavior)
//   - ReplayInputSource feeds a recorded log back through the same sim
//   - the online mode (D6) adds a source that buffers remote streams and
//     returns null until every player's commands for the tick have arrived
// Returning null stalls the sim for the frame; the scene just waits.

import type { InputSampler } from "./input";
import type { SimInputs } from "../sim/types";

export interface InputSource {
  /** Commands for tick `tick` (== sim.tick before stepping), or null to
   *  stall the sim this frame. */
  poll(tick: number): SimInputs | null;
}

export class LocalInputSource implements InputSource {
  constructor(private sampler: InputSampler) {}
  poll(): SimInputs {
    return [this.sampler.sample(0), this.sampler.sample(1)];
  }
}

export class ReplayInputSource implements InputSource {
  /** True once the log ran out: the sim is held on its final state. */
  done = false;
  constructor(private log: number[][]) {}
  poll(tick: number): SimInputs | null {
    const row = this.log[tick];
    if (!row) {
      this.done = true;
      return null;
    }
    return row;
  }
}
