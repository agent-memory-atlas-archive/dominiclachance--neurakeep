export class UmosError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UmosError";
  }
}

