// scripts/test-workflow-e2e.js
// End-to-end workflow test for the ChamDiem grading system.
//
// Flow:
//   1. Login as linh123@gmail.com (preserved account).
//   2. Drop ALL data EXCEPT that user account.
//   3. Create a school year (with auto-generated weeks).
//   4. Create a class (10A) in that school year.
//   5. Create 3 students in that class.
//   6. Test CONDUCT grading workflow (the bug we just fixed):
//        - GET  /api/discipline-grading?classId=&week=1&schoolYear=  -> empty
//        - POST /api/discipline-grading/start                         -> 201
//        - POST /api/discipline-grading/start (again)                 -> 400 "đã tồn tại"
//        - GET  /api/discipline-grading?...                            -> 1 record
//        - PUT  /api/discipline-grading/:id (update a violation)       -> 200
//   7. Test ACADEMIC grading workflow:
//        - GET  /api/class-academic-grading?classId=&week=1            -> empty
//        - POST /api/class-academic-grading/start                      -> 201
//        - POST /api/class-academic-grading/start (again)              -> 400 "đã tồn tại"
//        - GET  /api/class-academic-grading?...                         -> 1 record
//        - PUT  /api/class-academic-grading/:id (update dayGradings)    -> 200
//   8. Cleanup: delete everything created in steps 3-7, keeping only the
//      keeper user account.
//
// Usage:
//   node scripts/test-workflow-e2e.js
//   node scripts/test-workflow-e2e.js --keep    # skip final cleanup
//
// Prerequisite: backend server running on http://localhost:5000.

'use strict';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';
const KEEP_USER_EMAIL = 'linh123@gmail.com';
const KEEP_USER_PASSWORD = 'linkcualinh@123';
const KEEP_FLAG = process.argv.includes('--keep');

// ---------------------------------------------------------------------------
// Tiny test framework
// ---------------------------------------------------------------------------
const results = [];
let token = null;
let keeperUserId = null;

function log(msg) { console.log(msg); }

function step(name) {
  log('\n==============================================================');
  log(`▶ ${name}`);
  log('==============================================================');
}

function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function safeJson(res) {
  try { return await res.json(); }
  catch (_) { try { return await res.text(); } catch (_) { return null; } }
}

async function assertOk(name, res, expectedStatus) {
  const got = res.status;
  const ok = got === expectedStatus;
  let detail = `HTTP ${got}`;
  if (!ok) {
    const body = await safeJson(res);
    detail += ` | body=${JSON.stringify(body).slice(0, 400)}`;
  }
  record(name, ok, detail);
  if (!ok) throw new Error(`${name} failed: expected ${expectedStatus}, got ${got}`);
}

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(`${BASE_URL}${path}`, opts);
}

async function apiJson(method, path, body) {
  const res = await api(method, path, body);
  const json = await safeJson(res);
  return { res, json };
}

