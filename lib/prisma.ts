import { PrismaClient } from '@prisma/client';

declare global {
  var __comicPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__comicPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  global.__comicPrisma = prisma;
}
