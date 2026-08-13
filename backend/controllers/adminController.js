import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Admin from "../models/Admin.js";
import Creater from "../models/Creater.js";
import ProgramDocument from "../models/pd/ProgramDocument.js";
import CourseDocument from "../models/cd/CourseDocument.js";
import PD from "../models/pd/PD.js";

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
    courseCode: cd.courseCode,
    courseTitle: cd.courseTitle,
    programName: cd.programName,
    cdVersion: cd.cdVersion,
    status: cd.status,
    ...(s1.identity || {}),
    identity: s1.identity || {},
    credits: s1.credits || {},
    aimsSummary: s2.aimsSummary || "",
    objectives: s2.objectives || "",
    courseOutcomes: s2.courseOutcomes || [],
    courseOutcomesHtml: s2.courseOutcomesHtml || "",
    outcomeMap: s2.outcomeMap || {},
    outcomeMapHtml: s2.outcomeMapHtml || "",
    courseContent: s3.courseContent || "",
    teaching: s3.teaching || [],
    resources: s4.resources || {
      textBooks: [],
      references: [],
      otherResources: [],
    },
    assessmentWeight: s4.assessmentWeight || [],
    assessmentWeightHtml: s4.assessmentWeightHtml || "",
    gradingCriterion: s4.gradingCriterion || "",
    attainmentCalculations: s4.attainmentCalculations || {
      recordingMarks: "",
      settingTargets: "",
    },
    otherDetails: s4.otherDetails || {
      assignmentDetails: "",
      academicIntegrity: "",
    },
  };
};

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
// 5. REVIEW ACTIONS (Approve / Reject) - UPDATED TO SAVE COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

