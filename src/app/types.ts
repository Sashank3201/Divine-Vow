import type { Cosmos, CameraPreset } from './cosmos';
import type { Router } from './router';

export interface AppContext {
  cosmos: Cosmos;
  router: Router;
  reduced: boolean;
}

export interface View {
  el: HTMLElement;
  /** Camera preset the cosmos glides to while this view is shown. */
  preset?: CameraPreset | 'none';
  /** Vertical lens shift for the preset (keeps the galaxy clear of UI). */
  shiftY?: number;
  /** Called once the element is in the document. */
  enter?(): void;
  /** Custom exit animation (e.g. a sheet shrinking back into its button). */
  leave?(nextPath: string): Promise<void>;
  /** Called after the exit animation, before removal. */
  destroy?(): void;
}

export type ViewFactory = (ctx: AppContext, params: URLSearchParams) => View;
