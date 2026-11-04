// backend/controllers/adminController.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Admin from "../models/Admin.js";
import Creater from "../models/Creater.js";
import ProgramDocument from "../models/pd/ProgramDocument.js";
import CourseDocument from "../models/cd/CourseDocument.js";
import PD from "../models/pd/PD.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { generateDocument, getDocumentInfo } from "../services/docGenerator.js";
import nodemailer from "nodemailer";

// Get __dirname 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ─── PDF GENERATION IMPORTS ───────────────────────────────────────────────
import { generateCurriculumHTML, buildTOCItems } from "../utils/curriculumHtmlGenerator.js";
import { generateCurriculumPDF } from "../services/pdfGenerator.js";
import { PDFDocument } from "pdf-lib";
import { decoratePDF } from "../utils/headerFooter.js";

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Resolve the admin's jurisdiction into a list of Creater ObjectIds.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Helper: Find PD by either _id (ObjectId) or program_id (string) ───
const findPDByIdOrProgramId = async (identifier, adminId) => {
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);
  const query = isObjectId ? { _id: identifier } : { program_id: identifier };
  query.approved_by = adminId;
  return await PD.findOne(query).populate("created_by", "name email");
};

const buildFormattedCD = (cd) => {
  const s1 = cd.section1_identity || {};
  const s2 = cd.section2_outcomes || {};
  const s3 = cd.section3_syllabus || {};
  const s4 = cd.section4_resources || {};

  return {
    // ── Master ──
    _id: cd._id,
    courseCode: cd.courseCode,
    courseTitle: cd.courseTitle,
    programName: cd.programName,
    cdVersion: cd.cdVersion,
    status: cd.status,
    pdVersion: cd.pdVersion || null,
    pdId: cd.pdId || null,
    rejectionMessage: cd.rejectionMessage || "",
    reviewComment: cd.reviewComment || "",
    createdAt: cd.createdAt,
    updatedAt: cd.updatedAt,

    // ── Section 1 ──
    ...(s1.identity || {}),
    identity: s1.identity || {},
    credits: s1.credits || { L: 0, T: 0, P: 0, total: 0 },
    totalHours: s1.identity?.totalHours || 0,

    // ── Section 2 ──
    aimsSummary: s2.aimsSummary || "",
    objectives: s2.objectives || "",
    courseOutcomes: s2.courseOutcomes || [],
    courseOutcomesHtml: s2.courseOutcomesHtml || "",
    outcomeMap: s2.outcomeMap || { matrix: [] },
    outcomeMapHtml: s2.outcomeMapHtml || "",
    onlineResources: s2.onlineResources || s4.onlineResources || [],

    // ── Section 3 ──
    courseContent: s3.courseContent || "",
    teaching: s3.teaching || [],
    teachingHtml: s3.teachingHtml || "",

    // ── Section 4 ──
    resources: s4.resources || { textBooks: [], references: [], otherResources: [] },
    assessmentWeight: s4.assessmentWeight || [],
    assessmentWeightHtml: s4.assessmentWeightHtml || "",
    scheduleOfAssessments: s4.scheduleOfAssessments || {
      weeks: ["0-4", "5-8", "9", "10-13", "14-16", "17", "18-20", "21-26"],
      rows: { quiz: [], assignment: [], pbl: [], term1: [], term2: [], makeup: [] }
    },
    scheduleHtml: s4.scheduleHtml || "",
    passingCriterion: s4.passingCriterion || "",
    gradingCriterion: s4.gradingCriterion || "",
    attainmentTargets: s4.attainmentTargets || [],
    attainmentTargetsHtml: s4.attainmentTargetsHtml || "",
    performanceRecording: s4.performanceRecording || {},
    performanceRecordingHtml: s4.performanceRecordingHtml || "",
    cabAnalysis: s4.cabAnalysis || { analysisNotes: "" },
    coAttainmentMapping: s4.coAttainmentMapping || [],
    coAttainmentMappingHtml: s4.coAttainmentMappingHtml || "",
    feedback: s4.feedback || [],
    feedbackHtml: s4.feedbackHtml || "",
    otherDetails: s4.otherDetails || { assignmentDetails: "", academicIntegrity: "" },
  };
};
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

export const uploadImage = upload.single('image');

