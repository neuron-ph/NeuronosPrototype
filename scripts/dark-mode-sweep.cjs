#!/usr/bin/env node
// scripts/dark-mode-sweep.cjs
// Replaces hardcoded Tailwind color classes with CSS variable references
// across all .tsx files in src/components/ (excluding ui/ and figma/).

const fs = require("fs");
const path = require("path");

// Order matters: longer/more-specific patterns first to avoid partial matches.
const REPLACEMENTS = [
  // --- Backgrounds ---
  ["bg-\\[#F9FAFB\\]", "bg-[var(--theme-bg-page)]"],
  ["bg-\\[#F3F4F6\\]", "bg-[var(--theme-bg-surface-subtle)]"],
  ["bg-\\[#E8F2EE\\]", "bg-[var(--theme-bg-surface-tint)]"],
  ["bg-\\[#F0FDF9\\]", "bg-[var(--theme-bg-surface-tint)]"],
  ["bg-\\[#0D6560\\]", "bg-[var(--theme-action-primary-border)]"],
  ["bg-\\[#0F766E\\]", "bg-[var(--theme-action-primary-bg)]"],
  ["bg-white(?=[\\s\"'`{]|$)", "bg-[var(--theme-bg-surface)]"],
  ["bg-gray-50(?=[\\s\"'`{]|$)", "bg-[var(--theme-bg-surface-subtle)]"],
  ["bg-gray-100(?=[\\s\"'`{]|$)", "bg-[var(--theme-bg-surface-subtle)]"],
  ["bg-gray-200(?=[\\s\"'`{]|$)", "bg-[var(--theme-bg-surface-tint)]"],
  ["bg-gray-300(?=[\\s\"'`{]|$)", "bg-[var(--theme-bg-surface-tint)]"],
  // --- Text ---
  ["text-\\[#12332B\\]", "text-[var(--theme-text-primary)]"],
  ["text-\\[#0A1D4D\\]", "text-[var(--theme-text-primary)]"],
  ["text-\\[#101828\\]", "text-[var(--theme-text-primary)]"],
  ["text-\\[#000000\\]", "text-[var(--theme-text-primary)]"],
  ["text-\\[#374151\\]", "text-[var(--theme-text-secondary)]"],
  ["text-\\[#344054\\]", "text-[var(--theme-text-secondary)]"],
  ["text-\\[#667085\\]", "text-[var(--theme-text-muted)]"],
  ["text-\\[#6B7280\\]", "text-[var(--theme-text-muted)]"],
  ["text-\\[#6B7A76\\]", "text-[var(--theme-text-muted)]"],
  ["text-\\[#9CA3AF\\]", "text-[var(--theme-text-muted)]"],
  ["text-\\[#98A2B3\\]", "text-[var(--theme-text-muted)]"],
  ["text-\\[#0F766E\\]", "text-[var(--theme-action-primary-bg)]"],
  ["text-gray-300(?=[\\s\"'`{]|$)", "text-[var(--theme-text-muted)]"],
  ["text-gray-400(?=[\\s\"'`{]|$)", "text-[var(--theme-text-muted)]"],
  ["text-gray-500(?=[\\s\"'`{]|$)", "text-[var(--theme-text-muted)]"],
  ["text-gray-600(?=[\\s\"'`{]|$)", "text-[var(--theme-text-secondary)]"],
  ["text-gray-700(?=[\\s\"'`{]|$)", "text-[var(--theme-text-secondary)]"],
  ["text-gray-800(?=[\\s\"'`{]|$)", "text-[var(--theme-text-primary)]"],
  ["text-gray-900(?=[\\s\"'`{]|$)", "text-[var(--theme-text-primary)]"],
  // --- Borders ---
  ["border-\\[#E5E7EB\\]", "border-[var(--theme-border-default)]"],
  ["border-\\[#E5E9F0\\]", "border-[var(--theme-border-default)]"],
  ["border-\\[#E5ECE9\\]", "border-[var(--theme-border-default)]"],
  ["border-\\[#D1D5DB\\]", "border-[var(--theme-border-default)]"],
  ["border-\\[#D9D9D9\\]", "border-[var(--theme-border-default)]"],
  ["border-\\[#D0D5DD\\]", "border-[var(--theme-border-default)]"],
  ["border-\\[#0F766E\\]", "border-[var(--theme-action-primary-bg)]"],
  ["border-\\[#12332B\\]", "border-[var(--theme-text-primary)]"],
  ["border-gray-100(?=[\\s\"'`{]|$)", "border-[var(--theme-border-subtle)]"],
  ["border-gray-200(?=[\\s\"'`{]|$)", "border-[var(--theme-border-default)]"],
  ["border-gray-300(?=[\\s\"'`{]|$)", "border-[var(--theme-border-default)]"],
  ["border-gray-400(?=[\\s\"'`{]|$)", "border-[var(--theme-border-default)]"],
  // --- Opacity variants (bg-white/N, bg-gray-50/N) ---
  ["bg-white/90", "bg-[var(--theme-bg-surface)]/90"],
  ["bg-white/80", "bg-[var(--theme-bg-surface)]/80"],
  ["bg-white/50", "bg-[var(--theme-bg-surface)]/50"],
  ["bg-gray-50/50", "bg-[var(--theme-bg-surface-subtle)]/50"],
  ["bg-gray-50/30", "bg-[var(--theme-bg-surface-subtle)]/30"],
  // --- Inline style hex colors ---
  ["1px solid #F3F4F6", "1px solid var(--theme-border-subtle)"],
  ["1px solid #E5E9F0", "1px solid var(--theme-border-default)"],
  ["1px solid #E5E7EB", "1px solid var(--theme-border-default)"],
  ["1px solid #D1D5DB", "1px solid var(--theme-border-default)"],
  // inline style color: "hex"
  ['color: "#12332B"', 'color: "var(--theme-text-primary)"'],
  ['color: "#0A1D4D"', 'color: "var(--theme-text-primary)"'],
  ['color: "#101828"', 'color: "var(--theme-text-primary)"'],
  ['color: "#374151"', 'color: "var(--theme-text-secondary)"'],
  ['color: "#344054"', 'color: "var(--theme-text-secondary)"'],
  ['color: "#667085"', 'color: "var(--theme-text-muted)"'],
  ['color: "#6B7280"', 'color: "var(--theme-text-muted)"'],
  ['color: "#6B7A76"', 'color: "var(--theme-text-muted)"'],
  ['color: "#9CA3AF"', 'color: "var(--theme-text-muted)"'],
  ['color: "#98A2B3"', 'color: "var(--theme-text-muted)"'],
  ['color: "#D1D5DB"', 'color: "var(--theme-border-default)"'],
  ['color: "#D9D9D9"', 'color: "var(--theme-border-default)"'],
  ['color: "#0F766E"', 'color: "var(--theme-action-primary-bg)"'],
  // inline style backgroundColor: "hex"
  ['backgroundColor: "#F9FAFB"', 'backgroundColor: "var(--theme-bg-page)"'],
  ['backgroundColor: "#F3F4F6"', 'backgroundColor: "var(--theme-bg-surface-subtle)"'],
  ['backgroundColor: "#E5E9F0"', 'backgroundColor: "var(--theme-bg-surface-subtle)"'],
  ['backgroundColor: "#FFFFFF"', 'backgroundColor: "var(--theme-bg-surface)"'],
  ['backgroundColor: "#ffffff"', 'backgroundColor: "var(--theme-bg-surface)"'],
  ['backgroundColor: "white"', 'backgroundColor: "var(--theme-bg-surface)"'],
  ['backgroundColor: "#D1D5DB"', 'backgroundColor: "var(--theme-border-default)"'],
  ['backgroundColor: "#D9D9D9"', 'backgroundColor: "var(--theme-border-default)"'],
  ['backgroundColor: "#0F766E"', 'backgroundColor: "var(--theme-action-primary-bg)"'],
  // inline style borderColor: "hex"
  ['borderColor: "#E5E7EB"', 'borderColor: "var(--theme-border-default)"'],
  ['borderColor: "#E5E9F0"', 'borderColor: "var(--theme-border-default)"'],
  ['borderColor: "#D1D5DB"', 'borderColor: "var(--theme-border-default)"'],
  // inline style background: "hex" (shorthand form)
  ['background: "#FFFFFF"', 'background: "var(--theme-bg-surface)"'],
  ['background: "#ffffff"', 'background: "var(--theme-bg-surface)"'],
  ['background: "white"', 'background: "var(--theme-bg-surface)"'],
  ['background: "#F9FAFB"', 'background: "var(--theme-bg-page)"'],
  ['background: "#F3F4F6"', 'background: "var(--theme-bg-surface-subtle)"'],
  ['background: "#F8FBFB"', 'background: "var(--theme-bg-page)"'],
  ['background: "#E8F5F3"', 'background: "var(--theme-bg-surface-tint)"'],
  ['background: "#E8F2EE"', 'background: "var(--theme-bg-surface-tint)"'],
  ['background: "#F0FDF9"', 'background: "var(--theme-bg-surface-tint)"'],
  ['background: "#F0FDFA"', 'background: "var(--theme-bg-surface-tint)"'],
  // additional backgroundColor variants
  ['backgroundColor: "#E8F5F3"', 'backgroundColor: "var(--theme-bg-surface-tint)"'],
  ['backgroundColor: "#E8F2EE"', 'backgroundColor: "var(--theme-bg-surface-tint)"'],
  ['backgroundColor: "#F0FDF9"', 'backgroundColor: "var(--theme-bg-surface-tint)"'],
  ['backgroundColor: "#F0FDFA"', 'backgroundColor: "var(--theme-bg-surface-tint)"'],
  ['backgroundColor: "#F8FBFB"', 'backgroundColor: "var(--theme-bg-page)"'],
  // imperative style assignments (event handlers)
  ['style.backgroundColor = "#FFFFFF"', 'style.backgroundColor = "var(--theme-bg-surface)"'],
  ['style.backgroundColor = "#ffffff"', 'style.backgroundColor = "var(--theme-bg-surface)"'],
  ['style.backgroundColor = "#F9FAFB"', 'style.backgroundColor = "var(--theme-bg-page)"'],
  ['style.backgroundColor = "#F3F4F6"', 'style.backgroundColor = "var(--theme-bg-surface-subtle)"'],
  ['style.backgroundColor = "#F7FAF8"', 'style.backgroundColor = "var(--theme-bg-page)"'],
  ['style.backgroundColor = "#F1F6F4"', 'style.backgroundColor = "var(--theme-bg-surface-tint)"'],
  ['style.backgroundColor = "#E8F5F3"', 'style.backgroundColor = "var(--theme-bg-surface-tint)"'],
  ['style.backgroundColor = "#E5E9F0"', 'style.backgroundColor = "var(--theme-bg-surface-subtle)"'],
  ['style.backgroundColor = "#F0FDFA"', 'style.backgroundColor = "var(--theme-bg-surface-tint)"'],
  ['style.backgroundColor = "#F0FDF9"', 'style.backgroundColor = "var(--theme-bg-surface-tint)"'],
  ['style.backgroundColor = "#0F766E"', 'style.backgroundColor = "var(--theme-action-primary-bg)"'],
  ['style.backgroundColor = "#0D6560"', 'style.backgroundColor = "var(--theme-action-primary-border)"'],
  ['style.background = "#0F766E"', 'style.background = "var(--theme-action-primary-bg)"'],
  ['style.background = "#0D6560"', 'style.background = "var(--theme-action-primary-border)"'],
  ['style.borderColor = "#0F766E"', 'style.borderColor = "var(--theme-action-primary-bg)"'],
  ['style.borderColor = "#E5E7EB"', 'style.borderColor = "var(--theme-border-default)"'],
  ['style.borderColor = "#E5E9F0"', 'style.borderColor = "var(--theme-border-default)"'],
  ['style.borderColor = "#D1D5DB"', 'style.borderColor = "var(--theme-border-default)"'],
  ['style.color = "#667085"', 'style.color = "var(--theme-text-muted)"'],
  ['style.color = "#6B7280"', 'style.color = "var(--theme-text-muted)"'],
  ['style.color = "#9CA3AF"', 'style.color = "var(--theme-text-muted)"'],
  ['style.color = "#12332B"', 'style.color = "var(--theme-text-primary)"'],
  // Ternary-embedded option selected/unselected backgrounds (dropdowns, selects)
  ['backgroundColor: isSelected \\? "#E8F5F3" : "#FFFFFF"', 'backgroundColor: isSelected ? "var(--theme-state-selected)" : "var(--theme-bg-surface)"'],
  ['e\\.currentTarget\\.style\\.backgroundColor = isSelected \\? "#E8F5F3" : "#FFFFFF"', 'e.currentTarget.style.backgroundColor = isSelected ? "var(--theme-state-selected)" : "var(--theme-bg-surface)"'],
  ['color: isSelected \\? "#0F766E" : "#12332B"', 'color: isSelected ? "var(--theme-action-primary-bg)" : "var(--theme-text-primary)"'],
  ['color: isSelected \\? "#0F766E" : "#0a1d4d"', 'color: isSelected ? "var(--theme-action-primary-bg)" : "var(--theme-text-primary)"'],
  // Month/year picker ternary patterns
  ['backgroundColor: index === viewDate\\.getMonth\\(\\) \\? "#E8F5F3" : "white"', 'backgroundColor: index === viewDate.getMonth() ? "var(--theme-state-selected)" : "var(--theme-bg-surface)"'],
  ['e\\.currentTarget\\.style\\.backgroundColor = index === viewDate\\.getMonth\\(\\) \\? "#E8F5F3" : "white"', 'e.currentTarget.style.backgroundColor = index === viewDate.getMonth() ? "var(--theme-state-selected)" : "var(--theme-bg-surface)"'],
  ['color: index === viewDate\\.getMonth\\(\\) \\? "#0F766E" : "var\\(--neuron-ink-primary\\)"', 'color: index === viewDate.getMonth() ? "var(--theme-action-primary-bg)" : "var(--theme-text-primary)"'],
  ['backgroundColor: year === viewDate\\.getFullYear\\(\\) \\? "#E8F5F3" : "white"', 'backgroundColor: year === viewDate.getFullYear() ? "var(--theme-state-selected)" : "var(--theme-bg-surface)"'],
  ['e\\.currentTarget\\.style\\.backgroundColor = year === viewDate\\.getFullYear\\(\\) \\? "#E8F5F3" : "white"', 'e.currentTarget.style.backgroundColor = year === viewDate.getFullYear() ? "var(--theme-state-selected)" : "var(--theme-bg-surface)"'],
  ['color: year === viewDate\\.getFullYear\\(\\) \\? "#0F766E" : "var\\(--neuron-ink-primary\\)"', 'color: year === viewDate.getFullYear() ? "var(--theme-action-primary-bg)" : "var(--theme-text-primary)"'],
  // Trigger button disabled/enabled backgrounds (inline style)
  ['backgroundColor: disabled \\? "#F3F4F6" : "#FFFFFF"', 'backgroundColor: disabled ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)"'],
  ['backgroundColor: disabled \\? "#F9FAFB" : "#FFFFFF"', 'backgroundColor: disabled ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)"'],
  ['backgroundColor: disabled \\? "#F3F4F6" : "white"', 'backgroundColor: disabled ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)"'],
  // JSX icon color= prop (Lucide icons)
  ['color="#12332B"', 'color="var(--theme-text-primary)"'],
  ['color="#0A1D4D"', 'color="var(--theme-text-primary)"'],
  ['color="#374151"', 'color="var(--theme-text-secondary)"'],
  ['color="#667085"', 'color="var(--theme-text-muted)"'],
  ['color="#6B7280"', 'color="var(--theme-text-muted)"'],
  ['color="#9CA3AF"', 'color="var(--theme-text-muted)"'],
  ['color="#98A2B3"', 'color="var(--theme-text-muted)"'],
  ['color="#0F766E"', 'color="var(--theme-action-primary-bg)"'],
];

