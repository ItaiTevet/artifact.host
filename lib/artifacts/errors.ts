export type ServiceErrorCode =
  | 'too_large'
  | 'invalid_ttl'
  | 'invalid_visibility'
  | 'password_required'
  | 'not_found'
  | 'forbidden'
  | 'unauthorized'
  | 'rate_limited'
  | 'live_cap_reached';

export class ServiceError extends Error {
  constructor(public code: ServiceErrorCode, message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}