const getJurisdictionFilter = async (admin) => {
  const createrQuery = {};
  if (admin.faculty) createrQuery.faculty = admin.faculty;
  if (admin.school) createrQuery.school = admin.school;
  if (admin.department) createrQuery.department = admin.department;

  if (Object.keys(createrQuery).length === 0) return {};

  const creators = await Creater.find(createrQuery).select("_id");
  if (creators.length === 0) return { createdBy: { $in: [] } };

  return { createdBy: { $in: creators.map((c) => c._id) } };
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────

export const registerAdmin = async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      college,
      faculty,
      school,
      department,
      programme,
      discipline,
      programId,
      programName,
    } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: "Email, password and name are required",
      });
    }

    const existing = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Admin email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      name: name.trim(),
      college: college || "GM University",
      faculty,
      school,
      department,
      programme,
      discipline,
      programId,
      programName,
      role: "admin",
      status: "inactive",
    });

    res.status(201).json({
      success: true,
      message: "Registration submitted. Await developer approval.",
      admin: { id: admin._id, email: admin.email, name: admin.name },
    });
  } catch (error) {
    console.error("registerAdmin:", error);
    res.status(500).json({ success: false, message: "Registration failed" });
  }
};

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    if (admin.blocked)
      return res
        .status(403)
        .json({ success: false, message: "Admin account is blocked." });
    if (admin.status !== "active")
      return res
        .status(403)
        .json({ success: false, message: "Account pending approval." });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });

    admin.last_login = new Date();
    await admin.save();

    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET,
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        jurisdiction: {
          faculty: admin.faculty || null,
          school: admin.school || null,
          department: admin.department || null,
        },
      },
    });
  } catch (error) {
    console.error("loginAdmin:", error);
    res.status(500).json({ success: false, message: "Login failed" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. DASHBOARD & STATISTICS
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminDashboardStats = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const filter = await getJurisdictionFilter(req.admin);

    const [
      pendingPDsCount,
      pendingCDsCount,
      approvedProgramsCount,
      recentPDs,
      recentCDs,
    ] = await Promise.all([
      PD.countDocuments({ status: "under_review", approved_by: adminId }),
      CourseDocument.countDocuments({ status: "UnderReview", ...filter }),
      PD.countDocuments({ status: "approved", approved_by: adminId }),
      PD.find({
        status: { $in: ["approved", "under_review", "draft"] },
        approved_by: adminId,
      })
        .sort({ updated_at: -1 })
        .limit(4)
        .select("program_id program_name status updated_at version_no"),
      CourseDocument.find({
        status: { $in: ["Approved", "UnderReview", "Draft"] },
        ...filter,
      })
        .sort({ updatedAt: -1 })
        .limit(4)
        .select("courseCode courseTitle status updatedAt cdVersion"),
    ]);

    const normalizedPDs = recentPDs.map((pd) => ({
      _id: pd._id,
      programCode: pd.program_id,
      programName: pd.program_name,
      status: pd.status,
      updatedAt: pd.updated_at,
      pdVersion: pd.version_no,
    }));

    const recentActivity = [...normalizedPDs, ...recentCDs]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 6);

    res.status(200).json({
      success: true,
      stats: {
        pendingPDs: pendingPDsCount,
        pendingCDs: pendingCDsCount,
        approvedPrograms: approvedProgramsCount,
      },
      recentActivity,
    });
  } catch (error) {
    console.error("getAdminDashboardStats:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPendingPDs = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const pds = await PD.find({ status: "under_review", approved_by: adminId })
      .populate(
        "created_by",
        "name email designation department school faculty",
      )
      .sort({ updated_at: -1 });

    res.status(200).json({ success: true, pds });
  } catch (error) {
    console.error("getPendingPDs:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPendingCDs = async (req, res) => {
  try {
    const filter = await getJurisdictionFilter(req.admin);

    const cds = await CourseDocument.find({ status: "UnderReview", ...filter })
      .populate("createdBy", "name email designation faculty school department")
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources")
      .sort({ updatedAt: -1 });

    const formattedCDs = cds.map((cd) => {
      const formatted = buildFormattedCD(cd);
      formatted._id = cd._id;
      formatted.createdBy = cd.createdBy;
      formatted.createdAt = cd.createdAt;
      formatted.updatedAt = cd.updatedAt;
      return formatted;
    });

    res.status(200).json({ success: true, cds: formattedCDs });
  } catch (error) {
    console.error("getPendingCDs:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getApprovedPDs = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const pds = await PD.find({ status: "approved", approved_by: adminId })
      .populate("created_by", "name email")
      .sort({ updated_at: -1 });
    res.status(200).json({ success: true, pds });
  } catch (error) {
    console.error("getApprovedPDs:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPDDetail = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const pd = await PD.findOne({
      _id: req.params.id,
      approved_by: adminId,
    }).populate(
      "created_by",
      "name email faculty school department designation",
    );

    if (!pd)
      return res
        .status(404)
        .json({ success: false, message: "PD not found or access denied" });
    res.status(200).json({ success: true, pd });
  } catch (error) {
    console.error("getPDDetail:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCDDetail = async (req, res) => {
  try {
    const filter = await getJurisdictionFilter(req.admin);

    const cd = await CourseDocument.findOne({ _id: req.params.id, ...filter })
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources")
      .populate(
        "createdBy",
        "name email faculty school department designation",
      );

    if (!cd) {
      return res.status(404).json({
        success: false,
        message: "CD not found or access denied",
      });
    }

    res.status(200).json({ success: true, cd });
  } catch (error) {
    console.error("getCDDetail:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// 6. CURRICULUM COMPILER & VERSIONS (UPDATED FOR 2026 SCHEMA)
// ─────────────────────────────────────────────────────────────────────────────

export const checkProgramReadiness = async (req, res) => {
  try {
    const { programId } = req.params;
    const adminId = req.admin._id;

    const pd = await PD.findOne({ _id: programId, approved_by: adminId });

    if (!pd) {
      return res.status(404).json({
        success: false,
        message: "Program Document not found or access denied",
      });
    }

    const semesters = pd.pd_data?.semesters || [];
    let totalCourses = 0;
    let approvedCount = 0;

    const analysis = await Promise.all(
      semesters.map(async (sem) => {
        const courseResults = [];

        const processCourse = async (course) => {
          totalCourses++;
          const approvedCD = await CourseDocument.findOne({
            courseCode: course.code,
            status: "Approved",
          }).select("cdVersion updatedAt");

          if (approvedCD) {
            approvedCount++;
            courseResults.push({
              code: course.code,
              title: course.title,
              status: "Approved",
              version: approvedCD.cdVersion,
              lastUpdated: approvedCD.updatedAt,
            });
          } else {
            const pendingCD = await CourseDocument.findOne({
              courseCode: course.code,
              status: "UnderReview",
            });
            courseResults.push({
              code: course.code,
              title: course.title,
              status: pendingCD ? "Pending" : "Missing",
              version: null,
            });
          }
        };

        // 2024 Legacy handling
        if (sem.courses && sem.courses.length > 0) {
          for (const c of sem.courses) await processCourse(c);
        }

        // 2026 Categories handling
        if (sem.categories && sem.categories.length > 0) {
          for (const cat of sem.categories) {
            if (cat.courses) {
              for (const c of cat.courses) await processCourse(c);
            }
          }
        }

        return { number: sem.sem_no, courses: courseResults };
      }),
    );

    const completionPercentage =
      totalCourses > 0 ? Math.round((approvedCount / totalCourses) * 100) : 0;

    res.status(200).json({
      success: true,
      analysis: {
        programCode: pd.program_id,
        programName: pd.program_name,
        completionPercentage,
        totalApproved: approvedCount,
        totalRequired: totalCourses,
        semesters: analysis,
      },
    });
  } catch (error) {
    console.error("checkProgramReadiness:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPDVersionsForAdmin = async (req, res) => {
  try {
    const { programId } = req.params;
    const adminId = req.admin._id;

    const versions = await PD.find({
      program_id: programId,
      approved_by: adminId,
    })
      .populate("created_by", "name email")
      .select(
        "version_no status created_at updated_at program_name program_id pd_data change_summary review_comment scheme_year effective_ay",
      )
      .sort({ created_at: -1 });

    res.status(200).json({ success: true, versions });
  } catch (error) {
    console.error("getPDVersionsForAdmin:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCDVersionsForAdmin = async (req, res) => {
  try {
    const { courseCode } = req.params;
    const filter = await getJurisdictionFilter(req.admin);

    const versions = await CourseDocument.find({ courseCode, ...filter })
      .populate("createdBy", "name email")
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources")
      .sort({ createdAt: -1 });

    const formattedVersions = versions.map((cd) => {
      const formatted = buildFormattedCD(cd);
      formatted._id = cd._id;
      formatted.createdBy = cd.createdBy;
      formatted.createdAt = cd.createdAt;
      formatted.updatedAt = cd.updatedAt;
      formatted.change_summary = cd.reviewComment || cd.rejectionMessage || "";
      return formatted;
    });

    res.status(200).json({ success: true, versions: formattedVersions });
  } catch (error) {
    console.error("getCDVersionsForAdmin:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getGroupedCDReviews
//
// Returns ONE ROW per program. Each row contains:
//   • currentVersion  → newest approved PD (fallback: newest of any status)
//   • versions[]      → EVERY PD of that program (newest first)
//
// Each version carries its own courses[] and stats so the frontend can
// swap between versions client-side without extra round trips.
//
// Fields preserved on `version` objects so the frontend can render the
// full timeline metadata (badges, timestamps, authors, creator names).
// ─────────────────────────────────────────────────────────────────────────────
export const getGroupedCDReviews = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const filter = await getJurisdictionFilter(req.admin);

    // 1. Every PD this admin owns — ALL statuses, ALL versions, sorted
    //    newest first. This is the source of truth for the program list.
    const pds = await PD.find({ approved_by: adminId })
      .populate("created_by", "name email")
      .populate("approved_by", "name email")
      .select(
        "program_id program_name pd_data version_no status scheme_year " +
          "effective_ay updated_at created_at total_credits academic_credits",
      )
      .sort({ updated_at: -1, created_at: -1 });

    // 2. CDs in admin's jurisdiction, newest first
    const allCDs = await CourseDocument.find(filter)
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources")
      .sort({ updatedAt: -1 });

    // 3. Group CDs by course code — but keep the FULL version list per code
    //    so a versioned timeline can be built later if needed.
    const cdsByCode = new Map();
    allCDs.forEach((cd) => {
      if (!cdsByCode.has(cd.courseCode)) cdsByCode.set(cd.courseCode, []);
      cdsByCode.get(cd.courseCode).push(cd);
    });

    // Helper: resolve the best (freshest) CD per course code
    const latestCDFor = (code) => {
      const list = cdsByCode.get(code) || [];
      return list[0] || null;
    };

    // Helper: turn a PD's pd_data into the course list the reviewer sees
    const buildCoursesForPD = (pd) => {
      const pdCourses = [];
      const stats = {
        approved: 0,
        underReview: 0,
        draft: 0,
        missing: 0,
        total: 0,
      };

      const push = (courseObj, context) => {
        if (!courseObj || !courseObj.code) return;
        const code = courseObj.code;
        stats.total += 1;

        const cd = latestCDFor(code);
        if (cd) {
          if (cd.status === "Approved") stats.approved++;
          else if (cd.status === "UnderReview") stats.underReview++;
          else stats.draft++;

          pdCourses.push({
            courseCode: code,
            courseTitle: courseObj.title || cd.courseTitle,
            context,
            cdData: buildFormattedCD(cd),
            status: cd.status,
            cdVersion: cd.cdVersion,
            updatedAt: cd.updatedAt,
            createdBy: cd.createdBy,
            _id: cd._id,
          });
        } else {
          stats.missing++;
          pdCourses.push({
            courseCode: code,
            courseTitle: courseObj.title,
            context,
            cdData: null,
            status: "Missing",
            cdVersion: "-",
            updatedAt: null,
            createdBy: null,
            _id: null,
          });
        }
      };

      // 2024 + 2026 semester courses
      pd.pd_data?.semesters?.forEach((sem) => {
        sem.courses?.forEach((c) => push(c, `Semester ${sem.sem_no}`));
        sem.categories?.forEach((cat) =>
          cat.courses?.forEach((c) =>
            push(c, `Semester ${sem.sem_no} (${cat.categoryName})`),
          ),
        );
      });

      // 2024 electives
      pd.pd_data?.prof_electives?.forEach((grp) =>
        grp.courses?.forEach((c) => push(c, `Prof. Elective`)),
      );
      pd.pd_data?.open_electives?.forEach((grp) =>
        grp.courses?.forEach((c) => push(c, "Open Elective")),
      );

      // 2026 electives
      pd.pd_data?.section4?.professionalElectives?.forEach((grp) =>
        grp.courses?.forEach((c) => push(c, "Prof. Elective")),
      );
      pd.pd_data?.section4?.openElectives?.forEach((grp) =>
        grp.courses?.forEach((c) => push(c, "Open Elective")),
      );
      pd.pd_data?.section4?.technicalCompetencyCourses?.forEach((c) =>
        push(c, "Technical Competency"),
      );

      return { courses: pdCourses, stats };
    };

    // 4. Group PDs by program_id
    const byProgram = new Map(); // program_id → { meta, versions: [] }

    for (const pd of pds) {
      const key = pd.program_id || String(pd._id);
      if (!byProgram.has(key)) {
        byProgram.set(key, {
          programId: key,
          programCode: pd.program_id,
          programName: pd.program_name,
          versions: [],
        });
      }

      const { courses, stats } = buildCoursesForPD(pd);

      byProgram.get(key).versions.push({
        pdId: pd._id,
        programCode: pd.program_id,
        programName: pd.program_name,
        pdVersion: pd.version_no,
        pdStatus: pd.status,
        pdSchemeYear: pd.scheme_year || null,
        pdEffectiveAy: pd.effective_ay || null,
        pdUpdatedAt: pd.updated_at,
        pdCreatedAt: pd.created_at,
        pdCreatorName: pd.created_by?.name || "Admin",
        pdReviewerName: pd.approved_by?.name || null,
        pdTotalCredits: pd.total_credits ?? 0,
        pdAcademicCredits: pd.academic_credits ?? 0,
        stats,
        courses,
      });
    }

    // 5. For each program, sort versions newest-first and pick the current
    const programs = [];
    for (const [, entry] of byProgram.entries()) {
      // sort strictly by updatedAt descending (defensive — DB already sorted)
      entry.versions.sort(
        (a, b) =>
          new Date(b.pdUpdatedAt || 0) - new Date(a.pdUpdatedAt || 0),
      );

      // current = newest approved, fallback = newest of any status
      const currentApproved = entry.versions.find(
        (v) => v.pdStatus === "approved",
      );
      const current = currentApproved || entry.versions[0] || null;

      programs.push({
        programId: entry.programId,
        programCode: entry.programCode,
        programName: entry.programName,
        currentVersionPdId: current?.pdId || null,
        currentVersionNo: current?.pdVersion || null,
        currentStatus: current?.pdStatus || null,
        // keep flattened current-version fields for backwards compat
        pdId: current?.pdId || null,
        pdVersion: current?.pdVersion || null,
        pdStatus: current?.pdStatus || null,
        pdUpdatedAt: current?.pdUpdatedAt || null,
        pdCreatorName: current?.pdCreatorName || null,
        pdReviewerName: current?.pdReviewerName || null,
        pdSchemeYear: current?.pdSchemeYear || null,
        pdEffectiveAy: current?.pdEffectiveAy || null,
        stats: current?.stats || {
          approved: 0,
          underReview: 0,
          draft: 0,
          missing: 0,
          total: 0,
        },
        courses: current?.courses || [],
        versions: entry.versions,
      });
    }

    // Sort programs by most-recently-updated current version first
    programs.sort(
      (a, b) => new Date(b.pdUpdatedAt || 0) - new Date(a.pdUpdatedAt || 0),
    );

    // 6. Orphan CDs (course codes not referenced by ANY PD of this admin)
    const referencedCodes = new Set();
    for (const program of programs) {
      for (const v of program.versions) {
        v.courses.forEach((c) => {
          if (c.courseCode) referencedCodes.add(c.courseCode);
        });
      }
    }

    const orphanCourses = [];
    const orphanStats = {
      approved: 0,
      underReview: 0,
      draft: 0,
      missing: 0,
      total: 0,
    };

    cdsByCode.forEach((cdList, code) => {
      if (referencedCodes.has(code)) return;
      const cd = cdList[0];
      orphanStats.total += 1;
      if (cd.status === "Approved") orphanStats.approved++;
      else if (cd.status === "UnderReview") orphanStats.underReview++;
      else orphanStats.draft++;

      orphanCourses.push({
        courseCode: code,
        courseTitle: cd.courseTitle,
        context: "Unassigned",
        cdData: buildFormattedCD(cd),
        status: cd.status,
        cdVersion: cd.cdVersion,
        updatedAt: cd.updatedAt,
        createdBy: cd.createdBy,
        _id: cd._id,
      });
    });

    if (orphanCourses.length > 0) {
      programs.push({
        programId: "orphan",
        programCode: "OTHER",
        programName: "Unassigned / Standalone Courses",
        currentVersionPdId: "orphan",
        currentVersionNo: "-",
        currentStatus: "mixed",
        pdId: "orphan",
        pdVersion: "-",
        pdStatus: "mixed",
        pdUpdatedAt: null,
        pdCreatorName: null,
        pdReviewerName: null,
        stats: orphanStats,
        courses: orphanCourses,
        versions: [
          {
            pdId: "orphan",
            programCode: "OTHER",
            programName: "Unassigned / Standalone Courses",
            pdVersion: "-",
            pdStatus: "mixed",
            pdUpdatedAt: null,
            pdCreatedAt: null,
            pdCreatorName: null,
            pdReviewerName: null,
            stats: orphanStats,
            courses: orphanCourses,
          },
        ],
      });
    }

    // ── Backwards compat: also return a flattened `groupedData` array
    //    so any other consumer still works. It maps each program to its
    //    CURRENT version only.
    const groupedData = programs.map((p) => ({
      pdId: p.currentVersionPdId,
      programCode: p.programCode,
      programName: p.programName,
      pdVersion: p.currentVersionNo,
      pdStatus: p.currentStatus,
      stats: p.stats,
      courses: p.courses,
    }));

    return res.status(200).json({
      success: true,
      programs,       // ← new primary payload (versioned)
      groupedData,    // ← legacy flat payload
    });
  } catch (error) {
    console.error("getGroupedCDReviews:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const compileCurriculumBook = async (req, res) => {
  try {
    const { programId } = req.params;
    const adminId = req.admin._id;

    // 1. Fetch the Program Document
    const pd = await PD.findOne({
      _id: programId,
      approved_by: adminId,
    }).populate("created_by", "name email");

    if (!pd) {
      return res.status(404).json({
        success: false,
        message: "Program Document not found or unauthorized.",
      });
    }

    // 2. Extract all course codes from the PD structure
    const courseCodes = [];
    const pdData = pd.pd_data || {};

    // 2024 and 2026 extract
    pdData.semesters?.forEach((sem) => {
      sem.courses?.forEach((c) => courseCodes.push(c.code));
      sem.categories?.forEach((cat) =>
        cat.courses?.forEach((c) => courseCodes.push(c.code)),
      );
    });

    // 2024 Electives
    pdData.prof_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => courseCodes.push(c.code)),
    );
    pdData.open_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => courseCodes.push(c.code)),
    );

    // 2026 Section 4 Additions
    pdData.section4?.professionalElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => courseCodes.push(c.code)),
    );
    pdData.section4?.openElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => courseCodes.push(c.code)),
    );
    pdData.section4?.technicalCompetencyCourses?.forEach((c) =>
      courseCodes.push(c.code),
    );

    // 3. Fetch all APPROVED Course Documents for those codes
    const cds = await CourseDocument.find({
      courseCode: { $in: courseCodes },
      status: "Approved",
    })
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources");

    // 4. Format them
    const formattedCDs = cds.map((cd) => buildFormattedCD(cd));

    // Sort CDs to roughly match the order they appear in the PD semesters
    formattedCDs.sort(
      (a, b) =>
        courseCodes.indexOf(a.courseCode) - courseCodes.indexOf(b.courseCode),
    );

    res.status(200).json({
      success: true,
      compiledBook: {
        programData: {
          program_id: pd.program_id,
          program_name: pd.program_name,
          scheme_year: pd.scheme_year,
          version_no: pd.version_no,
          effective_ay: pd.effective_ay,
          total_credits: pd.total_credits,
          pd_data: pd.pd_data,
        },
        courses: formattedCDs,
      },
    });
  } catch (error) {
    console.error("compileCurriculumBook error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to compile the curriculum book.",
    });
  }
};

export const getAllPDsForAdmin = async (req, res) => {
  try {
    const adminId = req.admin._id;
    // Ensure scheme_year is included in the selection
    const pds = await PD.find({ approved_by: adminId })
      .populate(
        "created_by",
        "name email designation department school faculty",
      )
      .select(
        "program_id program_name status updated_at version_no scheme_year pd_data",
      )
      .sort({ updated_at: -1 });

    res.status(200).json({ success: true, pds });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW HELPER: Build per-page header lines for dynamic two-line header
// ─────────────────────────────────────────────────────────────────────────────

const buildHeaderLines = (totalPages, markerMap, pd, bookData, frontMatterCount = 13) => {
  const headerLines = new Array(totalPages).fill(null);

  // Build context map from marker IDs
  const contextMap = new Map();
  contextMap.set('overview', { type: 'overview' });
  contextMap.set('structure', { type: 'structure' });

  // Semester contexts
  const semesters = bookData.semesterGroups || [];
  semesters.forEach((group) => {
    const sem = group.semester;
    contextMap.set(`semester-${sem}`, { type: 'semester', semester: sem });
    // Also add course contexts for this semester
    group.courses.forEach((cd) => {
      const code = cd.courseCode;
      const title = cd.courseTitle;
      const type = cd.identity?.courseType || 'Core'; // fallback
      contextMap.set(`course-${code}`, {
        type: 'course',
        semester: sem,
        courseCode: code,
        courseTitle: title,
        courseType: type,
      });
    });
  });

  // Also handle elective courses (if any)
  const electives = bookData.electiveCourses || [];
  electives.forEach((cd) => {
    const code = cd.courseCode;
    const title = cd.courseTitle;
    const type = cd.identity?.courseType || 'Elective';
    contextMap.set(`course-${code}`, {
      type: 'course',
      semester: 'Elective',
      courseCode: code,
      courseTitle: title,
      courseType: type,
    });
  });

  const pageMarkerMap = new Map();
  if (markerMap && markerMap instanceof Map) {
    for (const [markerId, pageIndex] of markerMap.entries()) {
      pageMarkerMap.set(pageIndex, markerId);
    }
  }

  let currentContext = null;
  const programName = pd.program_name || 'Program';
  const schemeYear = pd.scheme_year || '2025-26';

  // Iterate only over main content pages (skip front matter, cover, back cover)
  const startPage = frontMatterCount + 1; // first page after front matter
  const endPage = totalPages - 2; // last page before back cover

  for (let i = startPage; i <= endPage; i++) {
    // Check if this page has a marker
    if (pageMarkerMap.has(i)) {
      const markerId = pageMarkerMap.get(i);
      if (contextMap.has(markerId)) {
        currentContext = contextMap.get(markerId);
      }
    }

    // If no context yet, skip (should not happen after first main page)
    if (!currentContext) continue;

    // Build header lines
    const line1 = `Curriculum Document ${schemeYear}`;
    let line2 = '';

    const ctx = currentContext;
    if (ctx.type === 'overview') {
      line2 = `${programName} | Program Overview`;
    } else if (ctx.type === 'structure') {
      line2 = `${programName} | Program Structure`;
    } else if (ctx.type === 'semester') {
      line2 = `${programName} Sem-${ctx.semester}`;
    } else if (ctx.type === 'course') {
      const semDisplay = ctx.semester !== 'Elective' ? `Sem-${ctx.semester}` : 'Elective';
      line2 = `${programName} ${semDisplay} | ${ctx.courseTitle} | ${ctx.courseType}`;
    }

    headerLines[i] = { line1, line2 };
  }

  return headerLines;
};


/**
 * Helper: build TOC items without page numbers (for sidebar)
 * @param {Object} bookData - The book data from the backend
 * @returns {Array} Array of { level, title, id } objects
 */
function buildSimpleTOCItems(bookData) {
  const { programData, semesterGroups = [], electiveCourses = [] } = bookData || {};
  const items = [];

  // Always include Overview and Structure
  items.push({ level: 0, title: "Program Overview", id: "program-overview" });
  items.push({ level: 0, title: "Program Structure", id: "program-structure" });

  // Process semester groups
  if (Array.isArray(semesterGroups)) {
    semesterGroups.forEach((group) => {
      // Safely get semester number
      const semNo = group?.semester;
      if (semNo == null) return;

      items.push({
        level: 1,
        title: `Semester ${semNo}`,
        id: `semester-${semNo}`,
      });

      // Process courses within the group
      const courses = group?.courses || [];
      courses.forEach((cd) => {
        if (!cd?.courseCode) return;
        items.push({
          level: 2,
          title: `${cd.courseCode} – ${cd.courseTitle || ''}`,
          id: `course-${cd.courseCode}`,
        });
      });
    });
  }

  // Process elective courses
  if (Array.isArray(electiveCourses) && electiveCourses.length > 0) {
    items.push({ level: 0, title: "Elective Courses", id: "electives" });
    electiveCourses.forEach((cd) => {
      if (!cd?.courseCode) return;
      items.push({
        level: 1,
        title: `${cd.courseCode} – ${cd.courseTitle || ''}`,
        id: `course-${cd.courseCode}`,
      });
    });
  }

  return items;
}

// ─── FRONT MATTER PAGES CONTROLLERS ───────────────────────────────────────

/**
 * Get all front matter pages (HTML templates)
 * ONLY ONE DECLARATION
 */
export const getFrontMatterPages = async (req, res) => {
  try {
    const templatesDir = path.join(__dirname, '../public/templates/front_matter/partials');
    
    if (!fs.existsSync(templatesDir)) {
      const altPath = path.join(process.cwd(), 'backend/public/templates/front_matter/partials');
      console.log('📁 Trying alternative path:', altPath);
      
      if (fs.existsSync(altPath)) {
        console.log('✅ Found templates at alternative path:', altPath);
        return getPagesFromDirectory(altPath, res);
      }
      
      return res.status(404).json({ 
        success: false, 
        message: 'Templates directory not found' 
      });
    }
    
    return getPagesFromDirectory(templatesDir, res);
  } catch (error) {
    console.error('Error fetching front matter pages:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch pages: ' + error.message 
    });
  }
};

const getPagesFromDirectory = (templatesDir, res) => {
  try {
    const files = fs.readdirSync(templatesDir);
    
    const pages = files
      .filter(file => file.endsWith('.html'))
      .filter(file => !file.startsWith('_') && !file.startsWith('.'))
      .map(file => {
        try {
          const filePath = path.join(templatesDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const stats = fs.statSync(filePath);
          
          return {
            name: path.basename(file, '.html'),
            content: content,
            updatedAt: stats.mtime.toISOString(),
            size: stats.size
          };
        } catch (err) {
          console.error(`Error reading file ${file}:`, err);
          return null;
        }
      })
      .filter(page => page !== null);
    
    return res.json({ 
      success: true, 
      pages: pages 
    });
  } catch (error) {
    console.error('Error reading directory:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to read directory: ' + error.message 
    });
  }
};

/**
 * Save a front matter page (HTML template)
 * ONLY ONE DECLARATION
 */
export const saveFrontMatterPage = async (req, res) => {
  try {
    const { pageName, content } = req.body;
    
    if (!pageName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Page name is required' 
      });
    }
    
    if (content === undefined || content === null) {
      return res.status(400).json({ 
        success: false, 
        message: 'Content is required' 
      });
    }
    
    const templatesDir = path.join(__dirname, '../public/templates/front_matter/partials');
    
    if (!fs.existsSync(templatesDir)) {
      const altPath = path.join(process.cwd(), 'backend/public/templates/front_matter/partials');      
      if (fs.existsSync(altPath)) {
        return savePageToDirectory(altPath, pageName, content, res);
      }
      
      return res.status(404).json({ 
        success: false, 
        message: 'Templates directory not found' 
      });
    }
    
    return savePageToDirectory(templatesDir, pageName, content, res);
  } catch (error) {
    console.error('Error saving page:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to save page: ' + error.message 
    });
  }
};

const savePageToDirectory = (templatesDir, pageName, content, res) => {
  try {
    const safePageName = path.basename(pageName);
    const filePath = path.join(templatesDir, `${safePageName}.html`);
        
    if (!fs.existsSync(templatesDir)) {
      console.error("❌ Templates directory not found:", templatesDir);
      return res.status(404).json({
        success: false,
        message: "Templates directory not found",
        path: templatesDir,
      });
    }
    
    if (!fs.existsSync(filePath)) {
      console.error("❌ File not found:", filePath);
      const availableFiles = fs.readdirSync(templatesDir);
      console.log("📁 Available files:", availableFiles);
      
      return res.status(404).json({
        success: false,
        message: `Page "${safePageName}.html" not found in templates directory`,
        filePath,
        availableFiles,
      });
    }
    
    fs.writeFileSync(filePath, content, "utf8");
    
    return res.status(200).json({
      success: true,
      message: "Page saved successfully",
      pageName: safePageName,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error saving file:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save file: " + error.message,
    });
  }
};

/**
 * Get a single front matter page
 * ONLY ONE DECLARATION
 */
export const getFrontMatterPage = async (req, res) => {
  try {
    const { pageName } = req.params;
    
    if (!pageName) {
      return res.status(400).json({
        success: false,
        message: "Page name is required",
      });
    }
    
    const templatesDir = path.join(__dirname, '../public/templates/front_matter/partials');
    
    if (!fs.existsSync(templatesDir)) {
      const altPath = path.join(process.cwd(), 'backend/public/templates/front_matter/partials');
      if (fs.existsSync(altPath)) {
        return getPageFromDirectory(altPath, pageName, res);
      }
      return res.status(404).json({ 
        success: false, 
        message: 'Templates directory not found' 
      });
    }
    
    return getPageFromDirectory(templatesDir, pageName, res);
  } catch (error) {
    console.error('Error fetching page:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch page: ' + error.message 
    });
  }
};

const getPageFromDirectory = (templatesDir, pageName, res) => {
  try {
    const filePath = path.join(templatesDir, `${pageName}.html`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        success: false, 
        message: `Page "${pageName}.html" not found` 
      });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);
    
    res.json({ 
      success: true, 
      page: {
        name: pageName,
        content: content,
        updatedAt: stats.mtime.toISOString()
      }
    });
  } catch (error) {
    console.error('Error reading file:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to read file: ' + error.message 
    });
  }
};

