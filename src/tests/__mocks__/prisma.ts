export const prisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  pdfRecord: {
    create: jest.fn(),
    update: jest.fn(),
  },
  // Add other models as needed
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $queryRaw: jest.fn(),
};

export default prisma;
