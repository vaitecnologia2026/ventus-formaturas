import { PrismaClient } from '@prisma/client';
import { isTest } from '../config/env.js';

export const prisma = new PrismaClient({
  log: isTest ? [] : ['warn', 'error'],
});

export async function disconnect() {
  await prisma.$disconnect();
}
