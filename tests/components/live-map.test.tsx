import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Stand-in for the Google Maps wrapper: renders markers as plain DOM ──
const gm = vi.hoisted(() => ({ crashOnUnmount: false, crash: false, tiles: true, status: "LOADED", panTo: vi.fn(), fitBounds: vi.fn(), setZoom: vi.fn() }));
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: ReactNode }) => <div data-testid="google-map">{children}</div>,
  Map: ({ children, onClick, onTilesLoaded }: { children: ReactNode; onClick?: () => void; onTilesLoaded?: () => void }) => (
    <div data-testid="gmap" onClick={onClick} ref={() => {
      if (gm.tiles) setTimeout(() => onTilesLoaded?.());
    }}>
      {children}
    </div>
  ),
  AdvancedMarker: ({ children, onClick, title }: { children: ReactNode; onClick?: () => void; title?: string }) => {
    if (gm.crash) throw new TypeError("Cannot read properties of undefined (reading 'getRootNode')");
    // Mirrors Google's marker.js throwing from `set map` while the map is torn down.
    useEffect(
      () => () => {
        if (gm.crashOnUnmount) throw new TypeError("Cannot read properties of undefined (reading 'getRootNode')");
      },
      [],
    );
    return (
    <button type="button" data-testid="marker" aria-label={`marker ${title}`} onClick={(e) => (e.stopPropagation(), onClick?.())}>
      {children}
    </button>
    );
  },
  InfoWindow: ({ children }: { children: ReactNode }) => <div data-testid="infowindow">{children}</div>,
  ColorScheme: { DARK: "DARK" },
  useMap: () => ({ panTo: gm.panTo, fitBounds: gm.fitBounds, setZoom: gm.setZoom, getZoom: () => 12 }),
  useMapsLibrary: () => null,
  useApiLoadingStatus: () => gm.status,
}));

const env = vi.hoisted(() => ({ key: "test-key" }));
vi.mock("@/lib/env", () => ({
  publicEnv: {
    get mapsApiKey() {
      return env.key;
    },
    mapsMapId: "",
  },
}));

const sharing = vi.hoisted(() => ({ status: "off" as string, lastSent: null as null | object }));
vi.mock("@/components/location/LocationSharingProvider", () => ({ useSharing: () => sharing }));

import { LiveMap } from "@/components/map/LiveMap";
import { __resetMapsAuthFailure } from "@/components/map/authFailure";

const now = Date.now();
const members = [
  { uid: "ann", displayName: "Ann Lee", color: "#4F7CFF", role: "owner", sharing: true, location: { lat: 12.97, lng: 77.59, accuracy: 15, updatedAt: now - 30_000, presence: "online" } },
  { uid: "bob", displayName: "Bob Lee", color: "#9B5CFF", role: "member", sharing: true, location: { lat: 12.93, lng: 77.62, accuracy: 40, updatedAt: now - 3_600_000, presence: "offline" } },
  { uid: "cat", displayName: "Cat Lee", color: "#22E1FF", role: "member", sharing: false, location: null },
];

