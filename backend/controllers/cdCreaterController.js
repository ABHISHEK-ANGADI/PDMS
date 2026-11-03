import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import CourseDocument from "../models/cd/CourseDocument.js";
import CD_Section1_Identity from "../models/cd/CD_Section1_Identity.js";
import CD_Section2_Outcomes from "../models/cd/CD_Section2_Outcomes.js";
import CD_Section3_Syllabus from "../models/cd/CD_Section3_Syllabus.js";
import CD_Section4_Resources from "../models/cd/CD_Section4_Resources.js";
import Admin from "../models/Admin.js";
import PD from "../models/pd/PD.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Creater from "../models/Creater.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const incrementVersion = (version = "1.0.0") => {
  const parts = version.split(".");
  if (parts.length < 3) return "1.0.1";
  parts[2] = String(parseInt(parts[2], 10) + 1);
  return parts.join(".");
};

/**
 * Flatten a populated CourseDocument into the client-facing CD shape.
 * Matches the NEW schemas (Section 2/3/4).
 */
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
    scheduleOfAssessments: s4.scheduleOfAssessments || {},
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

/**
 * Given a flat list of CourseDocument docs (sorted DESC by createdAt)
 * and the current PD version, return:
 *  - currentCds:   CDs that belong to THIS pdVersion (or legacy ones with pdVersion=null)
 *  - reusable:     CDs from OLDER pdVersions (or legacy) that can be cloned
 */
