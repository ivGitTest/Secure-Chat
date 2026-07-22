import { Router, type IRouter } from "express";
import healthRouter from "./health";
import v1Router from "./v1/index";

const router: IRouter = Router();

// Legacy health check
router.use(healthRouter);

// API v1
router.use("/v1", v1Router);

export default router;
