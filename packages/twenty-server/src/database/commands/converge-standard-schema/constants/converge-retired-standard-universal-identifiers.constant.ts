// Standard entities removed from the blueprint whose leftovers the convergence
// deletes from existing workspaces. This list is the ONLY way the convergence
// deletes anything: other standard entities missing from the blueprint are
// reported as `extra` and left in place. Only add an id here when its removal
// is a decided product change (the data in it is dropped with the column).
export const CONVERGE_RETIRED_STANDARD_UNIVERSAL_IDENTIFIERS = {
  fieldMetadata: [
    // mls.username: portal credentials are never stored (8d8aed3711, REQ00011)
    '64d37046-4f92-4e64-bcc1-9057bd3e9cc9',
    // mls.password: portal credentials are never stored (8d8aed3711, REQ00011)
    '839b9460-e307-4b93-9d08-ed7187f4e6f0',
  ],
  viewField: [
    // allMlses.username column (8d8aed3711)
    'bf460323-7cf5-4042-b41b-bbebbfffa899',
  ],
} as const satisfies Record<'fieldMetadata' | 'viewField', readonly string[]>;
