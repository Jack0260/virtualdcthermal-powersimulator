import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/Dashboard";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Virtual DC Thermal-Power Simulator" },
      { name: "description", content: "Predict rack-level power failures and cooling bottlenecks from streaming data-center telemetry." },
      { property: "og:title", content: "Virtual DC Thermal-Power Simulator" },
      { property: "og:description", content: "3D rack heat map, predictive failure analytics and automated cooling alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});
