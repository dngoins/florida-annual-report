/**
 * Audit API Routes
 * 
 * REST endpoints for the append-only audit logging system.
 * Per CONSTITUTION.md Principle IV: Audit logs are immutable.
 * 
 * Endpoints:
 * - POST /audit - Create a new audit log entry
 * - GET /audit/:company_id - Get audit history for a company
 * 
 * @module routes/audit
 */

const express = require('express');
const router = express.Router();

// Import audit service (injected via app.locals in production)
// For now, we use a factory pattern that allows dependency injection

/**
 * POST /audit
 * 
 * Create a new audit log entry.
 * 
 * Request body:
 * {
 *   "entity_id": "string (required)",
 *   "action": "UPLOAD|EXTRACT|VALIDATE|REVIEW|RECONCILE|SUBMIT|CONFIRM|ERROR (required)",
 *   "actor": "string (required)",
 *   "payload": "object (optional)",
 *   "company_id": "string (optional, defaults to entity_id)"
 * }
 * 
 * Response:
 * {
 *   "status": "success",
 *   "data": {
 *     "entry": { ... audit log entry ... }
 *   }
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const { entity_id, action, actor, payload, company_id } = req.body;

    // Validate required fields
    if (!entity_id) {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'MISSING_FIELD',
          message: 'entity_id is required'
        }
      });
    }

    if (!action) {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'MISSING_FIELD',
          message: 'action is required'
        }
      });
    }

    if (!actor) {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'MISSING_FIELD',
          message: 'actor is required'
        }
      });
    }

    // Validate action type
    const validActions = ['UPLOAD', 'EXTRACT', 'VALIDATE', 'REVIEW', 'RECONCILE', 'SUBMIT', 'CONFIRM', 'ERROR'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'INVALID_ACTION',
          message: `Invalid action type: ${action}. Must be one of: ${validActions.join(', ')}`
        }
      });
    }

    // Get audit service from app locals (dependency injection)
    const auditService = req.app.locals.auditService;
    if (!auditService) {
      return res.status(500).json({
        status: 'error',
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Audit service not configured'
        }
      });
    }

    // Create the audit entry
    const entry = await auditService.createEntry({
      entity_id,
      action,
      actor,
      payload: payload || {},
      company_id: company_id || entity_id
    });

    res.status(201).json({
      status: 'success',
      data: { entry }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /audit/:company_id
 * 
 * Get audit history for a company.
 * 
 * Path params:
 * - company_id: The company ID to get audit history for
 * 
 * Query params:
 * - action: Filter by action type (optional)
 * - actor: Filter by actor (optional)
 * - start_date: Filter entries after this date, ISO 8601 (optional)
 * - end_date: Filter entries before this date, ISO 8601 (optional)
 * - page: Page number, default 1 (optional)
 * - page_size: Entries per page, default 50 (optional)
 * 
 * Response:
 * {
 *   "status": "success",
 *   "data": {
 *     "company_id": "...",
 *     "entries": [...],
 *     "total_count": 100,
 *     "page": 1,
 *     "page_size": 50
 *   }
 * }
 */
router.get('/:company_id', async (req, res, next) => {
  try {
    const { company_id } = req.params;
    
    if (!company_id) {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'MISSING_FIELD',
          message: 'company_id is required'
        }
      });
    }

    // Parse query parameters
    const { action, actor, start_date, end_date, page, page_size } = req.query;

    // Validate action type if provided
    const validActions = ['UPLOAD', 'EXTRACT', 'VALIDATE', 'REVIEW', 'RECONCILE', 'SUBMIT', 'CONFIRM', 'ERROR'];
    if (action && !validActions.includes(action)) {
      return res.status(400).json({
        status: 'error',
        error: {
          code: 'INVALID_ACTION',
          message: `Invalid action filter: ${action}. Must be one of: ${validActions.join(', ')}`
        }
      });
    }

    // Get audit service from app locals
    const auditService = req.app.locals.auditService;
    if (!auditService) {
      return res.status(500).json({
        status: 'error',
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Audit service not configured'
        }
      });
    }

    // Query audit history
    const result = await auditService.getHistory({
      company_id,
      action: action || undefined,
      actor: actor || undefined,
      start_date: start_date || undefined,
      end_date: end_date || undefined,
      page: page ? parseInt(page, 10) : 1,
      page_size: page_size ? parseInt(page_size, 10) : 50
    });

    res.json({
      status: 'success',
      data: {
        company_id,
        entries: result.entries,
        total_count: result.total_count,
        page: result.page,
        page_size: result.page_size
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