// ---------------------------------------------------------------------------
// STEP 1: Drop all data except the keeper user (directly via mongoose)
// ---------------------------------------------------------------------------
async function dropAllExceptKeeper() {
  step('Drop ALL data except keeper user');
  require('dotenv').config();
  const mongoose = require('mongoose');
  const { connectDB } = require('../config/database');
  await connectDB();

  const User = require('../models/User');
  const SchoolYear = require('../models/SchoolYear');
  const Week = require('../models/Week');
  const Class = require('../models/Class');
  const Student = require('../models/Student');
  const DisciplineGrading = require('../models/DisciplineGrading');
  const ClassAcademicGrading = require('../models/ClassAcademicGrading');
  const ViolationLog = require('../models/ViolationLog');
  const ViolationType = require('../models/ViolationType');
  const WeeklySummary = require('../models/WeeklySummary');
  const MonthlySummary = require('../models/MonthlySummary');
  const ConductScore = require('../models/ConductScore');
  const AcademicScore = require('../models/AcademicScore');

  let keeper = await User.findOne({ email: KEEP_USER_EMAIL }).select('+password');
  if (!keeper) {
    // Create the keeper user if it does not exist yet. The user explicitly
    // asked us to preserve linh123@gmail.com, so we provision it here with
    // the Quản trị role so the workflow test has permission to call every
    // endpoint (create school year, class, students, start grading, ...).
    // Pass the PLAIN password — the User model's pre-save hook hashes it.
    const { getRolePermissions } = require('../utils/helpers');
    keeper = await User.create({
      email: KEEP_USER_EMAIL,
      password: KEEP_USER_PASSWORD,
      fullName: 'Admin Linh (Test)',
      role: 'Quản trị',
      isActive: true,
      permissions: getRolePermissions('Quản trị'),
    });
    keeperUserId = keeper._id.toString();
    log(`  Keeper created: ${KEEP_USER_EMAIL} (${keeperUserId})`);
  } else {
    keeperUserId = keeper._id.toString();
    log(`  Keeper exists: ${keeper.email} (${keeperUserId})`);
    // Ensure the keeper has Quản trị role + permissions so the test can
    // call every admin endpoint. Also reset the password to the known
    // value (in case a previous run double-hashed it) — the pre-save hook
    // will hash it once.
    const { getRolePermissions } = require('../utils/helpers');
    keeper.role = 'Quản trị';
    keeper.permissions = getRolePermissions('Quản trị');
    keeper.isActive = true;
    keeper.password = KEEP_USER_PASSWORD;
    keeper.loginAttempts = 0;
    keeper.lockUntil = null;
    await keeper.save();
    log('  Keeper reset to Quản trị role with known password');
  }

  const wipes = [
    ['AcademicScore', AcademicScore],
    ['ConductScore', ConductScore],
    ['MonthlySummary', MonthlySummary],
    ['WeeklySummary', WeeklySummary],
    ['ViolationLog', ViolationLog],
    ['ClassAcademicGrading', ClassAcademicGrading],
    ['DisciplineGrading', DisciplineGrading],
    ['Student', Student],
    ['Class', Class],
    ['Week', Week],
    ['ViolationType', ViolationType],
    ['SchoolYear', SchoolYear],
  ];
  for (const [name, model] of wipes) {
    const r = await model.deleteMany({});
    log(`  Dropped ${name}: ${r.deletedCount}`);
  }
  const userWipe = await User.deleteMany({ _id: { $ne: keeper._id } });
  log(`  Dropped User (except keeper): ${userWipe.deletedCount}`);

  keeper.refreshTokens = [];
  await keeper.save();

  // Ensure the corrected unique index is present on DisciplineGrading
  try {
    await DisciplineGrading.collection.dropIndex('class_1_week_1');
    log('  Dropped legacy index class_1_week_1 (if present)');
  } catch (_) { /* may not exist */ }
  try {
    await DisciplineGrading.collection.createIndex(
      { class: 1, schoolYear: 1, week: 1 },
      { unique: true, name: 'class_1_schoolYear_1_week_1', background: true }
    );
    log('  Ensured index class_1_schoolYear_1_week_1 (unique)');
  } catch (_) { /* already exists */ }

  record('Drop all data except keeper', true, `keeper=${keeper.email}`);
  await mongoose.disconnect();
}

// ---------------------------------------------------------------------------
// STEP 2: Login
// ---------------------------------------------------------------------------
async function doLogin() {
  step('Login as keeper user');
  const { res, json } = await apiJson('POST', '/api/auth/login', {
    email: KEEP_USER_EMAIL,
    password: KEEP_USER_PASSWORD,
  });
  await assertOk('POST /api/auth/login', res, 200);
  token = json.data.accessToken;
  keeperUserId = json.data.user._id;
  record('Got accessToken & userId', !!token && !!keeperUserId, `user=${keeperUserId}`);
}

// ---------------------------------------------------------------------------
// STEP 3: Create school year (auto-generates weeks)
// ---------------------------------------------------------------------------
async function createSchoolYear() {
  step('Create school year with auto-generated weeks');
  // Use a unique year string to avoid collisions with any leftover data.
  const year = '2099-2100';
  // Start on a Monday so week 1 starts cleanly.
  const startDate = '2099-08-09'; // a Monday
  const endDate = '2099-12-31';
  const { res, json } = await apiJson('POST', '/api/school-years', {
    year,
    startDate,
    endDate,
    autoGenerateWeeks: true,
    conductConfiguration: {
      maxPointsPerItem: 5,
      daysPerWeek: 5,
      items: [
        { name: 'Sinh hoạt dưới cờ', applicableDays: [2], order: 1 },
        { name: 'Truy bài', applicableDays: [3, 4, 5, 6], order: 2 },
        { name: 'Đeo thẻ', applicableDays: [2, 3, 4, 5, 6], order: 3 },
        { name: 'Vệ sinh lớp + khu vực', applicableDays: [2, 3, 4, 5, 6], order: 4 },
        { name: 'Đi học đúng giờ', applicableDays: [2, 3, 4, 5, 6], order: 5 },
        { name: 'Nếp sống văn minh', applicableDays: [2, 3, 4, 5, 6], order: 6 },
      ],
    },
    status: 'Hoạt động',
  });
  await assertOk('POST /api/school-years', res, 201);
  const sy = json.data.schoolYear;
  record('School year created', !!sy, `${sy.year} weeksCreated=${json.data.weeksCreated}`);
  return sy;
}

