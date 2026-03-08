/** True when mock/demo data is allowed (local dev, test, or NEXT_PUBLIC_DEMO_MODE=true). */
export const isDemoAllowed =
  process.env.NODE_ENV === 'development'
  || process.env.NODE_ENV === 'test'
  || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
