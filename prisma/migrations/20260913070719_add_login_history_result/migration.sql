-- CreateEnum
CREATE TYPE "LoginResult" AS ENUM ('SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "LoginHistory" ADD COLUMN     "result" "LoginResult" NOT NULL DEFAULT 'SUCCESS';
