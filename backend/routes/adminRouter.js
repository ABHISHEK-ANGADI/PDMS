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
  // ─── FRONT MATTER PAGES IMPORTS ─────────────────────────────────────────
  getFrontMatterPages, 
  saveFrontMatterPage,
  getFrontMatterPage,
  resetFrontMatterPage ,
  uploadFrontMatterImage,
  getApprovedCDsForProgram,
  getCDByCourseCode,
  getCDDetailById,
  remindPDCreators,
  notifyPDNewAssignees,
  syncPDAssignees,
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
adminRouter.post("/reviews/pd/:id/remind", remindPDCreators);
adminRouter.post("/reviews/pd/:id/notify-new", notifyPDNewAssignees);
adminRouter.post("/reviews/pd/:id/sync-assignees", syncPDAssignees);

// CD Reviews
adminRouter.get("/reviews/cds", getPendingCDs);
adminRouter.get("/reviews/cds/grouped", getGroupedCDReviews);
adminRouter.get("/reviews/cd/:id", getCDDetail);
adminRouter.get("/reviews/cd/:courseCode/versions", getCDVersionsForAdmin);
adminRouter.put("/reviews/cd/:id", processCDReview);



// Curriculum Compiler
adminRouter.get("/compiler/readiness/:programId", checkProgramReadiness);
adminRouter.get("/compiler/compile/:programId", compileCurriculumBook);


// Admin PD List
adminRouter.get("/pds/all", getAllPDsForAdmin);

// ─── FRONT MATTER PAGES ROUTES ───────────────────────────────────────────

// Get all front matter pages
adminRouter.get('/compiler/frontmatter/pages', getFrontMatterPages);

// Get a single front matter page
adminRouter.get('/compiler/frontmatter/page/:pageName', getFrontMatterPage);

// Save a front matter page
adminRouter.post('/compiler/frontmatter/save', saveFrontMatterPage);

// Reset a front matter page to default
adminRouter.post('/compiler/frontmatter/reset/:pageName', resetFrontMatterPage);

// ─── NEW: IMAGE UPLOAD ROUTE ─────────────────────────────────────────────
adminRouter.post('/compiler/frontmatter/image', uploadFrontMatterImage);


adminRouter.get("/compiler/program/:programId/cds", getApprovedCDsForProgram);
adminRouter.get("/compiler/cd/:courseCode", getCDByCourseCode);
adminRouter.get("/compiler/cd-by-id/:id", getCDDetailById);

export default adminRouter;