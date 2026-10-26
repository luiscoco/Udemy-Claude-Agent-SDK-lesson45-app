export const meta = {
  name: "classroom-audit-45",
  description: "Audit three classroom service files",
  phases: ["Audit"],
};
phase("Audit");
const files = ["services/catalog.txt", "services/orders.txt", "services/billing.txt"];
const audit = (file) => agent(
  "Read " + file + ". Report service, auth policy and any AUTH-MISSING-45 finding under 30 words. Do not edit files or use shell.",
  { label: file, model: "haiku", tools: ["Read"] },
);
const reports = await pipeline(files, audit);
return { services: files, reports };
