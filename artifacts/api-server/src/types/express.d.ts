// Augments the global Express namespace so that req.user is typed throughout
// the application. Requires "express" in tsconfig "types" array.
declare namespace Express {
  interface Request {
    user?: {
      userId: string;
      sessionId: string;
    };
  }
}
