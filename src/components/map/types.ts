import type { PlacedMember } from "@/lib/location/map";
import type { Geofence } from "@/types/models";

export interface MyPosition {
  lat: number;
  lng: number;
  accuracy: number;
  /** "shared" = what you are currently sharing; "local" = shown only on this screen. */
  kind: "shared" | "local";
}

export interface FamilyMapViewProps {
  familyId: string;
  members: PlacedMember[];
  /** Safe zones of this family, drawn as circles. */
  zones: Geofence[];
  myUid: string;
  me: MyPosition | null;
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  now: number;
  /** Increment to re-fit the view to everyone. */
  fitToken: number;
  /** Increment to centre on `me`. */
  meToken: number;
  compact?: boolean;
}