export const processPDReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionMessage } = req.body;
    const adminId = req.admin._id;

    const updatedPD = await PD.findOneAndUpdate(
      { _id: id, approved_by: adminId },
      {
        status: status,
        change_summary: rejectionMessage || "",
        review_comment: rejectionMessage || "",
        approved_at: status === "approved" ? new Date() : null,
      },
      { new: true },
    );

    if (!updatedPD)
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized or not found" });

    res.status(200).json({
      success: true,
      message: `PD ${status} successfully`,
      data: updatedPD,
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

    if (!updatedCD) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized or not found" });
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
// NEW: FETCH CDs GROUPED BY PROGRAM DOCUMENT (UPDATED FOR 2026 SCHEMA)
// ─────────────────────────────────────────────────────────────────────────────
export const getGroupedCDReviews = async (req, res) => {
  try {
    const adminId = req.admin._id;
    const filter = await getJurisdictionFilter(req.admin);

    // 1. Get all PDs for this admin
    const pds = await PD.find({
      approved_by: adminId,
      status: { $in: ["approved", "under_review", "draft"] },
    }).select("program_id program_name pd_data version_no status");

    // 2. Get all CDs in admin's jurisdiction
    const allCDs = await CourseDocument.find(filter)
      .populate("createdBy", "name email")
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources")
      .sort({ createdAt: -1 });

    // Deduplicate CDs: Keep only the latest version of each courseCode
    const latestCDsMap = new Map();
    allCDs.forEach((cd) => {
      if (
        !latestCDsMap.has(cd.courseCode) ||
        new Date(cd.updatedAt) >
          new Date(latestCDsMap.get(cd.courseCode).updatedAt)
      ) {
        latestCDsMap.set(cd.courseCode, cd);
      }
    });

    const groupedData = [];
    const processedCourseCodes = new Set();

    // 3. Map CDs into their respective PDs
    for (const pd of pds) {
      const pdCourses = [];
      let stats = {
        approved: 0,
        underReview: 0,
        draft: 0,
        missing: 0,
        total: 0,
      };

      const addCourseToPD = (courseObj, context) => {
        if (!courseObj || !courseObj.code) return;
        const code = courseObj.code;
        stats.total += 1;
        processedCourseCodes.add(code);

        const cd = latestCDsMap.get(code);
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

      // Extract Semesters (Handles both 2024 and 2026 schema)
      pd.pd_data?.semesters?.forEach((sem) => {
        sem.courses?.forEach((c) => addCourseToPD(c, `Semester ${sem.sem_no}`));
        sem.categories?.forEach((cat) =>
          cat.courses?.forEach((c) =>
            addCourseToPD(c, `Semester ${sem.sem_no} (${cat.categoryName})`),
          ),
        );
      });

      // Extract 2024 Electives
      pd.pd_data?.prof_electives?.forEach((grp) =>
        grp.courses?.forEach((c) => addCourseToPD(c, `Prof. Elective`)),
      );
      pd.pd_data?.open_electives?.forEach((grp) =>
        grp.courses?.forEach((c) => addCourseToPD(c, `Open Elective`)),
      );

      // Extract 2026 Electives
      pd.pd_data?.section4?.professionalElectives?.forEach((grp) =>
        grp.courses?.forEach((c) => addCourseToPD(c, `Prof. Elective`)),
      );
      pd.pd_data?.section4?.openElectives?.forEach((grp) =>
        grp.courses?.forEach((c) => addCourseToPD(c, `Open Elective`)),
      );

      // Extract 2026 Technical Competency Courses
      pd.pd_data?.section4?.technicalCompetencyCourses?.forEach((c) =>
        addCourseToPD(c, `Technical Competency`),
      );

      groupedData.push({
        pdId: pd._id,
        programCode: pd.program_id,
        programName: pd.program_name,
        pdVersion: pd.version_no,
        pdStatus: pd.status,
        stats,
        courses: pdCourses,
      });
    }

    // 4. Handle "Orphan" CDs
    const orphanCourses = [];
    let orphanStats = {
      approved: 0,
      underReview: 0,
      draft: 0,
      missing: 0,
      total: 0,
    };

    latestCDsMap.forEach((cd, code) => {
      if (!processedCourseCodes.has(code)) {
        orphanStats.total++;
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
      }
    });

    if (orphanCourses.length > 0) {
      groupedData.push({
        pdId: "orphan",
        programCode: "OTHER",
        programName: "Unassigned / Standalone Courses",
        pdVersion: "-",
        pdStatus: "mixed",
        stats: orphanStats,
        courses: orphanCourses,
      });
    }

    res.status(200).json({ success: true, groupedData });
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

// ─────────────────────────────────────────────────────────────────────────────
// 7. DOWNLOAD CURRICULUM BOOK (TWO‑PASS WITH TOC PAGE NUMBERS)
// ─────────────────────────────────────────────────────────────────────────────

export const downloadCurriculumBook = async (req, res) => {
  try {
    const { programId } = req.params;
    const adminId = req.admin._id;

    // ── 1. Fetch Program Document (supports both _id and program_id) ──
    const pd = await findPDByIdOrProgramId(programId, adminId);
    if (!pd) {
      return res.status(404).json({
        success: false,
        message: "Program Document not found or unauthorized.",
      });
    }

    const pdData = pd.pd_data || {};

    // ── 2. Build courseCode → formatted CD map (unchanged) ───────────
    const allCourseCodes = [];
    pdData.semesters?.forEach((sem) => {
      sem.courses?.forEach((c) => allCourseCodes.push(c.code));
      sem.categories?.forEach((cat) =>
        cat.courses?.forEach((c) => allCourseCodes.push(c.code))
      );
    });
    pdData.prof_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => allCourseCodes.push(c.code))
    );
    pdData.open_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => allCourseCodes.push(c.code))
    );
    pdData.section4?.professionalElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => allCourseCodes.push(c.code))
    );
    pdData.section4?.openElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => allCourseCodes.push(c.code))
    );
    pdData.section4?.technicalCompetencyCourses?.forEach((c) =>
      allCourseCodes.push(c.code)
    );

    const uniqueCourseCodes = [...new Set(allCourseCodes)];

    const cds = await CourseDocument.find({
      courseCode: { $in: uniqueCourseCodes },
      status: "Approved",
    })
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources");

    const formattedCDs = cds.map((cd) => buildFormattedCD(cd));
    const cdMap = {};
    formattedCDs.forEach((cd) => {
      cdMap[cd.courseCode] = cd;
    });

    const semesterGroups = [];
    pdData.semesters?.forEach((sem) => {
      const codesInSemester = [];
      sem.courses?.forEach((c) => codesInSemester.push(c.code));
      sem.categories?.forEach((cat) =>
        cat.courses?.forEach((c) => codesInSemester.push(c.code))
      );

      const semesterCourses = [];
      codesInSemester.forEach((code) => {
        if (cdMap[code]) semesterCourses.push(cdMap[code]);
      });

      if (semesterCourses.length > 0) {
        semesterGroups.push({
          semester: sem.sem_no,
          courses: semesterCourses,
        });
      }
    });

    const electiveCourses = [];
    pdData.prof_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => {
        if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
      })
    );
    pdData.section4?.professionalElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => {
        if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
      })
    );
    pdData.open_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => {
        if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
      })
    );
    pdData.section4?.openElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => {
        if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
      })
    );
    pdData.section4?.technicalCompetencyCourses?.forEach((c) => {
      if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
    });

    const bookData = {
      programData: {
        program_id: pd.program_id,
        program_name: pd.program_name,
        scheme_year: pd.scheme_year,
        version_no: pd.version_no,
        effective_ay: pd.effective_ay,
        total_credits: pd.total_credits,
        pd_data: pd.pd_data,
      },
      semesterGroups: semesterGroups,
      electiveCourses: electiveCourses,
    };

    // ── 8. FIRST PASS ──────────────────────────────────────────────────
    console.log("📄 Generating first-pass HTML for marker extraction...");
    const firstHtml = generateCurriculumHTML(bookData, {
      includeTOC: true,
      fullBook: true,
    });

    console.log("🔄 Converting first-pass HTML to PDF...");
    const { buffer: firstPdfBuffer, markerMap } = await generateCurriculumPDF(firstHtml, { returnMarkers: true });

    const frontMatterCount = 13;
    const tocItems = buildTOCItems(bookData, markerMap, frontMatterCount);
    console.log(`📊 Built ${tocItems.length} TOC items with page numbers.`);

    // ── 11. SECOND PASS ──────────────────────────────────────────────
    console.log("📄 Generating final HTML with TOC page numbers...");
    const finalHtml = generateCurriculumHTML(bookData, {
      includeTOC: true,
      fullBook: true,
      tocItems: tocItems,
    });

    console.log("🔄 Converting final HTML to PDF...");
    const finalPdfBuffer = await generateCurriculumPDF(finalHtml);

    const totalPages = (await PDFDocument.load(finalPdfBuffer)).getPageCount();
    const headerLines = buildHeaderLines(totalPages, markerMap, pd, bookData, frontMatterCount);

    console.log("🎨 Decorating PDF with dynamic header...");
    const decoratedPdfBuffer = await decoratePDF(finalPdfBuffer, {
      frontMatterPageCount: frontMatterCount,
      headerLines: headerLines,
      universityName: "GM University, Davanagere",
    });

    const filename = `${pd.program_id}_Curriculum_Book.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.send(decoratedPdfBuffer);

    console.log(`✅ Curriculum Book downloaded: ${filename}`);
  } catch (error) {
    console.error("downloadCurriculumBook error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate curriculum book.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD PD-ONLY (no front matter, no back cover) – unchanged
// ─────────────────────────────────────────────────────────────────────────────
export const downloadCurriculumBookPD = async (req, res) => {
  try {
    const { programId } = req.params;
    const adminId = req.admin._id;

    // ── 1. Fetch Program Document ──────────────────────────────────────────
    const pd = await findPDByIdOrProgramId(programId, adminId);

    if (!pd) {
      return res.status(404).json({
        success: false,
        message: "Program Document not found or unauthorized.",
      });
    }

    const pdData = pd.pd_data || {};

    // ── 2. Build a map of courseCode → formatted CD ──────────────────────
    const allCourseCodes = [];
    pdData.semesters?.forEach((sem) => {
      sem.courses?.forEach((c) => allCourseCodes.push(c.code));
      sem.categories?.forEach((cat) =>
        cat.courses?.forEach((c) => allCourseCodes.push(c.code))
      );
    });
    pdData.prof_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => allCourseCodes.push(c.code))
    );
    pdData.open_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => allCourseCodes.push(c.code))
    );
    pdData.section4?.professionalElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => allCourseCodes.push(c.code))
    );
    pdData.section4?.openElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => allCourseCodes.push(c.code))
    );
    pdData.section4?.technicalCompetencyCourses?.forEach((c) =>
      allCourseCodes.push(c.code)
    );

    const uniqueCourseCodes = [...new Set(allCourseCodes)];

    // ── 3. Fetch all APPROVED Course Documents ─────────────────────────────
    const cds = await CourseDocument.find({
      courseCode: { $in: uniqueCourseCodes },
      status: "Approved",
    })
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources");

    // ── 4. Build lookup map ────────────────────────────────────────────────
    const formattedCDs = cds.map((cd) => buildFormattedCD(cd));
    const cdMap = {};
    formattedCDs.forEach((cd) => {
      cdMap[cd.courseCode] = cd;
    });

    // ── 5. Group courses by semester ────────────────────────────────────────
    const semesterGroups = [];
    pdData.semesters?.forEach((sem) => {
      const codesInSemester = [];
      sem.courses?.forEach((c) => codesInSemester.push(c.code));
      sem.categories?.forEach((cat) =>
        cat.courses?.forEach((c) => codesInSemester.push(c.code))
      );

      const semesterCourses = [];
      codesInSemester.forEach((code) => {
        if (cdMap[code]) semesterCourses.push(cdMap[code]);
      });

      if (semesterCourses.length > 0) {
        semesterGroups.push({
          semester: sem.sem_no,
          courses: semesterCourses,
        });
      }
    });

    // ── 6. Handle Electives ──────────────────────────────────────────────────
    const electiveCourses = [];

    pdData.prof_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => {
        if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
      })
    );
    pdData.section4?.professionalElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => {
        if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
      })
    );

    pdData.open_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => {
        if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
      })
    );
    pdData.section4?.openElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => {
        if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
      })
    );

    pdData.section4?.technicalCompetencyCourses?.forEach((c) => {
      if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
    });

    // ── 7. Build bookData ────────────────────────────────────────────────────
    const bookData = {
      programData: {
        program_id: pd.program_id,
        program_name: pd.program_name,
        scheme_year: pd.scheme_year,
        version_no: pd.version_no,
        effective_ay: pd.effective_ay,
        total_credits: pd.total_credits,
        pd_data: pd.pd_data,
      },
      semesterGroups: semesterGroups,
      electiveCourses: electiveCourses,
    };

    // ── 8. Generate PD-ONLY HTML (no front matter, no TOC) ──────────────────
    console.log("📄 Generating PD-only HTML (no TOC, no front matter)...");
    const pdHtml = generateCurriculumHTML(bookData, {
      includeTOC: false,
      fullBook: false,
    });

    // ── 9. Convert HTML to PDF ─────────────────────────────────────────────
    const pdfBuffer = await generateCurriculumPDF(pdHtml);

    // ── 10. Decorate PDF (no front matter offset) ──────────────────────────
    console.log("🎨 Decorating PD PDF (clean layout)...");
    const decoratedPdfBuffer = await decoratePDF(pdfBuffer, {
      frontMatterPageCount: 0,
      headerText: "",
      universityName: "",
    });

    // ── 11. Send the final PDF ─────────────────────────────────────────────
    const filename = `${pd.program_id}_PD_Only.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.send(decoratedPdfBuffer);

    console.log(`✅ PD‑only PDF downloaded (decorated) : ${filename}`);
  } catch (error) {
    console.error("downloadCurriculumBookPD error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate PD‑only PDF.",
      error: error.message,
    });
  }
};

