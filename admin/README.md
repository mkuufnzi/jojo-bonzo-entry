# Admin User Management

This project handles Admin users primarily through Database Seeding.

## How to Create Admin Users

### 1. Default Admins (Seeding)
The system comes with a pre-configured set of admin users defined in `src/services/seeder.service.ts`.

To create/reset these accounts, run the seed command:

```bash
npm run db:seed
```

**Default Credentials:**
- **Email:** `bwj.afs.tools.test@gmail.com`
- **Password:** `Password123!`
- **Role:** `ROOT`

*Other seeded roles include CEO, COO, DEVOPS, MARKETING, SUPPORT.*

### 2. Adding New Admins (Modifying Seed)
To permanently add a new admin (so they exist after DB resets):
1. Open `src/services/seeder.service.ts`.
2. Locate the `admins` array.
3. Add a new object:
   ```typescript
   { email: 'new.admin@afs.com', name: 'New Admin', role: 'SUPPORT' }
   ```
4. Run `npm run db:seed`.

### 3. Manually Promoting a User
If you have an existing user you want to promote to Admin:

**Via Prisma Studio:**
1. Run `npx prisma studio`.
2. Go to the `User` model.
3. Find the user.
4. Set `isAdmin` to `true`.
5. Set `role` to one of the allowed admin roles (e.g., `ROOT`, `SUPPORT`).
6. Save changes.

**Via SQL:**
```sql
UPDATE "User" SET "isAdmin" = true, "role" = 'ROOT' WHERE "email" = 'user@example.com';
```

## Admin Console Access

Once you have an admin account, you can access the admin dashboard at:

> **[URL]/admin** (e.g., http://localhost:3002/admin)

*Note: You must be logged in with an account that has `isAdmin: true`.*
