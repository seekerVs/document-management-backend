import { Request, Response } from "express";
import { ContactsService } from "../services/contacts.service.js";
import { ApiResponse } from "../types/index.js";

const contactsService = new ContactsService();

// GET /api/contacts/search?query=xxx
export const searchContacts = async (req: Request, res: Response): Promise<void> => {
  const query = req.query.query as string;
  if (!query) {
    res.status(400).json({ success: false, message: "Query parameter is required." } as ApiResponse);
    return;
  }

  try {
    const results = await contactsService.searchUsers(query);
    res.status(200).json({ success: true, message: "Search complete", data: results });
  } catch (error: any) {
    console.error("[searchContacts] Error:", error);
    res.status(500).json({ success: false, message: "Failed to search contacts." } as ApiResponse);
  }
};

// POST /api/contacts/request
export const sendRequest = async (req: Request, res: Response): Promise<void> => {
  const senderUid = req.user?.uid;
  const { targetUid } = req.body;

  if (!senderUid || !targetUid) {
    res.status(400).json({ success: false, message: "Missing sender or target UID." } as ApiResponse);
    return;
  }

  try {
    await contactsService.sendRequest(senderUid, targetUid);
    res.status(200).json({ success: true, message: "Contact request sent." } as ApiResponse);
  } catch (error: any) {
    console.error("[sendRequest] Error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to send request." } as ApiResponse);
  }
};

// POST /api/contacts/accept
export const acceptRequest = async (req: Request, res: Response): Promise<void> => {
  const receiverUid = req.user?.uid;
  const { senderUid } = req.body;

  if (!receiverUid || !senderUid) {
    res.status(400).json({ success: false, message: "Missing receiver or sender UID." } as ApiResponse);
    return;
  }

  try {
    await contactsService.acceptRequest(receiverUid, senderUid);
    res.status(200).json({ success: true, message: "Contact request accepted." } as ApiResponse);
  } catch (error: any) {
    console.error("[acceptRequest] Error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to accept request." } as ApiResponse);
  }
};

// POST /api/contacts/decline
// POST /api/contacts/remove
export const declineOrRemove = async (req: Request, res: Response): Promise<void> => {
  const uidA = req.user?.uid;
  const { targetUid } = req.body;

  if (!uidA || !targetUid) {
    res.status(400).json({ success: false, message: "Missing user UIDs." } as ApiResponse);
    return;
  }

  try {
    await contactsService.declineOrRemove(uidA, targetUid);
    res.status(200).json({ success: true, message: "Contact removed/declined." } as ApiResponse);
  } catch (error: any) {
    console.error("[declineOrRemove] Error:", error);
    res.status(500).json({ success: false, message: "Failed to remove contact." } as ApiResponse);
  }
};

// POST /api/contacts/favorite
export const toggleFavorite = async (req: Request, res: Response): Promise<void> => {
  const uid = req.user?.uid;
  const { targetUid } = req.body;

  if (!uid || !targetUid) {
    res.status(400).json({ success: false, message: "Missing user UIDs." } as ApiResponse);
    return;
  }

  try {
    await contactsService.toggleFavorite(uid, targetUid);
    res.status(200).json({ success: true, message: "Favorite toggled." } as ApiResponse);
  } catch (error: any) {
    console.error("[toggleFavorite] Error:", error);
    res.status(500).json({ success: false, message: "Failed to toggle favorite." } as ApiResponse);
  }
};