const resolveCDsForPDVersion = (allCdsForCourse, currentPdVersion) => {
  const curVer = currentPdVersion ? String(currentPdVersion) : null;

  const currentCds = [];
  const reusable = [];

  for (const cd of allCdsForCourse) {
    const cdVer = cd.pdVersion ? String(cd.pdVersion) : null;
    const isForCurrent = cdVer === null || (curVer && cdVer === curVer);
    if (isForCurrent) currentCds.push(cd);
    else reusable.push(cd);
  }

  return { currentCds, latestCurrent: currentCds[0] || null, reusable };
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN SELECTION FOR REVIEW MODAL
// ─────────────────────────────────────────────────────────────────────────────
export const getAdminsForReview = async (req, res) => {
  try {
    const admins = await Admin.find({ role: "admin", status: "active" }).select(
      "name email department school",
    );
    res.json({ success: true, admins });
  } catch (error) {
    console.error("Error fetching admins:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch admins." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PARSE / IMPORT (PDF)
// ─────────────────────────────────────────────────────────────────────────────
export const uploadAndParseCD = async (req, res) => {
  if (!req.file)
    return res.status(400).json({ success: false, message: "No file uploaded" });

  const filePath = req.file.path;
  let responseSent = false;

  const cleanupFile = () => {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      console.error(`Failed to delete temp file ${filePath}:`, err);
    }
  };

  try {
    const scriptPath = path.join(__dirname, "..", "scripts", "cd_parser.py");
    const pythonCommand =
      process.env.NODE_ENV === "production" ? "python3" : "python";

    if (!fs.existsSync(scriptPath)) {
      cleanupFile();
      return res.status(500).json({
        success: false,
        message: "Parser script not found on server.",
      });
    }

    const pythonProcess = spawn(pythonCommand, [scriptPath, filePath]);

    let dataString = "";
    let errorString = "";

    const timeoutId = setTimeout(() => {
      if (!responseSent) {
        pythonProcess.kill("SIGKILL");
        responseSent = true;
        cleanupFile();
        res.status(504).json({ success: false, message: "Parsing timed out." });
      }
    }, 60000);

    pythonProcess.stdout.on("data", (d) => (dataString += d.toString()));
    pythonProcess.stderr.on("data", (d) => (errorString += d.toString()));

    pythonProcess.on("error", (error) => {
      clearTimeout(timeoutId);
      cleanupFile();
      if (!responseSent) {
        responseSent = true;
        res.status(500).json({
          success: false,
          message: "Failed to start Python parser.",
          details: error.message,
        });
      }
    });

    pythonProcess.on("close", (code) => {
      clearTimeout(timeoutId);
      cleanupFile();
      if (responseSent) return;
      responseSent = true;

      if (code !== 0) {
        return res.status(500).json({
          success: false,
          message: "Parsing failed.",
          details: errorString,
        });
      }

      try {
        const jsonStartIndex = dataString.indexOf("{");
        const jsonEndIndex = dataString.lastIndexOf("}") + 1;
        if (jsonStartIndex === -1) throw new Error("No JSON found");

        const parsed = JSON.parse(dataString.slice(jsonStartIndex, jsonEndIndex));
        if (!parsed.success)
          return res
            .status(400)
            .json({ success: false, message: parsed.message });

        return res.json({ success: true, parsedData: parsed.parsedData });
      } catch (e) {
        return res.status(500).json({
          success: false,
          message: "Invalid parser response.",
          raw: dataString,
        });
      }
    });
  } catch (error) {
    cleanupFile();
    if (!responseSent)
      res
        .status(500)
        .json({ success: false, message: "Unexpected server error." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SAVE / UPDATE WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────
export const createOrUpdateCD = async (req, res) => {
  try {
    const {
      courseCode,
      courseTitle,
      programName,
      isNewCD,
      status,
      sectionsToUpdate = [],
      cdData,
      reviewerId,
      pdVersion,
      pdId,
    } = req.body;

    if (!courseCode) {
      return res
        .status(400)
        .json({ success: false, message: "courseCode is required." });
    }

    const creatorId = req.id;
    const updateAll = sectionsToUpdate.includes("all");

    // ── Dirty tracking keys (aligned to UI) ──
    const s1Keys = ["basic", "identity", "credits"];
    const s2Keys = [
      "basic",
      "courseOutcomes",
      "outcomeMap",
      "onlineResources",
    ];
    const s3Keys = ["basic", "courseContent", "teaching"];
    const s4Keys = [
      "basic",
      "resources",
      "onlineResources",
      "assessmentWeight",
      "scheduleOfAssessments",
      "passingCriterion",
      "gradingCriterion",
      "attainmentTargets",
      "feedback",
      "otherDetails",
    ];

    const dirty = (keys) =>
      updateAll || keys.some((k) => sectionsToUpdate.includes(k));

    const s1Dirty = dirty(s1Keys);
    const s2Dirty = dirty(s2Keys);
    const s3Dirty = dirty(s3Keys);
    const s4Dirty = dirty(s4Keys);

    const existingCD = await CourseDocument.findOne({ courseCode }).sort({
      createdAt: -1,
    });
    const isActuallyNew = !existingCD;

    let needsVersionBump = false;
    if (
      !isActuallyNew &&
      (existingCD.status === "Approved" || existingCD.status === "UnderReview")
    ) {
      needsVersionBump = true;
    }

    const newCdVersion = isActuallyNew
      ? "1.0.0"
      : needsVersionBump
        ? incrementVersion(existingCD.cdVersion)
        : existingCD.cdVersion;

    let s1_Id = existingCD?.section1_identity;
    let s2_Id = existingCD?.section2_outcomes;
    let s3_Id = existingCD?.section3_syllabus;
    let s4_Id = existingCD?.section4_resources;

    // ── SCENARIO 1: Brand New OR Bumping Version ──
    if (isActuallyNew || needsVersionBump) {
      const s1 = await CD_Section1_Identity.create({
        courseCode,
        version: newCdVersion,
        identity: cdData.identity || {},
        credits: cdData.credits || {},
        createdBy: creatorId,
      });

      const s2 = await CD_Section2_Outcomes.create({
        courseCode,
        version: newCdVersion,
        aimsSummary: cdData.aimsSummary || "",
        objectives: cdData.objectives || "",
        courseOutcomes: cdData.courseOutcomes || [],
        outcomeMap: cdData.outcomeMap || { matrix: [] },
        onlineResources: cdData.onlineResources || [],
        createdBy: creatorId,
      });

      const s3 = await CD_Section3_Syllabus.create({
        courseCode,
        version: newCdVersion,
        courseContent: cdData.courseContent || "",
        teaching: cdData.teaching || [],
        createdBy: creatorId,
      });

      const s4 = await CD_Section4_Resources.create({
        courseCode,
        version: newCdVersion,
        resources: cdData.resources || {},
        onlineResources: cdData.onlineResources || [],
        assessmentWeight: cdData.assessmentWeight || [],
        assessmentWeightHtml: cdData.assessmentWeightHtml || "",
        scheduleOfAssessments: cdData.scheduleOfAssessments || {},
        scheduleHtml: cdData.scheduleHtml || "",
        passingCriterion: cdData.passingCriterion || "",
        gradingCriterion: cdData.gradingCriterion || "",
        attainmentTargets: cdData.attainmentTargets || [],
        attainmentTargetsHtml: cdData.attainmentTargetsHtml || "",
        performanceRecording: cdData.performanceRecording || {},
        performanceRecordingHtml: cdData.performanceRecordingHtml || "",
        cabAnalysis: cdData.cabAnalysis || {},
        coAttainmentMapping: cdData.coAttainmentMapping || [],
        coAttainmentMappingHtml: cdData.coAttainmentMappingHtml || "",
        feedback: cdData.feedback || [],
        feedbackHtml: cdData.feedbackHtml || "",
        otherDetails: cdData.otherDetails || {},
        createdBy: creatorId,
      });
      const masterCD = await CourseDocument.create({
        courseCode,
        courseTitle,
        programName,
        cdVersion: newCdVersion,
        section1_identity: s1._id,
        section2_outcomes: s2._id,
        section3_syllabus: s3._id,
        section4_resources: s4._id,
        status: status || (isActuallyNew ? "Draft" : existingCD.status),
        createdBy: creatorId,
        approvedBy: reviewerId || null,
        previousVersion: isActuallyNew ? null : existingCD._id,
        pdVersion: pdVersion || null,
        pdId: pdId || null,
      });

      return res.json({
        success: true,
        message:
          status === "UnderReview"
            ? `Submitted v${newCdVersion} for review.`
            : `Draft v${newCdVersion} saved successfully.`,
        version: newCdVersion,
        data: masterCD,
      });
    }

    // ── SCENARIO 2: In-place Draft Update ──
    if (s1Dirty) {
      if (s1_Id)
        await CD_Section1_Identity.findByIdAndUpdate(s1_Id, {
          identity: cdData.identity,
          credits: cdData.credits,
        });
      else {
        const s = await CD_Section1_Identity.create({
          courseCode,
          version: newCdVersion,
          identity: cdData.identity || {},
          credits: cdData.credits || {},
          createdBy: creatorId,
        });
        s1_Id = s._id;
      }
    }

    if (s2Dirty) {
      if (s2_Id)
        await CD_Section2_Outcomes.findByIdAndUpdate(s2_Id, {
          aimsSummary: cdData.aimsSummary,
          objectives: cdData.objectives,
          courseOutcomes: cdData.courseOutcomes,
          outcomeMap: cdData.outcomeMap,
          onlineResources: cdData.onlineResources,
        });
      else {
        const s = await CD_Section2_Outcomes.create({
          courseCode,
          version: newCdVersion,
          aimsSummary: cdData.aimsSummary || "",
          objectives: cdData.objectives || "",
          courseOutcomes: cdData.courseOutcomes || [],
          outcomeMap: cdData.outcomeMap || { matrix: [] },
          onlineResources: cdData.onlineResources || [],
          createdBy: creatorId,
        });
        s2_Id = s._id;
      }
    }

    if (s3Dirty) {
      if (s3_Id)
        await CD_Section3_Syllabus.findByIdAndUpdate(s3_Id, {
          courseContent: cdData.courseContent,
          teaching: cdData.teaching,
        });
      else {
        const s = await CD_Section3_Syllabus.create({
          courseCode,
          version: newCdVersion,
          courseContent: cdData.courseContent || "",
          teaching: cdData.teaching || [],
          createdBy: creatorId,
        });
        s3_Id = s._id;
      }
    }

    if (s4Dirty) {
      if (s4_Id)
        await CD_Section4_Resources.findByIdAndUpdate(s4_Id, {
          resources: cdData.resources,
          onlineResources: cdData.onlineResources,
          assessmentWeight: cdData.assessmentWeight,
          assessmentWeightHtml: cdData.assessmentWeightHtml,
          scheduleOfAssessments: cdData.scheduleOfAssessments,
          scheduleHtml: cdData.scheduleHtml,
          passingCriterion: cdData.passingCriterion,
          gradingCriterion: cdData.gradingCriterion,
          attainmentTargets: cdData.attainmentTargets,
          attainmentTargetsHtml: cdData.attainmentTargetsHtml,
          performanceRecording: cdData.performanceRecording,
          performanceRecordingHtml: cdData.performanceRecordingHtml,
          cabAnalysis: cdData.cabAnalysis,
          coAttainmentMapping: cdData.coAttainmentMapping,
          coAttainmentMappingHtml: cdData.coAttainmentMappingHtml,
          feedback: cdData.feedback,
          feedbackHtml: cdData.feedbackHtml,
          otherDetails: cdData.otherDetails,
        });
      else {
        const s = await CD_Section4_Resources.create({
          courseCode,
          version: newCdVersion,
          resources: cdData.resources || {},
          onlineResources: cdData.onlineResources || [],
          assessmentWeight: cdData.assessmentWeight || [],
          scheduleOfAssessments: cdData.scheduleOfAssessments || {},
          passingCriterion: cdData.passingCriterion || "",
          gradingCriterion: cdData.gradingCriterion || "",
          attainmentTargets: cdData.attainmentTargets || [],
          feedback: cdData.feedback || [],
          otherDetails: cdData.otherDetails || {},
          createdBy: creatorId,
        });
        s4_Id = s._id;
      }
    }

    // Update Master
    existingCD.courseTitle = courseTitle;
    existingCD.programName = programName;
    existingCD.status = status || "Draft";
    if (reviewerId && status === "UnderReview") existingCD.approvedBy = reviewerId;
    existingCD.section1_identity = s1_Id;
    existingCD.section2_outcomes = s2_Id;
    existingCD.section3_syllabus = s3_Id;
    existingCD.section4_resources = s4_Id;
    if (pdVersion && !existingCD.pdVersion) existingCD.pdVersion = pdVersion;
    if (pdId && !existingCD.pdId) existingCD.pdId = pdId;
    await existingCD.save();

    return res.json({
      success: true,
      message:
        status === "UnderReview"
          ? `Submitted v${newCdVersion} for review.`
          : `Draft v${newCdVersion} updated successfully.`,
      version: newCdVersion,
      data: existingCD,
    });
  } catch (error) {
    console.error("createOrUpdateCD error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FETCH ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
const POPULATE_CHAIN = [
  "section1_identity",
  "section2_outcomes",
  "section3_syllabus",
  "section4_resources",
];

export const getCDById = async (req, res) => {
  try {
    const cd = await CourseDocument.findById(req.params.id)
      .populate(POPULATE_CHAIN[0])
      .populate(POPULATE_CHAIN[1])
      .populate(POPULATE_CHAIN[2])
      .populate(POPULATE_CHAIN[3]);
    if (!cd)
      return res
        .status(404)
        .json({ success: false, message: "Course Document not found." });
    return res.json({ success: true, cd: buildFormattedCD(cd) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getLatestCD = async (req, res) => {
  try {
    const { courseCode } = req.params;
    if (!courseCode || !courseCode.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Course code is required." });
    }

    const cd = await CourseDocument.findOne({ courseCode })
      .sort({ createdAt: -1 })
      .populate(POPULATE_CHAIN[0])
      .populate(POPULATE_CHAIN[1])
      .populate(POPULATE_CHAIN[2])
      .populate(POPULATE_CHAIN[3]);

    if (!cd) {
      return res.status(200).json({
        success: true,
        cd: null,
        isFirstVersion: true,
        message: "No previous versions found. This will be the first version.",
      });
    }

    return res.json({
      success: true,
      cd: buildFormattedCD(cd),
      isFirstVersion: false,
    });
  } catch (error) {
    console.error("getLatestCD error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load latest version. Please try again.",
    });
  }
};

export const getRecentVersions = async (req, res) => {
  try {
    const versions = await CourseDocument.find({
      courseCode: req.params.courseCode,
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("cdVersion createdAt status pdVersion");
    return res.json({ success: true, versions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD & ASSIGNED COURSES
// ─────────────────────────────────────────────────────────────────────────────
export const getCDDashboardStats = async (req, res) => {
  try {
    const creatorId = req.id;
    const [total, drafts, underReview, approved, recentDocs] =
      await Promise.all([
        CourseDocument.countDocuments({ createdBy: creatorId }),
        CourseDocument.countDocuments({ createdBy: creatorId, status: "Draft" }),
        CourseDocument.countDocuments({
          createdBy: creatorId,
          status: "UnderReview",
        }),
        CourseDocument.countDocuments({
          createdBy: creatorId,
          status: "Approved",
        }),
        CourseDocument.find({ createdBy: creatorId })
          .sort({ updatedAt: -1 })
          .limit(5)
          .select("courseCode courseTitle cdVersion status updatedAt"),
      ]);
    return res.json({
      success: true,
      stats: { total, drafts, underReview, approved },
      recentDocs,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch dashboard data." });
  }
};

export const getCDCreatorHistory = async (req, res) => {
  try {
    const allCDs = await CourseDocument.find({ createdBy: req.id })
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources")
      .sort({ updatedAt: -1 });

    const groupedMap = new Map();
    allCDs.forEach((cd) => {
      if (!groupedMap.has(cd.courseCode)) {
        groupedMap.set(cd.courseCode, {
          courseCode: cd.courseCode,
          courseTitle: cd.courseTitle,
          programName: cd.programName,
          latestVersion: cd.cdVersion,
          latestStatus: cd.status,
          updatedAt: cd.updatedAt,
          versions: [],
        });
      }
      groupedMap.get(cd.courseCode).versions.push({
        _id: cd._id,
        versionNo: cd.cdVersion,
        status: cd.status,
        updatedAt: cd.updatedAt,
        changeSummary: cd.reviewComment || cd.rejectionMessage || "",
        cdData: buildFormattedCD(cd),
      });
    });

    return res.json({
      success: true,
      count: groupedMap.size,
      groupedData: Array.from(groupedMap.values()),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch document history" });
  }
};

export const getAssignedCDs = async (req, res) => {
  try {
    const creatorId = req.id;
    const isMine = (c) =>
      c?.assigneeId && String(c.assigneeId) === String(creatorId);

    const pdFilter = {
      $or: [
        { "pd_data.semesters.courses.assigneeId": creatorId },
        { "pd_data.semesters.categories.courses.assigneeId": creatorId },
        { "pd_data.section4.professionalElectives.courses.assigneeId": creatorId },
        { "pd_data.section4.openElectives.courses.assigneeId": creatorId },
        { "pd_data.section4.technicalCompetencyCourses.assigneeId": creatorId },
      ],
    };

    let pds;
    try {
      pds = await PD.find(pdFilter)
        .populate("created_by", "name email")
        .populate("approved_by", "name email")
        .lean();
    } catch (popErr) {
      console.warn("getAssignedCDs: PD populate failed.", popErr.message);
      pds = await PD.find(pdFilter).lean();
    }

    const pdGroups = new Map();

    pds.forEach((pd) => {
      const pdKey = String(pd._id);
      const pdVersion = pd.version_no ?? null;
      const pdUpdatedAt = pd.updated_at ?? pd.updatedAt ?? null;
      const pdCreatedAt = pd.created_at ?? pd.createdAt ?? null;

      const pdMeta = {
        pdId: pd._id,
        pdVersion,
        pdSchemeYear: pd.scheme_year ?? null,
        pdEffectiveAy: pd.effective_ay ?? null,
        pdStatus: pd.status ?? null,
        pdUpdatedAt,
        pdCreatedAt,
        programName: pd.program_name,
        programCode: pd.program_id,
        pdCreatorName: pd.created_by?.name || "Admin",
        pdReviewerName: pd.approved_by?.name || null,
        pdTotalCredits: pd.total_credits ?? 0,
        pdAcademicCredits: pd.academic_credits ?? 0,
      };

      if (!pdGroups.has(pdKey)) pdGroups.set(pdKey, { ...pdMeta, courses: [] });
      const group = pdGroups.get(pdKey);

      const pushCourse = (c, context, type) => {
        if (!isMine(c)) return;
        const exists = group.courses.some(
          (x) => x.courseCode === c.code && x.context === context,
        );
        if (exists) return;
        group.courses.push({
          courseCode: c.code,
          courseTitle: c.title,
          programName: pd.program_name,
          programCode: pd.program_id,
          type: c.type || type || "Theory",
          credits: c.credits,
          context,
          pdCreatorName: pdMeta.pdCreatorName,
          pdId: pd._id,
          pdVersion,
          pdUpdatedAt,
        });
      };

      pd.pd_data?.semesters?.forEach((sem) => {
        sem.courses?.forEach((c) => pushCourse(c, `Semester ${sem.sem_no}`));
        sem.categories?.forEach((cat) => {
          cat.courses?.forEach((c) =>
            pushCourse(c, `Semester ${sem.sem_no} (${cat.categoryName})`),
          );
        });
      });

      pd.pd_data?.section4?.professionalElectives?.forEach((grp, gi) => {
        grp.courses?.forEach((c) =>
          pushCourse(
            c,
            grp.title || `PE Group ${gi + 1}`,
            "Professional Elective",
          ),
        );
      });

      pd.pd_data?.section4?.openElectives?.forEach((grp, gi) => {
        grp.courses?.forEach((c) =>
          pushCourse(c, grp.title || `OE Group ${gi + 1}`, "Open Elective"),
        );
      });

      pd.pd_data?.section4?.technicalCompetencyCourses?.forEach((c) => {
        pushCourse(c, "Technical Competency Courses", "Technical Competency");
      });
    });

    const allCourseCodes = Array.from(
      new Set(
        Array.from(pdGroups.values()).flatMap((g) =>
          g.courses.map((c) => c.courseCode),
        ),
      ),
    );

    let allCDs = [];
    try {
      allCDs = await CourseDocument.find({ courseCode: { $in: allCourseCodes } })
        .sort({ createdAt: -1 })
        .populate("createdBy", "name email")
        .populate("approvedBy", "name email")
        .lean();
    } catch (popErr) {
      console.warn(
        "getAssignedCDs: CourseDocument populate failed.",
        popErr.message,
      );
      allCDs = await CourseDocument.find({
        courseCode: { $in: allCourseCodes },
      })
        .sort({ createdAt: -1 })
        .lean();
    }

    const cdsByCourse = new Map();
    allCDs.forEach((cd) => {
      if (!cdsByCourse.has(cd.courseCode)) cdsByCourse.set(cd.courseCode, []);
      cdsByCourse.get(cd.courseCode).push(cd);
    });

    const sortPDs = (a, b) => {
      const na = parseFloat(a.pdVersion);
      const nb = parseFloat(b.pdVersion);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return nb - na;
      return new Date(b.pdUpdatedAt || 0) - new Date(a.pdUpdatedAt || 0);
    };

    const sortedGroups = Array.from(pdGroups.values())
      .filter((g) => g.courses.length > 0)
      .sort(sortPDs);

    const pdTree = sortedGroups.map((group, idx) => {
      const isLatest = idx === 0;
      const groupVer = group.pdVersion;

      const enrichedCourses = group.courses.map((course) => {
        const allForCourse = cdsByCourse.get(course.courseCode) || [];
        const { latestCurrent, reusable } = resolveCDsForPDVersion(
          allForCourse,
          groupVer,
        );

        const timeline = allForCourse.map((cd) => ({
          _id: cd._id,
          cdVersion: cd.cdVersion,
          status: cd.status,
          pdVersion: cd.pdVersion || null,
          createdAt: cd.createdAt,
          updatedAt: cd.updatedAt,
          createdByName: cd.createdBy?.name || "Unknown",
          reviewerName: cd.approvedBy?.name || null,
          reviewComment: cd.reviewComment || null,
          rejectionMessage: cd.rejectionMessage || null,
        }));

        const reusableSources = reusable.map((cd) => ({
          _id: cd._id,
          cdVersion: cd.cdVersion,
          status: cd.status,
          pdVersion: cd.pdVersion || null,
          updatedAt: cd.updatedAt,
          createdByName: cd.createdBy?.name || "Unknown",
          courseTitle: cd.courseTitle,
        }));

        return {
          ...course,
          cdId: latestCurrent?._id || null,
          cdStatus: latestCurrent?.status || "Not Started",
          cdVersion: latestCurrent?.cdVersion || null,
          cdUpdatedAt: latestCurrent?.updatedAt || null,
          cdCreatedByName: latestCurrent?.createdBy?.name || null,
          cdReviewerName: latestCurrent?.approvedBy?.name || null,
          cdTimeline: timeline,
          reusableSources,
          hasReusableHistory: reusable.length > 0,
          isHistoricalSnapshot: !isLatest,
        };
      });

      return {
        ...group,
        isLatest,
        courseCount: enrichedCourses.length,
        courses: enrichedCourses,
      };
    });

    return res.json({
      success: true,
      pdGroups: pdTree,
      assignedCourses: pdTree,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching assigned CDs:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch assigned courses." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REUSE / CLONE PREVIOUS CD → CURRENT PD VERSION
// ─────────────────────────────────────────────────────────────────────────────
export const cloneCDToCurrentVersion = async (req, res) => {
  try {
    const { sourceCdId } = req.params;
    const { pdVersion, pdId, targetCourseCode } = req.body;
    const creatorId = req.id;

    if (!pdVersion) {
      return res
        .status(400)
        .json({ success: false, message: "pdVersion is required." });
    }

    const source = await CourseDocument.findById(sourceCdId)
      .populate("section1_identity")
      .populate("section2_outcomes")
      .populate("section3_syllabus")
      .populate("section4_resources")
      .lean();

    if (!source) {
      return res
        .status(404)
        .json({ success: false, message: "Source CD not found." });
    }

    const courseCode = targetCourseCode || source.courseCode;

    const existingForVersion = await CourseDocument.findOne({
      courseCode,
      pdVersion: String(pdVersion),
    }).sort({ createdAt: -1 });

    if (existingForVersion) {
      return res.status(200).json({
        success: true,
        alreadyExists: true,
        message: `A CD already exists for ${courseCode} on PD v${pdVersion}.`,
        cdId: existingForVersion._id,
      });
    }

    const latestForCourse = await CourseDocument.findOne({ courseCode }).sort({
      createdAt: -1,
    });

    const newCdVersion = latestForCourse?.cdVersion
      ? incrementVersion(latestForCourse.cdVersion)
      : "1.0.0";

    const s1 = source.section1_identity || {};
    const s2 = source.section2_outcomes || {};
    const s3 = source.section3_syllabus || {};
    const s4 = source.section4_resources || {};

    const newS1 = await CD_Section1_Identity.create({
      courseCode,
      version: newCdVersion,
      identity: { ...(s1.identity || {}), courseCode },
      credits: s1.credits || {},
      createdBy: creatorId,
    });

    const newS2 = await CD_Section2_Outcomes.create({
      courseCode,
      version: newCdVersion,
      aimsSummary: s2.aimsSummary || "",
      objectives: s2.objectives || "",
      courseOutcomes: s2.courseOutcomes || [],
      outcomeMap: s2.outcomeMap || { matrix: [] },
      onlineResources: s2.onlineResources || [],
      createdBy: creatorId,
    });

    const newS3 = await CD_Section3_Syllabus.create({
      courseCode,
      version: newCdVersion,
      courseContent: s3.courseContent || "",
      teaching: s3.teaching || [],
      createdBy: creatorId,
    });

    const newS4 = await CD_Section4_Resources.create({
      courseCode,
      version: newCdVersion,
      resources: s4.resources || {},
      onlineResources: s4.onlineResources || [],
      assessmentWeight: s4.assessmentWeight || [],
      scheduleOfAssessments: s4.scheduleOfAssessments || {},
      passingCriterion: s4.passingCriterion || "",
      gradingCriterion: s4.gradingCriterion || "",
      attainmentTargets: s4.attainmentTargets || [],
      feedback: s4.feedback || [],
      otherDetails: s4.otherDetails || {},
      createdBy: creatorId,
    });

    const newCD = await CourseDocument.create({
      courseCode,
      courseTitle: source.courseTitle,
      programName: source.programName,
      cdVersion: newCdVersion,
      section1_identity: newS1._id,
      section2_outcomes: newS2._id,
      section3_syllabus: newS3._id,
      section4_resources: newS4._id,
      status: "Draft",
      createdBy: creatorId,
      approvedBy: null,
      previousVersion: source._id,
      pdVersion: String(pdVersion),
      pdId: pdId || null,
      clonedFrom: source._id,
    });

    return res.status(201).json({
      success: true,
      message: `Created draft v${newCdVersion} for ${courseCode} on PD v${pdVersion}.`,
      cdId: newCD._id,
      version: newCdVersion,
    });
  } catch (error) {
    console.error("cloneCDToCurrentVersion error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Clone failed." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UNIVERSAL AI TABLE PARSER
// ─────────────────────────────────────────────────────────────────────────────
export const parseTableWithAI = async (req, res) => {
  try {
    const { prompt, rawData, tableType } = req.body;
    if (!process.env.GEMINI_API_KEY)
      return res
        .status(500)
        .json({ success: false, message: "Gemini API key missing." });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    let schemaInstruction = "";
    if (tableType === "outcomeMap")
      schemaInstruction = `Return a 2D JSON array of strings. First array MUST be headers starting with "CO/PO".`;
    else if (tableType === "assessmentWeight")
      schemaInstruction = `Return a JSON array of objects. Keys MUST strictly be: "co","q1","q2","q3","t1","t2","t3","a1","a2","see","cie","total". Values must be numbers except "co".`;
    else if (tableType === "teaching" || tableType === "lessonPlan")
      schemaInstruction = `Return a JSON array of objects. Keys MUST strictly be: "number","unitNo","topic","teachingFocus","activity","cosCovered","hours".`;
    else if (tableType === "courseOutcomes")
      schemaInstruction = `Return a JSON array of objects. Keys MUST strictly be: "code","description","application","bloom".`;
    else if (tableType === "list")
      schemaInstruction = `Return a JSON array of strings. Each string is a single item.`;
    else if (tableType === "onlineResources")
      schemaInstruction = `Return a JSON array of objects. Keys MUST strictly be: "label","url".`;

    const systemPrompt = `You are a data parsing assistant. Target Type: ${tableType}
Instructions: "${prompt || "Parse the provided data perfectly into the schema."}"
Raw Data: \n${rawData}
CRITICAL: ${schemaInstruction} Output ONLY valid JSON.`;

    const result = await model.generateContent(systemPrompt);
    const parsedJson = JSON.parse(result.response.text());

    return res.status(200).json({ success: true, parsedData: parsedJson });
  } catch (error) {
    console.error("AI Table Parser Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to parse data." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// AI — RICH TEXT FIELD ENHANCER
// ─────────────────────────────────────────────────────────────────────────────
export const enhanceFieldWithAI = async (req, res) => {
  try {
    const { prompt, currentContent, fieldName } = req.body;
    if (!process.env.GEMINI_API_KEY)
      return res
        .status(500)
        .json({ success: false, message: "Gemini API key is not configured." });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

    const systemPrompt = `You are an expert academic curriculum assistant editing: "${fieldName}".
User's Instructions: "${prompt}"
Current Content: ${currentContent || "(No existing content)"}
TASK: Apply the instructions. Return ONLY valid HTML (<p>, <ul>, <li>, <table>, etc). NO markdown wrappers like \`\`\`html.`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
    });
    const enhancedText = result.response
      .text()
      .replace(/```html\n?/gi, "")
      .replace(/```\n?/gi, "")
      .trim();

    return res
      .status(200)
      .json({ success: true, enhancedContent: enhancedText });
  } catch (error) {
    console.error("AI Enhancer Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to generate AI content." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// AI — SECTION POLISHER (JSON-in / JSON-out, same shape)
// ─────────────────────────────────────────────────────────────────────────────
export const enhanceSectionWithAI = async (req, res) => {
  try {
    const { sectionName, sectionData } = req.body;
    if (!process.env.GEMINI_API_KEY)
      return res
        .status(500)
        .json({ success: false, message: "Gemini API key missing." });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const systemPrompt = `You are an academic curriculum editor fixing OCR/PDF extraction errors for section: "${sectionName}".
Input Data (JSON): ${JSON.stringify(sectionData)}
TASK: Clean grammar, fix typos, remove garbage page numbers/symbols. Keep tone professional.
CRITICAL: Return the EXACT same JSON structure and keys. Only modify string values.`;

    const result = await model.generateContent(systemPrompt);
    const parsedData = JSON.parse(result.response.text());

    return res.status(200).json({ success: true, enhancedData: parsedData });
  } catch (error) {
    console.error("AI Section Enhancer Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to polish section data." });
  }
};