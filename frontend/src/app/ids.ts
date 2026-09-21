const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route params are user-controlled; only UUID-shaped ids are passed on to the API. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
