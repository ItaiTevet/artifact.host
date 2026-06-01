import { ServiceError, type ServiceErrorCode } from '@/lib/artifacts/errors';

const STATUS: Record<ServiceErrorCode, number> = {
  too_large: 413,
  invalid_ttl: 400,
  invalid_visibility: 400,
  password_required: 400,
  not_found: 404,
  forbidden: 403,
  unauthorized: 401,
  rate_limited: 429,
  live_cap_reached: 429,
};

export function errorResponse(err: unknown): Response {
  if (err instanceof ServiceError) {
    return Response.json({ error: err.code, message: err.message }, { status: STATUS[err.code] });
  }
  console.error(err);
  return Response.json({ error: 'internal', message: 'Unexpected error' }, { status: 500 });
}
