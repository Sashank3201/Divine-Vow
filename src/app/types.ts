import type { Cosmos, CameraPreset } from './cosmos';
import type { Router } from './router';

export interface AppContext {
  cosmos: Cosmos;
  router: Router;
  reduced: boolean;
}

export interface View {
  el: HTMLElement;
  /** Camera preset the cosmos should glide to while this view is shown. */
  preset?: CameraPreset | 'none';
  /** Called once the element is in the document. */
  enter?(): void;
  /** Called after the exit animation, before removal. */
  destroy?(): void;
}

export type ViewFactory = (ctx: AppContext, params: URLSearchParams) => View;
