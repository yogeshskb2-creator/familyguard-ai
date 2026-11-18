/**
 * PREVIEW-ONLY sample data used to lay out the dashboard before Firebase is
 * connected. Never shown once Firebase is configured (see SetupBanner).
 * Delete this file when all widgets read from Firestore.
 */
const MIN = 60_000;

export const previewMembers = [
  { uid: "p1", name: "Ananya Sharma", role: "owner", color: "#4F7CFF", sharing: true, place: "Home", updatedMinAgo: 1, battery: 82 },
  { uid: "p2", name: "Rohan Sharma", role: "guardian", color: "#9B5CFF", sharing: true, place: "Office", updatedMinAgo: 4, battery: 56 },
  { uid: "p3", name: "Meera Sharma", role: "member", color: "#22E1FF", sharing: true, place: "School", updatedMinAgo: 12, battery: 34 },
  { uid: "p4", name: "Kabir Sharma", role: "member", color: "#FF4FD8", sharing: false, place: null, updatedMinAgo: 180, battery: null },
] as const;

export const previewActivity = [
  { day: "Mon", updates: 142, zoneEvents: 6 },
  { day: "Tue", updates: 168, zoneEvents: 8 },
  { day: "Wed", updates: 151, zoneEvents: 5 },
  { day: "Thu", updates: 189, zoneEvents: 9 },
  { day: "Fri", updates: 204, zoneEvents: 11 },
  { day: "Sat", updates: 96, zoneEvents: 3 },
  { day: "Sun", updates: 118, zoneEvents: 4 },
];

export const previewEvents = [
  { id: "e1", kind: "geofence_enter", text: "Meera arrived at School", at: Date.now() - 12 * MIN },
  { id: "e2", kind: "sharing_started", text: "Rohan started sharing location", at: Date.now() - 48 * MIN },
  { id: "e3", kind: "geofence_exit", text: "Ananya left Office", at: Date.now() - 3 * 60 * MIN },
  { id: "e4", kind: "sharing_stopped", text: "Kabir stopped sharing location", at: Date.now() - 3 * 60 * MIN },
] as const;
