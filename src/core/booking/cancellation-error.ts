export class CancellationChangedError extends Error {
  constructor() {
    super("The visit changed. Reload and review it before cancelling.");
    this.name = "CancellationChangedError";
  }
}