// ---------------------------------------------------------------------------
// STEP 4: Create a class
// ---------------------------------------------------------------------------
async function createClass(schoolYearId) {
  step('Create class 10A');
  const { res, json } = await apiJson('POST', '/api/classes', {
    name: '10A',
    schoolYear: schoolYearId,
    grade: 10,
  });
  await assertOk('POST /api/classes', res, 201);
  const cls = json.data.class;
  record('Class created', !!cls, `${cls.name} (${cls._id})`);
  return cls;
}

// ---------------------------------------------------------------------------
// STEP 5: Create students
// ---------------------------------------------------------------------------
async function createStudents(schoolYearId, classId) {
  step('Create 3 students in 10A');
  const students = [
    { studentId: 'HS2099001', fullName: 'Nguyễn Văn An', gender: 'Nam', dateOfBirth: '2009-01-15' },
    { studentId: 'HS2099002', fullName: 'Trần Thị Bình', gender: 'Nữ', dateOfBirth: '2009-02-20' },
    { studentId: 'HS2099003', fullName: 'Lê Hoàng Cường', gender: 'Nam', dateOfBirth: '2009-03-10' },
  ];
  const created = [];
  for (const s of students) {
    const { res, json } = await apiJson('POST', '/api/students', {
      ...s,
      class: classId,
      schoolYear: schoolYearId,
    });
    await assertOk(`POST /api/students (${s.studentId})`, res, 201);
    created.push(json.data.student);
  }
  record('3 students created', created.length === 3, `ids=${created.map(s => s._id).join(',')}`);
  return created;
}

// ---------------------------------------------------------------------------
// STEP 6: Conduct grading workflow
// ---------------------------------------------------------------------------
async function testConductGrading(schoolYearId, classId) {
  step('Conduct grading workflow (the bug we fixed)');

  // 6a. GET with no data — must be empty
  const getEmpty = await apiJson('GET', `/api/discipline-grading?classId=${classId}&week=1&schoolYear=${schoolYearId}`);
  await assertOk('GET /api/discipline-grading (empty)', getEmpty.res, 200);
  record('Empty list before start', Array.isArray(getEmpty.json.data) && getEmpty.json.data.length === 0, `count=${getEmpty.json.data?.length}`);

  // 6b. Find week 1 ObjectId via /api/weeks?schoolYear=
  const weeksRes = await apiJson('GET', `/api/weeks?schoolYear=${schoolYearId}&limit=1000`);
  await assertOk('GET /api/weeks', weeksRes.res, 200);
  const week1 = (weeksRes.json.data?.weeks || []).find(w => w.weekNumber === 1);
  record('Week 1 resolved', !!week1, `id=${week1?._id}`);
  if (!week1) throw new Error('Week 1 not found for school year');

  // 6c. POST /start → 201
  const start1 = await apiJson('POST', '/api/discipline-grading/start', {
    week: week1._id,
    class: classId,
    schoolYear: schoolYearId,
  });
  await assertOk('POST /api/discipline-grading/start (first)', start1.res, 201);
  const started = start1.json.data;
  record('Conduct grading started', !!started, `id=${started?._id} items=${started?.items?.length}`);

  // 6d. POST /start again → 400 "đã tồn tại" (this is the expected, correct
  //     behavior — same class+schoolYear+week already has a record)
  const start2 = await apiJson('POST', '/api/discipline-grading/start', {
    week: week1._id,
    class: classId,
    schoolYear: schoolYearId,
  });
  record('POST /start (duplicate) returns 400', start2.res.status === 400, `HTTP ${start2.res.status} msg=${start2.json?.message}`);
  // We do NOT throw here — a 400 is the expected outcome for the duplicate.

  // 6e. GET → 1 record
  const getOne = await apiJson('GET', `/api/discipline-grading?classId=${classId}&week=1&schoolYear=${schoolYearId}`);
  await assertOk('GET /api/discipline-grading (after start)', getOne.res, 200);
  record('One record after start', Array.isArray(getOne.json.data) && getOne.json.data.length === 1, `count=${getOne.json.data?.length}`);

  // 6f. PUT update — add 1 violation to item 1 (Sinh hoạt dưới cờ), day 2
  const record0 = getOne.json.data[0];
  const updatedItems = record0.items.map(item => {
    if (item.itemId === 1) {
      return {
        ...item,
        dayScores: item.dayScores.map(ds =>
          ds.day === 2 ? { ...ds, violations: 1, score: ds.score - 1 } : ds
        ),
      };
    }
    return item;
  });
  const putRes = await apiJson('PUT', `/api/discipline-grading/${record0._id}`, {
    items: updatedItems,
    status: 'Nháp',
  });
  await assertOk('PUT /api/discipline-grading/:id (update violation)', putRes.res, 200);
  const updated = putRes.json.data;
  const item1 = updated.items.find(i => i.itemId === 1);
  const day2 = item1.dayScores.find(ds => ds.day === 2);
  record('Violation persisted', day2 && day2.violations === 1, `item1.day2.violations=${day2?.violations}`);

  return record0._id;
}

