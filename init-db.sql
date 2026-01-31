CREATE USER afs_tools_user WITH PASSWORD 'supersecret';
CREATE DATABASE afs_tools_db OWNER afs_tools_user;
GRANT ALL PRIVILEGES ON DATABASE afs_tools_db TO afs_tools_user;
