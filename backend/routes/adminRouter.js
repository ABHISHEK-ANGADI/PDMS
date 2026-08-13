// backend/routes/adminRouter.js
import express from "express";
import {
  loginAdmin,
  registerAdmin,
  getPendingPDs,
  getPendingCDs,
  getApprovedPDs,
  getPDDetail,
  getCDDetail,
  processPDReview,
  processCDReview,
  getAdminDashboardStats,
  compileCurriculumBook,
  checkProgramReadiness,
  getPDVersionsForAdmin,
  getCDVersionsForAdmin,
  getGroupedCDReviews,
  getAllPDsForAdmin,
  // ─── NEW IMPORTS ──────────────────────────────────────────────────────────
  downloadCurriculumBook,
  downloadCurriculumBookPD,
  previewCurriculumBook,
} from "../controllers/adminController.js";
import authAdmin from "../middlewares/adminAuth.js";

const adminRouter = express.Router();

// Public routes
adminRouter.post("/register", registerAdmin);
adminRouter.post("/login", loginAdmin);

// ─── PROTECTED ROUTES (require admin authentication) ─────────────────────
adminRouter.use(authAdmin);

// Dashboard
adminRouter.get("/dashboard-stats", getAdminDashboardStats);

// PD Reviews
adminRouter.get("/reviews/pds", getPendingPDs);
adminRouter.get("/approved/pds", getApprovedPDs);
adminRouter.get("/reviews/pd/:id", getPDDetail);
adminRouter.get("/reviews/pd/:programId/versions", getPDVersionsForAdmin);
adminRouter.put("/reviews/pd/:id", processPDReview);

// CD Reviews
adminRouter.get("/reviews/cds", getPendingCDs);
adminRouter.get("/reviews/cds/grouped", getGroupedCDReviews);
adminRouter.get("/reviews/cd/:id", getCDDetail);
adminRouter.get("/reviews/cd/:courseCode/versions", getCDVersionsForAdmin);
adminRouter.put("/reviews/cd/:id", processCDReview);

// Curriculum Compiler
adminRouter.get("/compiler/readiness/:programId", checkProgramReadiness);
adminRouter.get("/compiler/compile/:programId", compileCurriculumBook);

// ─── DOWNLOAD ROUTES ──────────────────────────────────────────────────────
adminRouter.get("/compiler/download/:programId", downloadCurriculumBook);
adminRouter.get("/compiler/download/pd/:programId", downloadCurriculumBookPD);

// ─── NEW: PREVIEW ROUTE (returns HTML and TOC for frontend) ──────────────
adminRouter.get("/compiler/preview/:programId", previewCurriculumBook);

// Admin PD List
adminRouter.get("/pds/all", getAllPDsForAdmin);

export default adminRouter;