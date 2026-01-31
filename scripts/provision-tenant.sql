-- =============================================================================
-- POSTGRESQL MULTI-TENANT PROVISIONING SCRIPT
-- =============================================================================
-- This script creates an isolated tenant with their own:
-- 1. Role (user)
-- 2. Database
-- 3. Schema
-- 4. Proper grants and search path
-- =============================================================================
-- Usage: Replace TENANT_NAME, TENANT_PASSWORD with actual values
-- Run as superuser (postgres or database admin)
-- =============================================================================

-- CONFIGURATION (Replace these values)
\set tenant_name 'bpma_afs_tools'
\set tenant_password 'CHANGE_THIS_PASSWORD'
\set tenant_schema 'bpma_afs_tools_schema'

-- =============================================================================
-- STEP 1: Create Role (if not exists)
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'tenant_name' || '_admin') THEN
        EXECUTE format('CREATE ROLE %I_admin WITH LOGIN PASSWORD %L', :'tenant_name', :'tenant_password');
        RAISE NOTICE 'Created role: %_admin', :'tenant_name';
    ELSE
        RAISE NOTICE 'Role already exists: %_admin', :'tenant_name';
    END IF;
END
$$;

-- =============================================================================
-- STEP 2: Create Database (if not exists)
-- =============================================================================
-- Note: Must be run outside a transaction block
SELECT 'CREATE DATABASE ' || :'tenant_name' || ' OWNER ' || :'tenant_name' || '_admin'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'tenant_name');
\gexec

-- =============================================================================
-- STEP 3: Connect to the new database and create schema
-- =============================================================================
\c :tenant_name

-- Revoke default public schema access (security isolation)
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Create tenant-specific schema
CREATE SCHEMA IF NOT EXISTS :tenant_schema AUTHORIZATION :tenant_name_admin;

-- =============================================================================
-- STEP 4: Set search path for the role
-- =============================================================================
ALTER ROLE :tenant_name_admin SET search_path TO :tenant_schema;

-- =============================================================================
-- STEP 5: Grant permissions
-- =============================================================================
-- Grant usage on schema
GRANT USAGE ON SCHEMA :tenant_schema TO :tenant_name_admin;

-- Grant all privileges on all tables (existing and future)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA :tenant_schema TO :tenant_name_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA :tenant_schema TO :tenant_name_admin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA :tenant_schema TO :tenant_name_admin;

-- Grant default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA :tenant_schema 
GRANT ALL PRIVILEGES ON TABLES TO :tenant_name_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA :tenant_schema 
GRANT ALL PRIVILEGES ON SEQUENCES TO :tenant_name_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA :tenant_schema 
GRANT ALL PRIVILEGES ON FUNCTIONS TO :tenant_name_admin;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
\echo '======================================'
\echo 'Tenant Provisioning Complete!'
\echo '======================================'
\echo 'Database: ' :tenant_name
\echo 'Schema: ' :tenant_schema
\echo 'Role: ' :tenant_name '_admin'
\echo ''
\echo 'Connection URL:'
\echo 'postgresql://' :tenant_name '_admin:PASSWORD@HOST:5432/' :tenant_name '?schema=' :tenant_schema
\echo '======================================'
