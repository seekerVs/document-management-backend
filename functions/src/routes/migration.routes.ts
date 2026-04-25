import { Router } from "express";
import { backfillUsers } from "../controllers/migration.controller.js";

const router = Router();

// POST /api/migration/backfill-users
router.post("/backfill-users", backfillUsers);

export default router;
