SELECT 'CREATE DATABASE lotediretor_control OWNER lotediretor'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'lotediretor_control')\gexec

SELECT 'CREATE DATABASE keycloak OWNER lotediretor'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
