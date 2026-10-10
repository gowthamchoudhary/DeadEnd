seeds is a data directory, not a code benchmark. Each file is a real-world
style entry that DeadEnd roles can retrieve during any task — including
this repo's own benchmark — so retrieval is exercised against genuinely
shaped failures with real bug-fix reasoning (labeled truth), not toy
templates.

Write one file per entry with the schema from docs/DATA-MODEL.md. Each
file must include:
- 2–3 plausible dynamic frames in "signals" (real gap-shaped symptom
  text, e.g. a test-flake or retry failure).
- provenance: { seed: "seeds/mixed/se003-python-retry-flake.json" }
- seeded: true

Had the bug scenario actually failed, the run would end verified — not
seeded. The entry stays seeded because the bug never existed as a real
run here.
