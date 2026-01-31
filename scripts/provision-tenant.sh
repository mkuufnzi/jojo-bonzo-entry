#!/bin/bash
# =============================================================================
# POSTGRESQL MULTI-TENANT PROVISIONING SCRIPT
# =============================================================================
# Creates a fully isolated tenant environment with their own:
# - Role (user)
# - Database
# - Schema with proper isolation from public
# - Grants for all table operations
# =============================================================================
# Usage: ./provision-tenant.sh <tenant_name> <password> [db_host] [db_port]
# Example: ./provision-tenant.sh acme_corp "SecurePass123!" localhost 5432
# =============================================================================

set -e

# Configuration
TENANT_NAME=${1:?"Usage: $0 <tenant_name> <password> [db_host] [db_port]"}
TENANT_PASSWORD=${2:?"Password required"}
DB_HOST=${3:-"localhost"}
DB_PORT=${4:-"5432"}
DB_ADMIN_USER=${DB_ADMIN_USER:-"postgres"}

# Derived names
ROLE_NAME="${TENANT_NAME}_admin"
SCHEMA_NAME="${TENANT_NAME}_schema"

echo "======================================"
echo "PostgreSQL Multi-Tenant Provisioning"
echo "======================================"
echo "Tenant: $TENANT_NAME"
echo "Role: $ROLE_NAME"
echo "Schema: $SCHEMA_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "======================================"

# Step 1: Create Role
echo "Step 1: Creating role $ROLE_NAME..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d postgres -c \
  "DO \$\$
   BEGIN
     IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$ROLE_NAME') THEN
       CREATE ROLE $ROLE_NAME WITH LOGIN PASSWORD '$TENANT_PASSWORD';
       RAISE NOTICE 'Created role: $ROLE_NAME';
     ELSE
       RAISE NOTICE 'Role already exists: $ROLE_NAME';
     END IF;
   END
   \$\$;"

# Step 2: Create Database
echo "Step 2: Creating database $TENANT_NAME..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d postgres -c \
  "SELECT 'CREATE DATABASE $TENANT_NAME OWNER $ROLE_NAME' 
   WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$TENANT_NAME');" | \
  grep -q "CREATE DATABASE" && \
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d postgres -c \
  "CREATE DATABASE $TENANT_NAME OWNER $ROLE_NAME;" || \
  echo "Database already exists or created"

# Step 3: Create Schema and configure isolation
echo "Step 3: Creating schema and configuring isolation..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d "$TENANT_NAME" <<EOF
-- Revoke public schema access
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Create tenant schema
CREATE SCHEMA IF NOT EXISTS $SCHEMA_NAME AUTHORIZATION $ROLE_NAME;

-- Set search path
ALTER ROLE $ROLE_NAME SET search_path TO $SCHEMA_NAME;

-- Grant usage on schema
GRANT USAGE ON SCHEMA $SCHEMA_NAME TO $ROLE_NAME;

-- Grant all privileges on existing objects
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA $SCHEMA_NAME TO $ROLE_NAME;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA $SCHEMA_NAME TO $ROLE_NAME;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA $SCHEMA_NAME TO $ROLE_NAME;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA $SCHEMA_NAME GRANT ALL PRIVILEGES ON TABLES TO $ROLE_NAME;
ALTER DEFAULT PRIVILEGES IN SCHEMA $SCHEMA_NAME GRANT ALL PRIVILEGES ON SEQUENCES TO $ROLE_NAME;
ALTER DEFAULT PRIVILEGES IN SCHEMA $SCHEMA_NAME GRANT ALL PRIVILEGES ON FUNCTIONS TO $ROLE_NAME;
EOF

echo ""
echo "======================================"
echo "Tenant Provisioning Complete!"
echo "======================================"
echo ""
echo "Connection Details:"
echo "  Database URL: postgresql://$ROLE_NAME:<PASSWORD>@$DB_HOST:$DB_PORT/$TENANT_NAME?schema=$SCHEMA_NAME"
echo ""
echo "Environment Variables:"
echo "  DB_HOST=$DB_HOST"
echo "  DB_PORT=$DB_PORT"
echo "  DB_NAME=$TENANT_NAME"
echo "  DB_USER=$ROLE_NAME"
echo "  DB_PASSWORD=<your_password>"
echo "  DB_SCHEMA=$SCHEMA_NAME"
echo "  DATABASE_URL=postgresql://$ROLE_NAME:<PASSWORD>@$DB_HOST:$DB_PORT/$TENANT_NAME?schema=$SCHEMA_NAME"
echo ""
echo "======================================"