const COMPILED = REPLACEMENTS.map(([pattern, replacement]) => [
  new RegExp(pattern, "g"),
  replacement,
]);

function collectFiles(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip ui/ (shadcn already has dark: variants) and figma/ (protected)
      if (entry.name === "ui" || entry.name === "figma") continue;
      collectFiles(fullPath, results);
    } else if (entry.name.endsWith(".tsx")) {
      results.push(fullPath);
    }
  }
  return results;
}

function transformFile(filePath, dryRun = false) {
  let content = fs.readFileSync(filePath, "utf8");
  let changed = false;
  for (const [regex, replacement] of COMPILED) {
    const next = content.replace(regex, replacement);
    if (next !== content) {
      changed = true;
      content = next;
    }
  }
  if (changed && !dryRun) {
    fs.writeFileSync(filePath, content, "utf8");
  }
  return changed;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const targetDir = path.resolve(__dirname, "../src/components");

const files = collectFiles(targetDir);
let modifiedCount = 0;

for (const file of files) {
  const changed = transformFile(file, dryRun);
  if (changed) {
    modifiedCount++;
    console.log(`${dryRun ? "[dry]" : "[mod]"} ${path.relative(process.cwd(), file)}`);
  }
}

console.log(
  `\nDone. ${modifiedCount}/${files.length} files ${dryRun ? "would be" : "were"} modified.`
);