/**
 * Reset a front matter page to default
 * ONLY ONE DECLARATION
 */
export const resetFrontMatterPage = async (req, res) => {
  try {
    const { pageName } = req.params;
    
    if (!pageName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Page name is required' 
      });
    }
    
    const templatesDir = path.join(__dirname, '../public/templates/front_matter/partials');
    
    if (!fs.existsSync(templatesDir)) {
      const altPath = path.join(process.cwd(), 'backend/public/templates/front_matter/partials');
      if (fs.existsSync(altPath)) {
        return resetPageInDirectory(altPath, pageName, res);
      }
      return res.status(404).json({ 
        success: false, 
        message: 'Templates directory not found' 
      });
    }
    
    return resetPageInDirectory(templatesDir, pageName, res);
  } catch (error) {
    console.error('Error resetting page:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reset page: ' + error.message 
    });
  }
};

const resetPageInDirectory = (templatesDir, pageName, res) => {
  try {
    const defaultPath = path.join(templatesDir, `_default_${pageName}.html`);
    const currentPath = path.join(templatesDir, `${pageName}.html`);
    
    if (!fs.existsSync(defaultPath)) {
      return res.status(404).json({ 
        success: false, 
        message: `Default template for "${pageName}.html" not found` 
      });
    }
    
    const defaultContent = fs.readFileSync(defaultPath, 'utf8');
    fs.writeFileSync(currentPath, defaultContent, 'utf8');
    
    console.log(`[Admin] Reset page: ${pageName}.html to default`);
    
    res.json({ 
      success: true, 
      message: 'Page reset to default successfully'
    });
  } catch (error) {
    console.error('Error resetting file:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to reset file: ' + error.message 
    });
  }
};

