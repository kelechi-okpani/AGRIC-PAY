export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  totalPages: number;
}

export const paginate = <T>(
  data: T[],
  total: number,
  options: PaginationOptions
): PaginatedResult<T> => {
  const limit = options.limit || 20;
  const offset = options.offset || 0;

  return {
    data,
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
    totalPages: Math.ceil(total / limit),
  };
};

export const buildPaginationQuery = (options: PaginationOptions) => ({
  skip: options.offset || 0,
  limit: options.limit || 20,
});

export const validatePagination = (options: PaginationOptions): PaginationOptions => ({
  limit: Math.min(Math.max(options.limit || 20, 1), 100),
  offset: Math.max(options.offset || 0, 0),
});