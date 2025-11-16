/**
 * Pagination utilities
 */

/**
 * Parse pagination parameters from request
 */
function parsePagination(req) {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  
  return { limit, offset };
}

/**
 * Create pagination response metadata
 */
function createPaginationMeta(total, limit, offset) {
  return {
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
    page: Math.floor(offset / limit) + 1,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Paginate array
 */
function paginateArray(array, limit, offset) {
  return array.slice(offset, offset + limit);
}

module.exports = {
  parsePagination,
  createPaginationMeta,
  paginateArray
};
