export const uploadFrontMatterImage = async (req, res) => {
  try {
    uploadImage(req, res, async (err) => {
      if (err) {
        console.error('Multer error:', err);
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload failed'
        });
      }

      const { pageName, filename, oldFilename } = req.body;
      
      // console.log("========================================");
      // console.log("📤 UPLOAD FRONT MATTER IMAGE");
      // console.log("Page name:", pageName);
      // console.log("Filename:", filename);
      // console.log("Old filename:", oldFilename);
      // console.log("File received:", req.file ? req.file.originalname : 'No file');
      // console.log("========================================");

      if (!pageName) {
        return res.status(400).json({
          success: false,
          message: 'Page name is required'
        });
      }

      if (!filename) {
        return res.status(400).json({
          success: false,
          message: 'Filename is required'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided'
        });
      }

      const imagesDir = path.join(__dirname, '../public/templates/front_matter/images');
      
      // console.log("📁 Images directory:", imagesDir);

      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
        // console.log("📁 Created images directory");
      }

      const safeFilename = path.basename(filename);
      const filePath = path.join(imagesDir, safeFilename);

      if (oldFilename && oldFilename !== safeFilename) {
        const oldFilePath = path.join(imagesDir, oldFilename);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
          // console.log(`🗑️ Removed old image: ${oldFilename}`);
        }
      }

      fs.writeFileSync(filePath, req.file.buffer);
      
      // console.log(`✅ [Admin] Saved image: ${safeFilename}`);
      // console.log(`📁 Path: ${filePath}`);
      // console.log(`📊 Size: ${req.file.size} bytes`);

      return res.status(200).json({
        success: true,
        message: 'Image uploaded successfully',
        filename: safeFilename,
        pageName: pageName
      });
    });
  } catch (error) {
    console.error('❌ Error uploading image:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to upload image: ' + error.message
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: Get all approved CDs for a program (for selection cards)
// ─────────────────────────────────────────────────────────────────────────────

export const getApprovedCDsForProgram = async (req, res) => {
  try {
    const { programId } = req.params;
    const adminId = req.admin._id;

    // Verify PD exists and is owned by this admin
    const pd = await PD.findOne({ _id: programId, approved_by: adminId });
    if (!pd) {
      return res.status(404).json({
        success: false,
        message: "Program Document not found or access denied",
      });
    }

    // Extract all course codes from PD
    const courseCodes = [];
    const pdData = pd.pd_data || {};

    // 2024 schema
    pdData.semesters?.forEach((sem) => {
      sem.courses?.forEach((c) => courseCodes.push({ code: c.code, sem: sem.sem_no, title: c.title }));
      sem.categories?.forEach((cat) =>
        cat.courses?.forEach((c) => courseCodes.push({ code: c.code, sem: sem.sem_no, title: c.title, category: cat.categoryName }))
      );
    });

    // 2024 electives
    pdData.prof_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => courseCodes.push({ code: c.code, sem: "Elective", title: c.title, type: "Professional Elective" }))
    );
    pdData.open_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => courseCodes.push({ code: c.code, sem: "Elective", title: c.title, type: "Open Elective" }))
    );

    // 2026 schema
    pdData.section4?.professionalElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => courseCodes.push({ code: c.code, sem: "Elective", title: c.title, type: "Professional Elective" }))
    );
    pdData.section4?.openElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => courseCodes.push({ code: c.code, sem: "Elective", title: c.title, type: "Open Elective" }))
    );
    pdData.section4?.technicalCompetencyCourses?.forEach((c) =>
      courseCodes.push({ code: c.code, sem: "Technical", title: c.title, type: "Technical Competency" })
    );

    // Fetch all approved CDs
    const codes = [...new Set(courseCodes.map((c) => c.code))];
    const cds = await CourseDocument.find({
      courseCode: { $in: codes },
      status: "Approved",
    })
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources")
      .populate("createdBy", "name email");

    // Build a map for quick lookup
    const cdMap = new Map();
    cds.forEach((cd) => {
      cdMap.set(cd.courseCode, cd);
    });

    // Build response with all course info
    const availableCDs = courseCodes.map((courseInfo) => {
      const cd = cdMap.get(courseInfo.code);
      if (!cd) {
        return {
          courseCode: courseInfo.code,
          courseTitle: courseInfo.title || "Unknown",
          semester: courseInfo.sem,
          category: courseInfo.category || courseInfo.type || null,
          available: false,
          cdId: null,
        };
      }

      const formatted = buildFormattedCD(cd);
      return {
        courseCode: cd.courseCode,
        courseTitle: cd.courseTitle,
        semester: courseInfo.sem,
        category: courseInfo.category || courseInfo.type || null,
        available: true,
        cdId: cd._id,
        cdVersion: cd.cdVersion,
        updatedAt: cd.updatedAt,
        createdBy: cd.createdBy,
        // Include full data for preview
        cdData: formatted,
      };
    });

    // Sort by semester order then course code
    availableCDs.sort((a, b) => {
      const semA = typeof a.semester === "number" ? a.semester : 999;
      const semB = typeof b.semester === "number" ? b.semester : 999;
      if (semA !== semB) return semA - semB;
      return a.courseCode.localeCompare(b.courseCode);
    });

  res.status(200).json({
  success: true,
  programInfo: {
    programId: pd._id,
    programCode: pd.program_id,
    programName: pd.program_name,
    schemeYear: pd.scheme_year,
    versionNo: pd.version_no,
    pdVersion: pd.version_no,
    pdEffectiveAy: pd.effective_ay || null,
    pdApprovedAt: pd.approved_at || pd.updated_at,
  },
  availableCDs,
  totalAvailable: availableCDs.filter((c) => c.available).length,
  totalRequired: availableCDs.length,
});
  } catch (error) {
    console.error("getApprovedCDsForProgram:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: Get single CD by course code (for individual preview)
// ─────────────────────────────────────────────────────────────────────────────

export const getCDByCourseCode = async (req, res) => {
  try {
    const { courseCode } = req.params;
    const adminId = req.admin._id;

    // Get admin's jurisdiction filter
    const filter = await getJurisdictionFilter(req.admin);

    const cd = await CourseDocument.findOne({
      courseCode,
      status: "Approved",
      ...filter,
    })
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources")
      .populate("createdBy", "name email");

    if (!cd) {
      return res.status(404).json({
        success: false,
        message: "Course Document not found or not approved",
      });
    }

    const formatted = buildFormattedCD(cd);

    res.status(200).json({
      success: true,
      cd: {
        _id: cd._id,
        ...formatted,
        createdBy: cd.createdBy,
        updatedAt: cd.updatedAt,
      },
    });
  } catch (error) {
    console.error("getCDByCourseCode:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
// adminController.js — add function
// backend/controllers/adminController.js
export const getCDDetailById = async (req, res) => {
  try {
    const cd = await CourseDocument.findById(req.params.id)
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources")
      .populate("createdBy", "name email");
    if (!cd)
      return res.status(404).json({ success: false, message: "CD not found" });
    const formatted = buildFormattedCD(cd);
    res.status(200).json({
      success: true,
      cd: {
        _id: cd._id,
        ...formatted,
        createdBy: cd.createdBy,
        updatedAt: cd.updatedAt,
      },
    });
  } catch (err) {
    console.error("getCDDetailById:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── SIMPLE MAIL HELPERS ─────────────────────────────────────────────────────
let _transporter = null;

const sendMail = async ({ to, subject, html }) => {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.MAIL_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    throw new Error("BREVO_API_KEY / MAIL_FROM_EMAIL missing in environment");
  }

  console.log("Brevo configuration:", {
  keyPresent: Boolean(process.env.BREVO_API_KEY),
  keyLength: process.env.BREVO_API_KEY?.length,
  keyPrefix: process.env.BREVO_API_KEY?.slice(0, 10),
  sender: process.env.MAIL_FROM_EMAIL,
});
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: process.env.MAIL_FROM_NAME || "GMU Curriculum Portal",
        email: fromEmail,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(15000),
  });

  

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Brevo ${response.status}: ${body.message || "send failed"}`);
  }
  console.log("Mail sent to", to, "→", body.messageId);
  return body;
};

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const mailWrap = (title, body) => `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#1e293b;">
    <div style="background:#1e3a8a;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;">
      <h3 style="margin:0;">${title}</h3>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:18px;border-radius:0 0 8px 8px;">
      ${body}
      <p style="font-size:12px;color:#94a3b8;margin-top:20px;">Automated message from the Curriculum Portal.</p>
    </div>
  </div>`;

// Field names that may hold the CD assignee on a course inside pd_data
const ASSIGNEE_KEYS = [
  "assigned_to", "assignedTo", "assignee", "assignee_id",
  "assigneeEmail", "assignee_email", "cd_creator",
];

const getAssigneeRef = (course) => {
  const isId = (v) => typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v);
  const isEmail = (v) => typeof v === "string" && /^\S+@\S+\.\S+$/.test(v);
  const refs = { ids: [], emails: [] };

  const scan = (val, key, depth = 0) => {
    if (val == null || depth > 2) return;
    if (key === "_id" && depth === 0) return; // skip the course's own id
    if (isId(val)) refs.ids.push(val);
    else if (isEmail(val)) refs.emails.push(val.toLowerCase().trim());
    else if (typeof val === "object") {
      if (val._bsontype === "ObjectId" || val._bsontype === "ObjectID") {
        refs.ids.push(String(val));
        return;
      }
      Object.entries(val).forEach(([k, v]) => scan(v, k, depth + 1));
    }
  };

  Object.entries(course || {}).forEach(([k, v]) => scan(v, k));
  return refs.ids.length || refs.emails.length ? refs : null;
};

// Collect every course from the PD (2024 + 2026 schema) with its assignee
const collectPDCourses = (pd) => {
  const out = [];
  const d = pd.pd_data || {};
  const push = (c, context) => {
    if (!c?.code) return;
    out.push({
      code: c.code,
      title: c.title || "",
      credits: c.credits ?? c.total_credits ?? c.credit ?? "",
      context,
      assignee: getAssigneeRef(c),
    });
  };

  d.semesters?.forEach((sem) => {
    sem.courses?.forEach((c) => push(c, `Semester ${sem.sem_no}`));
    sem.categories?.forEach((cat) =>
      cat.courses?.forEach((c) => push(c, `Semester ${sem.sem_no} (${cat.categoryName})`)),
    );
  });
  d.prof_electives?.forEach((g) => g.courses?.forEach((c) => push(c, "Professional Elective")));
  d.open_electives?.forEach((g) => g.courses?.forEach((c) => push(c, "Open Elective")));
  d.section4?.professionalElectives?.forEach((g) =>
    g.courses?.forEach((c) => push(c, "Professional Elective")),
  );
  d.section4?.openElectives?.forEach((g) =>
    g.courses?.forEach((c) => push(c, "Open Elective")),
  );
  d.section4?.technicalCompetencyCourses?.forEach((c) => push(c, "Technical Competency"));

  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// notifyCDAssignees(pd, adminName, mode)
//
// mode = "delta"  (default) — diff against lastKnownAssignees. Only creators
//                             with additions or removals are emailed.
// mode = "remind"          — everyone gets the current snapshot.
//
// Each mail contains:
//   • Section A – status banner (approved / updated)
//   • Section B – ✅ Newly Assigned Courses  (if any)
//   • Section C – ❌ Removed Courses         (if any)
//   • Section D – 📚 Current Assignments with per-course CD status
//   • Section E – login + next steps
// ─────────────────────────────────────────────────────────────────────────────
const notifyCDAssignees = async (pd, adminName, mode = "delta") => {
  const currentMap = await buildCurrentAssignmentMap(pd);

  // Compute deltas
  let targets = new Map(); // creatorId → { creator, added, removed, current }
  if (mode === "remind") {
    for (const [id, { creator, courses }] of currentMap.entries()) {
      targets.set(id, { creator, added: [], removed: [], current: courses });
    }
  } else {
    targets = computeAssignmentDelta(pd._id, currentMap);
  }

  if (targets.size === 0) {
    console.log(
      `ℹ️ PD ${pd.program_id}: no assignment changes to notify (mode=${mode}).`,
    );
    updateAssignmentCache(pd._id, currentMap);
    return [];
  }

  // Collect every course code involved (added + current) to fetch CD status
  const allCodes = new Set();
  for (const { added, current } of targets.values()) {
    added.forEach((c) => allCodes.add(c.code));
    current.forEach((c) => allCodes.add(c.code));
  }
  const cdStatusMap = await getCDStatusMap([...allCodes]);

  const base = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
  const defaultPassword = process.env.CREATOR_DEFAULT_PASSWORD || "GMIT@2026";
  const cell = 'style="padding:8px;border:1px solid #e2e8f0;"';
  const cellEm = 'style="padding:8px;border:1px solid #e2e8f0;color:#dc2626;"';

  const statusLabel = (s) => {
    switch (s) {
      case "Approved":
        return "✅ Approved";
      case "UnderReview":
        return "🟠 In Review";
      case "Draft":
        return "🟡 Draft";
      case undefined:
      case null:
        return "⚪ Not Started";
      default:
        return s;
    }
  };

  const notified = [];

  for (const { creator, added, removed, current } of targets.values()) {
    if (!creator?.email) continue;

    // Section B — added courses
    let addedHtml = "";
    if (added.length > 0) {
      const rows = added
        .map(
          (c) => `<tr>
            <td ${cell}>${esc(c.code)}</td>
            <td ${cell}>${esc(c.title)}</td>
            <td ${cell}>${esc(c.context)}</td>
            <td ${cell}>${esc(c.credits)}</td>
          </tr>`,
        )
        .join("");
      addedHtml = `
        <h4 style="margin:20px 0 8px;color:#065f46;">
          ✅ Newly Assigned Courses (${added.length})
        </h4>
        <table style="border-collapse:collapse;width:100%;font-size:14px;">
          <tr style="background:#ecfdf5;">
            <th ${cell}>Code</th><th ${cell}>Title</th>
            <th ${cell}>Semester / Category</th><th ${cell}>Credits</th>
          </tr>
          ${rows}
        </table>`;
    }

    // Section C — removed courses
    let removedHtml = "";
    if (removed.length > 0) {
      const rows = removed
        .map(
          (c) => `<tr>
            <td ${cellEm}>${esc(c.code)}</td>
            <td ${cellEm}>— (no longer assigned)</td>
          </tr>`,
        )
        .join("");
      removedHtml = `
        <h4 style="margin:20px 0 8px;color:#991b1b;">
          ❌ Removed Courses (${removed.length})
        </h4>
        <table style="border-collapse:collapse;width:100%;font-size:14px;">
          <tr style="background:#fef2f2;">
            <th ${cell}>Code</th><th ${cell}>Note</th>
          </tr>
          ${rows}
        </table>
        <p style="font-size:13px;color:#7f1d1d;">
          You are no longer responsible for creating the CD(s) listed above.
          Any drafts you started for them can be ignored.
        </p>`;
    }

    // Section D — current snapshot + CD status
    let currentHtml = "";
    if (current.length > 0) {
      const rows = current
        .map((c) => {
          const st = cdStatusMap.get(c.code);
          return `<tr>
            <td ${cell}>${esc(c.code)}</td>
            <td ${cell}>${esc(c.title)}</td>
            <td ${cell}>${esc(c.context)}</td>
            <td ${cell}>${esc(c.credits)}</td>
            <td ${cell}>${statusLabel(st?.status)}</td>
          </tr>`;
        })
        .join("");
      currentHtml = `
        <h4 style="margin:20px 0 8px;">📚 Your Current Assignments (${current.length})</h4>
        <table style="border-collapse:collapse;width:100%;font-size:14px;">
          <tr style="background:#f1f5f9;">
            <th ${cell}>Code</th><th ${cell}>Title</th>
            <th ${cell}>Semester / Category</th><th ${cell}>Credits</th>
            <th ${cell}>CD Status</th>
          </tr>
          ${rows}
        </table>`;
    }

    // Headline depends on the scenario
    const hasAdd = added.length > 0;
    const hasRem = removed.length > 0;
    const headline = hasAdd && hasRem
      ? "Your CD Assignments Have Been Updated"
      : hasAdd
        ? "New Courses Assigned to You"
        : hasRem
          ? "Some Courses Have Been Reassigned"
          : "Your Current CD Assignments";

    const intro = `<p>Dear ${esc(creator.name)},</p>
      <p>The Program Document <b>${esc(pd.program_name)} (${esc(pd.program_id)})</b>
      is <b>${esc(pd.status === "approved" ? "approved" : pd.status)}</b> and
      your assignment list has changed. Here is exactly what's different:</p>`;

    const html = mailWrap(
      headline,
      `${intro}
       ${addedHtml}
       ${removedHtml}
       ${currentHtml}

       <p style="font-size:14px;margin-top:20px;">
         <b>Program:</b> ${esc(pd.program_name)}<br/>
         <b>Program Code:</b> ${esc(pd.program_id)}<br/>
         <b>Scheme Year:</b> ${esc(pd.scheme_year)}<br/>
         <b>PD Version:</b> ${esc(pd.version_no)}<br/>
         <b>Effective AY:</b> ${esc(pd.effective_ay || "-")}<br/>
         <b>Reviewed By:</b> ${esc(adminName || "Admin")}
       </p>

       <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:14px 0;font-size:14px;">
         <b>Your login details (for reference)</b><br/>
         <b>Login Email:</b> ${esc(creator.email)}<br/>
         <b>Login Password:</b> ${esc(defaultPassword)}<br/>
         <span style="font-size:12px;color:#64748b;">Please change your password after first login.</span>
       </div>

       <h4 style="margin:18px 0 8px;">What to do next</h4>
       <ol style="font-size:14px;line-height:1.7;padding-left:20px;margin:0;">
         <li>Log in${base ? ` at <a href="${base}">${base}</a>` : ""}.</li>
         <li>Open <b>Course Document Editor → Assigned</b> and load each course.</li>
         <li>Click <b>Latest</b> before starting so you continue from the newest version.</li>
         <li>Only start CDs for the courses still listed under <i>Your Current Assignments</i>.</li>
         <li>Submit the completed CD and wait for the Admin's approval.</li>
       </ol>

       ${base ? `<p><a href="${base}/creator/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Open Dashboard</a></p>` : ""}`,
    );

    try {
      const subject =
        mode === "remind"
          ? `Reminder – Your CD Assignments for ${pd.program_name}`
          : hasAdd && hasRem
            ? `Your CD Assignments Changed – ${pd.program_name}`
            : hasAdd
              ? `New CD Assignments – ${pd.program_name}`
              : `Some CDs Removed – ${pd.program_name}`;

      await sendMail({ to: creator.email, subject, html });
      notified.push({
        creater_id: creator._id,
        added: added.map((c) => c.code),
        removed: removed.map((c) => c.code),
      });
    } catch (err) {
      console.error(
        "❌ PD notification mail failed for",
        creator.email,
        "→",
        err.message,
      );
    }
  }

  // Snapshot is now in sync regardless of mail success — matches "best effort"
  updateAssignmentCache(pd._id, currentMap);

  console.log(
    `📬 PD ${pd.program_id} (mode=${mode}): notified ${notified.length} creator(s).`,
  );
  return notified;
};
// CD approved → mail the creator of that CD
const notifyCDApproved = async (cd, adminName) => {
  const creator = await Creater.findById(cd.createdBy).select("name email");
  if (!creator?.email) return;

  const base = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
  const defaultPassword = process.env.CREATOR_DEFAULT_PASSWORD || "GMIT@2026";

  const html = mailWrap(
    "Course Document Approved",
    `<p>Dear ${esc(creator.name)},</p>
     <p>Your Course Document has been <b style="color:#16a34a;">approved</b> by
     <b>${esc(adminName || "Admin")}</b>.</p>
     <p style="font-size:14px;">
       <b>Course Code:</b> ${esc(cd.courseCode)}<br/>
       <b>Course Title:</b> ${esc(cd.courseTitle)}<br/>
       <b>Program:</b> ${esc(cd.programName || "-")}<br/>
       <b>CD Version:</b> ${esc(cd.cdVersion)}<br/>
       <b>Approved On:</b> ${new Date(cd.approvalDate || Date.now()).toDateString()}<br/>
       <b>Login Email:</b> ${esc(creator.email)}<br/>
       <b>Login Password:</b> ${esc(defaultPassword)}
     </p>
     <p style="font-size:13px;color:#475569;">
       To revise this course later, click <b>Latest</b> in the Course Document Editor first.
       Any save after approval creates a new version.
     </p>
     ${base ? `<p><a href="${base}/creator/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Open Dashboard</a></p>` : ""}`,
  );

  await sendMail({
    to: creator.email,
    subject: `CD Approved – ${cd.courseCode} ${cd.courseTitle} (v${cd.cdVersion})`,
    html,
  });
};


export const processPDReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionMessage } = req.body;
    const adminId = req.admin._id;

    const existing = await PD.findOne({ _id: id, approved_by: adminId });
    if (!existing)
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized or not found" });

    const wasApproved = existing.status === "approved";

    existing.status = status;
    existing.change_summary = rejectionMessage || "";
    existing.review_comment = rejectionMessage || "";
    existing.approved_at = status === "approved" ? new Date() : null;
    existing.updated_at = new Date();
    await existing.save();

    // On approval (fresh OR re-approval), notify everyone with a delta email.
    // Delta = everything since last known snapshot (or the full list on the
    // first-ever approval because the cache is empty).
    if (status === "approved") {
      notifyCDAssignees(existing, req.admin.name, "delta").catch((err) =>
        console.error("processPDReview notify pipeline:", err.message),
      );
    }

    res.status(200).json({
      success: true,
      message: `PD ${status} successfully`,
      data: existing,
      wasAlreadyApproved: wasApproved,
    });
  } catch (error) {
    console.error("processPDReview:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
export const processCDReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionMessage } = req.body;

    const filter = await getJurisdictionFilter(req.admin);

    const existing = await CourseDocument.findOne({ _id: id, ...filter }).select("status");
    if (!existing) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized or not found" });
    }

    const updatedCD = await CourseDocument.findOneAndUpdate(
      { _id: id, ...filter },
      {
        status,
        rejectionMessage: rejectionMessage || "",
        reviewComment: rejectionMessage || "",
        approvalDate: status === "Approved" ? new Date() : null,
        approvedBy: status === "Approved" ? req.admin._id : null,
      },
      { new: true },
    );

    // Notify the CD creator only on a fresh approval (runs in background)
    if (status === "Approved" && existing.status !== "Approved") {
      notifyCDApproved(updatedCD, req.admin.name).catch((err) =>
        console.error("notifyCDApproved:", err.message),
      );
    }

    res.status(200).json({
      success: true,
      message: `Course Document ${status === "Approved" ? "Approved" : "Returned for Revision"} successfully.`,
      data: updatedCD,
    });
  } catch (error) {
    console.error("processCDReview:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNEE DIFF CACHE — in-memory, not persisted.
// Key:   pdId (string)
// Value: Map<creatorIdString, Set<courseCode>>
//
// Purpose: let us compute "added / removed since last mail" without touching
// the PD document schema. Restarts lose the cache → next save sends a
// bootstrap delta (everything counts as "added"). That's fine — mail spamming
// is worse than a one-off catch-up mail after a server restart.
// ─────────────────────────────────────────────────────────────────────────────
const lastKnownAssignees = new Map();

// Resolve the object-id / email pairs on a course to a Creater _id (best-effort).
const resolveCreatorFromCourse = async (course, cache) => {
  const ref = getAssigneeRef(course);
  if (!ref) return null;

  const or = [];
  if (ref.ids.length) or.push({ _id: { $in: ref.ids } });
  if (ref.emails.length) or.push({ email: { $in: ref.emails } });
  if (!or.length) return null;

  // Small cache so a PD with 100 courses doesn't hammer the DB.
  const cacheKey = JSON.stringify(or);
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const creator = await Creater.findOne({ $or: or }).select("_id name email");
  cache.set(cacheKey, creator);
  return creator;
};

// Build a Map<creatorIdString, { creator, courses: [{code,title,credits,context}] }>
// from the current PD state.
const buildCurrentAssignmentMap = async (pd) => {
  const cache = new Map();
  const map = new Map();

  const courses = collectPDCourses(pd);
  for (const course of courses) {
    if (!course.assignee) continue;
    // reuse existing ref-checking but need the full course to resolve id
    const rawCourse =
      // find the raw object so we can call getAssigneeRef again inside resolve
      // simply pass the { assignee } wrapper we already built
      { assignee: course.assignee };

    // resolve to a Creater doc
    const or = [];
    if (course.assignee.ids.length)
      or.push({ _id: { $in: course.assignee.ids } });
    if (course.assignee.emails.length)
      or.push({ email: { $in: course.assignee.emails } });

    const cacheKey = JSON.stringify(or);
    let creator = cache.get(cacheKey);
    if (creator === undefined) {
      creator = await Creater.findOne({ $or: or }).select("_id name email");
      cache.set(cacheKey, creator);
    }
    if (!creator) continue;

    const key = String(creator._id);
    if (!map.has(key)) map.set(key, { creator, courses: [] });
    map.get(key).courses.push({
      code: course.code,
      title: course.title,
      credits: course.credits,
      context: course.context,
    });
  }

  return map;
};

// Compute { added: [{code,...}], removed: [{code,...}], current: [...] } per
// creator between the last cache snapshot and the current PD.
const computeAssignmentDelta = (pdId, currentMap) => {
  const prev = lastKnownAssignees.get(String(pdId)) || new Map();
  const perCreator = new Map(); // creatorId → { creator, added, removed, current }

  // Added / current
  for (const [creatorId, { creator, courses }] of currentMap.entries()) {
    const prevSet = prev.get(creatorId) || new Set();
    const currCodes = new Set(courses.map((c) => c.code));

    const added = courses.filter((c) => !prevSet.has(c.code));
    const current = courses;

    if (added.length > 0 || !prev.has(creatorId)) {
      perCreator.set(creatorId, { creator, added, removed: [], current });
    } else {
      // even with no additions, keep entry so we can attach removals below
      perCreator.set(creatorId, { creator, added: [], removed: [], current });
    }
  }

  // Removed
  for (const [creatorId, prevCodes] of prev.entries()) {
    const currEntry = currentMap.get(creatorId);
    const currCodes = new Set(
      currEntry ? currEntry.courses.map((c) => c.code) : [],
    );

    const removedCodes = [...prevCodes].filter((c) => !currCodes.has(c));
    if (removedCodes.length === 0) continue;

    // Build removed objects — we only have prev codes; PD data no longer has
    // these courses so we can't get title/credits. Leave minimal info.
    const removed = removedCodes.map((code) => ({ code }));

    if (perCreator.has(creatorId)) {
      perCreator.get(creatorId).removed = removed;
    } else {
      // Creator is no longer assigned anything at all
      perCreator.set(creatorId, {
        creator: currEntry?.creator || null,
        added: [],
        removed,
        current: [],
      });
    }
  }

  return perCreator;
};

// Update the cache snapshot after a successful notify pass.
const updateAssignmentCache = (pdId, currentMap) => {
  const snapshot = new Map();
  for (const [creatorId, { courses }] of currentMap.entries()) {
    snapshot.set(creatorId, new Set(courses.map((c) => c.code)));
  }
  lastKnownAssignees.set(String(pdId), snapshot);
};

// Look up CD status for every course code in one batch.
// Returns Map<code, { status, version }>
const getCDStatusMap = async (codes) => {
  if (!codes.length) return new Map();

  const cds = await CourseDocument.find({
    courseCode: { $in: codes },
  })
    .sort({ updatedAt: -1 })
    .select("courseCode status cdVersion updatedAt");

  const map = new Map();
  for (const cd of cds) {
    // keep the freshest version per code (sort desc already)
    if (!map.has(cd.courseCode)) {
      map.set(cd.courseCode, {
        status: cd.status, // "Approved" | "UnderReview" | "Draft" | ...
        version: cd.cdVersion,
      });
    }
  }
  return map;
};  

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/reviews/pd/:id/remind
// Emails EVERY currently-assigned creator with the full assignment list and
// each course's CD status. No diffing — admin asked to remind everyone.
// ─────────────────────────────────────────────────────────────────────────────
export const remindPDCreators = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin._id;

    const pd = await PD.findOne({ _id: id, approved_by: adminId });
    if (!pd)
      return res
        .status(404)
        .json({ success: false, message: "PD not found or access denied" });

    if (pd.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Reminders can only be sent for approved PDs.",
      });
    }

    const notified = await notifyCDAssignees(pd, req.admin.name, "remind");

    res.status(200).json({
      success: true,
      message:
        notified.length > 0
          ? `Reminder sent to ${notified.length} creator(s).`
          : "No creators to notify.",
      notifiedCount: notified.length,
      notified,
    });
  } catch (error) {
    console.error("remindPDCreators:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/reviews/pd/:id/notify-new
// Emails only creators who have additions or removals since the last snapshot.
// If the server was restarted (cache lost) this falls back to a bootstrap
// delta (everything appears as "newly added") for the first creator batch.
// ─────────────────────────────────────────────────────────────────────────────
export const notifyPDNewAssignees = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.admin._id;

    const pd = await PD.findOne({ _id: id, approved_by: adminId });
    if (!pd)
      return res
        .status(404)
        .json({ success: false, message: "PD not found or access denied" });

    if (pd.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Only approved PDs can trigger notifications.",
      });
    }

    const notified = await notifyCDAssignees(pd, req.admin.name, "delta");

    res.status(200).json({
      success: true,
      message:
        notified.length > 0
          ? `Notified ${notified.length} creator(s) of assignment changes.`
          : "No new assignment changes to notify.",
      notifiedCount: notified.length,
      notified,
    });
  } catch (error) {
    console.error("notifyPDNewAssignees:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
// POST /api/admin/reviews/pd/:id/sync-assignees
export const syncPDAssignees = async (req, res) => {
  try {
    const { id } = req.params;
    const pd = await PD.findById(id);
    if (!pd)
      return res
        .status(404)
        .json({ success: false, message: "PD not found" });
    if (pd.status !== "approved") {
      return res
        .status(400)
        .json({ success: false, message: "PD is not approved yet." });
    }
    const notified = await notifyCDAssignees(pd, "System", "delta");
    res.status(200).json({
      success: true,
      notifiedCount: notified.length,
      notified,
    });
  } catch (error) {
    console.error("syncPDAssignees:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

