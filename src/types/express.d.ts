import { User as PrismaUser, App, Service } from '@prisma/client';

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends PrismaUser {} // Extend Passport's User interface with Prisma's

    interface Request {
      user?: PrismaUser;
      currentApp?: App;
      service?: Service;
      limitReached?: boolean;
      featureMissing?: boolean;
    }
  }
}
