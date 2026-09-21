import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NER Logistics & Accessibility Platform",
    short_name: "NER Logistics",
    description: "Field reporting and road accessibility for a North-East India pilot",
    start_url: "/field",
    scope: "/",
    display: "standalone",
    background_color: "#f4f6f8",
    theme_color: "#0b5cad",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