const zone = { id: "z1", familyId: "fam1", createdBy: "ann", name: "Home", kind: "home", lat: 12.95, lng: 77.6, radius: 300, alertsEnabled: true, notifyOnEnter: true, notifyOnExit: true, createdAt: 0 };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  __resetMapsAuthFailure();
  gm.tiles = true;
  gm.crash = false;
  gm.crashOnUnmount = false;
  env.key = "test-key";
  gm.status = "LOADED";
  sharing.status = "off";
  sharing.lastSent = null;
  fetchMock = vi.fn(async (url: string) =>
    String(url).endsWith("/geofences")
      ? new Response(JSON.stringify({ zones: [zone] }), { status: 200 })
      : new Response(JSON.stringify({ members, now }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const renderMap = () => render(<LiveMap families={[{ id: "fam1", name: "Lee Family" }]} myUid="ann" />);

describe("LiveMap (Google path)", () => {
  it("draws a coloured marker for each member sharing with this family — and none for others", async () => {
    renderMap();
    await waitFor(() => expect(screen.getAllByTestId(/^pin-/)).toHaveLength(2)); // member markers (zone labels are separate)
    expect(screen.getByTestId("pin-ann")).toHaveAttribute("data-online", "true");
    expect(screen.getByTestId("pin-bob")).toHaveAttribute("data-online", "false");
    expect(screen.queryByTestId("pin-cat")).toBeNull();
    expect(screen.getByTestId("sharing-count")).toHaveTextContent("2 of 3 sharing");
    expect(fetchMock).toHaveBeenCalledWith("/api/families/fam1/locations", expect.anything());
    await waitFor(() => expect(screen.getByTestId("zone-z1")).toBeInTheDocument()); // zone label on the Google map
  });

  it("opens a popup with status, last-updated time and accuracy when a marker is clicked", async () => {
    renderMap();
    await userEvent.click(await screen.findByRole("button", { name: "marker Bob Lee" }));
    const popup = within(screen.getByTestId("infowindow"));
    expect(popup.getByText("Offline")).toBeInTheDocument();
    expect(popup.getByText("Last seen")).toBeInTheDocument();
    expect(popup.getByText("1 h ago")).toBeInTheDocument();
    expect(popup.getByText("±40 m")).toBeInTheDocument();
    expect(popup.getByRole("link", { name: /Directions/ })).toHaveAttribute("href", expect.stringContaining("12.930000,77.620000"));
    expect(popup.getByRole("link", { name: /Profile/ })).toHaveAttribute("href", "/family/fam1/members/bob");
  });

  it("selecting a member in the list pans the map to them", async () => {
    renderMap();
    await userEvent.click(await screen.findByRole("button", { name: "Locate Bob Lee" }));
    expect(gm.panTo).toHaveBeenCalledWith(expect.objectContaining({ lat: 12.93, lng: 77.62 }));
    expect(screen.getByRole("button", { name: "Cat Lee is not sharing" })).toBeDisabled();
  });

  it("falls back when Google calls window.gm_authFailure (how Maps reports an invalid key)", async () => {
    renderMap();
    await screen.findAllByTestId("marker");
    act(() => window.gm_authFailure?.());
    await screen.findByTestId("schematic-map");
    expect(screen.getByText(/rejected the API key/)).toBeInTheDocument();
  });

  it("contains a crash inside Google's map code: only the map falls back, the page survives", async () => {
    gm.crash = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderMap();
    await screen.findByTestId("schematic-map");
    expect(screen.getByTestId("pin-ann")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Members" })).toBeInTheDocument();
  });

  it("survives Google's markers throwing while the map is torn down after a key rejection (regression)", async () => {
    gm.crashOnUnmount = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderMap();
    await screen.findAllByTestId("marker");
    act(() => window.gm_authFailure?.());
    await screen.findByTestId("schematic-map");
    expect(screen.getByText(/rejected the API key/)).toBeInTheDocument();
    expect(screen.getByTestId("pin-ann")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Members" })).toBeInTheDocument();
  });

  it("falls back if map tiles never load (watchdog), instead of a blank map", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    gm.tiles = false;
    renderMap();
    await screen.findAllByTestId("marker");
    await act(async () => {
      vi.advanceTimersByTime(15_001);
    });
    expect(await screen.findByTestId("schematic-map")).toBeInTheDocument();
    expect(screen.getByText(/couldn't be loaded/)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("does NOT fall back once tiles have loaded", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderMap();
    await screen.findAllByTestId("marker");
    await act(async () => {
      vi.advanceTimersByTime(10); // tiles load and React re-renders (cancelling the watchdog)…
    });
    await act(async () => {
      vi.advanceTimersByTime(20_000); // …so nothing happens when the deadline passes
    });
    expect(screen.queryByTestId("schematic-map")).toBeNull();
    expect(screen.getByTestId("google-map")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("falls back to the labelled schematic view when the loader reports AUTH_FAILURE", async () => {
    gm.status = "AUTH_FAILURE";
    renderMap();
    await screen.findByTestId("schematic-map");
    expect(screen.getByText(/rejected the API key/)).toBeInTheDocument();
    expect(screen.queryByTestId("google-map")).toBeNull();
  });

  it("'My location' shows your position locally and never posts it to the server", async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: 12.95, longitude: 77.6, accuracy: 25 } } as GeolocationPosition),
    );
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });
    vi.stubGlobal("isSecureContext", true);
    render(<LiveMap families={[{ id: "fam1", name: "Lee Family" }]} myUid="zed" />);
    await screen.findAllByTestId("marker");
    await act(() => userEvent.click(screen.getByRole("button", { name: "Show my location" })));
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(screen.getByTestId("pin-me")).toBeInTheDocument();
    expect(screen.getByText(/is shown only on this screen/)).toBeInTheDocument();
    const posted = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/location"));
    expect(posted).toEqual([]);
  });
});

describe("LiveMap (no API key)", () => {
  it("uses the schematic view, says why, and still shows real positions with a scale bar", async () => {
    env.key = "";
    renderMap();
    await screen.findByTestId("schematic-map");
    expect(screen.getByText(/isn't configured/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("pin-ann")).toBeInTheDocument());
    expect(screen.getByTestId("scale-bar")).toHaveTextContent(/m|km/);
    expect(screen.getByTestId("zone-z1")).toHaveTextContent("Home"); // safe zone drawn to scale
    await userEvent.click(screen.getByRole("button", { name: "Show Ann Lee" }));
    expect(screen.getByTestId("member-popup")).toHaveTextContent("Ann Lee");
    expect(screen.getByTestId("member-popup")).toHaveTextContent("(you)");
  });
});
