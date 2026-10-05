import snapshot from "./riva-terra-snapshot.json";
import { Extraction } from "./types";
export const capturedAt = snapshot.capturedAt;
export const previewSources = [
  {
    id: "demo-equity",
    property_id: "demo-property",
    group_id: "demo-group",
    url: snapshot.sourceUrl,
    adapter: "equity",
    status: "ok",
    error: null,
    extraction: snapshot.extraction as Extraction,
    last_checked_at: capturedAt,
    last_success_at: capturedAt,
    properties: {
      name: snapshot.extraction.propertyName || "Riva Terra",
      address: snapshot.extraction.address,
    },
  },
];
