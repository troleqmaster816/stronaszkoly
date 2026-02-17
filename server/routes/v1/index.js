import express from 'express'
import { registerHealthRoutes } from './health.js'
import { registerUserRoutes } from './users.js'
import { registerAuthRoutes } from './auth.js'
import { registerApiKeyRoutes } from './apikey.js'
import { registerTimetableRoutes } from './timetable.js'
import { registerAttendanceRoutes } from './attendance.js'
import { registerApprovalRoutes } from './approvals.js'
import { registerOverrideRoutes } from './overrides.js'
import { registerJobRoutes } from './jobs.js'
import { registerMaintenanceRoutes } from './maintenance.js'

export function createV1Router(deps) {
  const v1 = express.Router()

  registerHealthRoutes(v1)
  registerUserRoutes(v1, deps)
  registerAuthRoutes(v1, deps)
  registerApiKeyRoutes(v1, deps)
  registerTimetableRoutes(v1, deps)
  registerAttendanceRoutes(v1, deps)
  registerApprovalRoutes(v1, deps)
  registerOverrideRoutes(v1, deps)
  registerJobRoutes(v1, deps)
  registerMaintenanceRoutes(v1, deps)

  return v1
}