// ---------------------------------------------------------------------------
// STEP 7: Academic grading workflow
// ---------------------------------------------------------------------------
async function testAcademicGrading(schoolYearId, classId) {
  step('Academic grading workflow');

  // 7a. GET with no data
  const getEmpty = await apiJson('GET', `/api/class-academic-grading?classId=${classId}&week=1`);
  await assertOk('GET /api/class-academic-grading (empty)', getEmpty.res, 200);
  record('Empty list before start', Array.isArray(getEmpty.json.data) && getEmpty.json.data.length === 0, `count=${getEmpty.json.data?.length}`);

  // 7b. Find week 1 ObjectId
  const weeksRes = await apiJson('GET', `/api/weeks?schoolYear=${schoolYearId}&limit=1000`);
  const week1 = (weeksRes.json.data?.weeks || []).find(w => w.weekNumber === 1);
  record('Week 1 resolved', !!week1, `id=${week1?._id}`);
  if (!week1) throw new Error('Week 1 not found for school year');

  // 7c. POST /start → 201
  const start1 = await apiJson('POST', '/api/class-academic-grading/start', {
    week: week1._id,
    class: classId,
  });
  await assertOk('POST /api/class-academic-grading/start (first)', start1.res, 201);
  const started = start1.json.data;
  record('Academic grading started', !!started, `id=${started?._id} dayGradings=${started?.dayGradings?.length}`);

  // 7d. POST /start again → 400
  const start2 = await apiJson('POST', '/api/class-academic-grading/start', {
    week: week1._id,
    class: classId,
  });
  record('POST /start (duplicate) returns 400', start2.res.status === 400, `HTTP ${start2.res.status} msg=${start2.json?.message}`);

  // 7e. GET → 1 record
  const getOne = await apiJson('GET', `/api/class-academic-grading?classId=${classId}&week=1`);
  await assertOk('GET /api/class-academic-grading (after start)', getOne.res, 200);
  record('One record after start', Array.isArray(getOne.json.data) && getOne.json.data.length === 1, `count=${getOne.json.data?.length}`);

  // 7f. PUT update — set dayGradings for day 2 with some period counts
  const record0 = getOne.json.data[0];
  const updatedDayGradings = record0.dayGradings.map(d =>
    d.day === 2
      ? { ...d, excellent: 5, good: 3, average: 2, poor: 0, bad: 0 }
      : d
  );
  const putRes = await apiJson('PUT', `/api/class-academic-grading/${record0._id}`, {
    dayGradings: updatedDayGradings,
    status: 'Nháp',
  });
  await assertOk('PUT /api/class-academic-grading/:id (update dayGradings)', putRes.res, 200);
  const updated = putRes.json.data;
  const day2 = updated.dayGradings.find(d => d.day === 2);
  record('DayGrading persisted', day2 && day2.excellent === 5, `day2.excellent=${day2?.excellent} dailyScore=${day2?.dailyScore}`);

  return record0._id;
}

// ---------------------------------------------------------------------------
// STEP 8: Final cleanup — wipe everything we created, keep only the user
// ---------------------------------------------------------------------------
async function finalCleanup() {
  step('Final cleanup: drop all data except keeper user');
  // Reuse the same wipe routine as the initial drop. This guarantees the
  // post-test state is identical to the pre-test state (only keeper user).
  await dropAllExceptKeeper();
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------
async function main() {
  log('ChamDiem E2E workflow test');
  log(`BASE_URL=${BASE_URL}  keeper=${KEEP_USER_EMAIL}  keep=${KEEP_FLAG}`);

  // 1. Wipe everything except keeper
  await dropAllExceptKeeper();

  // 2. Login
  await doLogin();

  // 3-5. Create school year, class, students
  const sy = await createSchoolYear();
  const cls = await createClass(sy._id);
  await createStudents(sy._id, cls._id);

  // 6. Conduct grading workflow
  await testConductGrading(sy._id, cls._id);

  // 7. Academic grading workflow
  await testAcademicGrading(sy._id, cls._id);

  // 8. Cleanup unless --keep
  if (KEEP_FLAG) {
    log('\n--keep specified: skipping final cleanup. Test data remains in DB.');
  } else {
    await finalCleanup();
  }

  // Summary
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  log('\n==============================================================');
  log(`SUMMARY: ${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) {
    log('Failed checks:');
    results.filter(r => !r.ok).forEach(r => { log(`  - ${r.name}: ${r.detail}`); });
  }
  log('==============================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  log(`\nFATAL: ${err.message}`);
  log(err.stack || '');
  const failed = results.filter(r => !r.ok).length;
  log(`SUMMARY (aborted): ${results.length - failed} passed, ${failed} failed`);
  process.exit(1);
});