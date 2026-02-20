import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const force = process.argv.includes("--yes");
  if (!force) {
    console.error(
      "[reset-data] Refusing to run without --yes. Example: npm run reset:data -- --yes"
    );
    process.exit(1);
  }

  const [jobs, assets, panels, episodes, series] = await prisma.$transaction([
    prisma.job.deleteMany({}),
    prisma.asset.deleteMany({}),
    prisma.panel.deleteMany({}),
    prisma.episode.deleteMany({}),
    prisma.series.deleteMany({}),
  ]);

  console.log(
    `[reset-data] done jobs=${jobs.count} assets=${assets.count} panels=${panels.count} episodes=${episodes.count} series=${series.count}`
  );
}

main()
  .catch((error) => {
    console.error("[reset-data] failed:", error?.message ?? error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
