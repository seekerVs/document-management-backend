import { Router } from "express";
import {
  searchContacts,
  sendRequest,
  acceptRequest,
  declineOrRemove,
  toggleFavorite,
} from "../controllers/contacts.controller.js";

const router = Router();

router.get("/search", searchContacts);
router.post("/request", sendRequest);
router.post("/accept", acceptRequest);
router.post("/decline", declineOrRemove);
router.post("/remove", declineOrRemove);
router.post("/favorite", toggleFavorite);

export default router;