/**
 * Preview Curriculum Book – returns HTML and TOC items for frontend preview
 */
export const previewCurriculumBook = async (req, res) => {
  try {
    const { programId } = req.params;
    const adminId = req.admin._id;

    // ── 1. Fetch Program Document ──────────────────────────────────────────
    const pd = await findPDByIdOrProgramId(programId, adminId);

    if (!pd) {
      return res.status(404).json({
        success: false,
        message: "Program Document not found or unauthorized.",
      });
    }

    const pdData = pd.pd_data || {};

    // ── 2. Build map of courseCode → formatted CD (same as download) ──
    const allCourseCodes = [];
    pdData.semesters?.forEach((sem) => {
      sem.courses?.forEach((c) => allCourseCodes.push(c.code));
      sem.categories?.forEach((cat) =>
        cat.courses?.forEach((c) => allCourseCodes.push(c.code))
      );
    });
    pdData.prof_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => allCourseCodes.push(c.code))
    );
    pdData.open_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => allCourseCodes.push(c.code))
    );
    pdData.section4?.professionalElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => allCourseCodes.push(c.code))
    );
    pdData.section4?.openElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => allCourseCodes.push(c.code))
    );
    pdData.section4?.technicalCompetencyCourses?.forEach((c) =>
      allCourseCodes.push(c.code)
    );

    const uniqueCourseCodes = [...new Set(allCourseCodes)];

    const cds = await CourseDocument.find({
      courseCode: { $in: uniqueCourseCodes },
      status: "Approved",
    })
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources");

    const formattedCDs = cds.map((cd) => buildFormattedCD(cd));
    const cdMap = {};
    formattedCDs.forEach((cd) => {
      cdMap[cd.courseCode] = cd;
    });

    // ── 3. Group courses by semester ────────────────────────────────────────
    const semesterGroups = [];
    pdData.semesters?.forEach((sem) => {
      const codesInSemester = [];
      sem.courses?.forEach((c) => codesInSemester.push(c.code));
      sem.categories?.forEach((cat) =>
        cat.courses?.forEach((c) => codesInSemester.push(c.code))
      );

      const semesterCourses = [];
      codesInSemester.forEach((code) => {
        if (cdMap[code]) semesterCourses.push(cdMap[code]);
      });

      if (semesterCourses.length > 0) {
        semesterGroups.push({
          semester: sem.sem_no,
          courses: semesterCourses,
        });
      }
    });

    // ── 4. Collect elective courses ──────────────────────────────────────────
    const electiveCourses = [];
    pdData.prof_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => {
        if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
      })
    );
    pdData.section4?.professionalElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => {
        if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
      })
    );
    pdData.open_electives?.forEach((grp) =>
      grp.courses?.forEach((c) => {
        if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
      })
    );
    pdData.section4?.openElectives?.forEach((grp) =>
      grp.courses?.forEach((c) => {
        if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
      })
    );
    pdData.section4?.technicalCompetencyCourses?.forEach((c) => {
      if (cdMap[c.code]) electiveCourses.push(cdMap[c.code]);
    });

    // ── 5. Build bookData ────────────────────────────────────────────────────
    const bookData = {
      programData: {
        program_id: pd.program_id,
        program_name: pd.program_name,
        scheme_year: pd.scheme_year,
        version_no: pd.version_no,
        effective_ay: pd.effective_ay,
        total_credits: pd.total_credits,
        pd_data: pd.pd_data,
      },
      semesterGroups: semesterGroups,
      electiveCourses: electiveCourses,
    };

    // ── 6. Generate HTML ──────────────────────────────────────────────────
    const html = generateCurriculumHTML(bookData, {
      includeTOC: true,
      fullBook: true,
    });

    // ── 7. Build TOC items for sidebar (no page numbers) ──────────────────
    // We'll build a simple list from bookData (without markers)
    const tocItems = buildSimpleTOCItems(bookData);

    res.status(200).json({
      success: true,
      html,
      tocItems,
      bookData,
    });
  } catch (error) {
    console.error("previewCurriculumBook error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate preview.",
      error: error.message,
    });
  }
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